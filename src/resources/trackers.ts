/**
 * Trackers are tracking numbers. A source tracker is one number for one
 * marketing source. A session tracker is a pool of numbers that follows a web
 * visitor. Both use the same URLs and differ by `type`, so the SDK splits create
 * and update by type. `createSession` and `createSource` both POST to
 * `/trackers.json`, and each input type holds only the fields its type accepts.
 *
 * `Tracker` is a closed union on `type`. A third tracker type would fail to
 * decode. That is deliberate. Switches over trackers stay exhaustive.
 *
 * `disable` is CallRail's DELETE. It returns 400 when the tracker is the
 * outbound number for form-submission calls.
 */

import { CompanyId, MessageFlowId, SessionTrackerId, SourceTrackerId } from "../ids.js";
import type { AccountId, TrackerId } from "../ids.js";
import {
  array,
  boolean,
  id,
  integer,
  json,
  nullable,
  object,
  oneOf,
  oneOrNone,
  open,
  present,
  selected,
  snakeCase,
  string,
  tagged,
  wire,
  type Decoder,
  type JsonValue,
  type Open,
  type Shape,
} from "../decode.js";
import { v3, type Http, type JsonBody, type RequestOptions } from "../http.js";
import { offsetPages, type OffsetPage, type PagePromise } from "../pagination.js";
import { encodeFields, encodeSort, type OffsetPaging, type Sort } from "../query.js";

/**
 * Which number CallRail should provision.
 * - `local` asks for a number near `near` (usually your business number) and
 *   falls back to nearby area codes. Add `areaCode` to require that area code.
 * - `area_code` asks for any number in `areaCode`.
 * - `toll_free` asks for any toll-free number, or one in `areaCode` (`"888"`).
 * If CallRail has no inventory for a required area code, create fails.
 */
export type NumberRequest =
  | { readonly kind: "local"; readonly near: string; readonly areaCode?: string }
  | { readonly kind: "area_code"; readonly areaCode: string }
  | { readonly kind: "toll_free"; readonly areaCode?: string };

/** A recording is sent with `greeting_text: null`. CallRail ignores the recording unless the text is explicitly null. */
export type Greeting =
  | { readonly text: string; readonly recordingUrl?: never }
  | { readonly recordingUrl: string; readonly text?: never };

/**
 * How calls route. The API can create a basic flow or attach an existing
 * advanced flow by the UUID shown in the app URL after `call-flow/`. Advanced
 * flows are built only in the app.
 */
export type CallFlowInput =
  | {
      readonly type: "basic";
      readonly destinationNumber: string;
      readonly recordingEnabled: boolean;
      /** A recording URL is fetched once and copied into CallRail. */
      readonly greeting?: Greeting;
    }
  | { readonly type: "advanced"; readonly uuid: string };

export type CallFlowStep =
  | {
      readonly type: "dial";
      readonly id: string;
      readonly destinationNumber: string;
      readonly timeout: number | null;
      readonly timeoutStepId: string | null;
    }
  | {
      readonly type: "voicemail";
      readonly id: string;
      readonly promptType: Open<"text" | "recording">;
      readonly promptText: string | null;
      readonly promptRecordingId: string | null;
      readonly transcribe: boolean;
    }
  | {
      readonly type: "menu";
      readonly id: string;
      readonly promptType: Open<"text" | "recording">;
      readonly promptText: string | null;
      readonly promptRecordingId: string | null;
      readonly menuOptions: readonly {
        readonly key: string;
        readonly description: string | null;
        readonly nextStepId: string | null;
      }[];
    }
  | { readonly type: "other"; readonly wireType: string; readonly id: string; readonly raw: JsonValue };

/** A call flow as CallRail returns it. A basic flow reads back in the same shape it is written. */
export type CallFlow =
  | {
      readonly type: "basic";
      readonly destinationNumber: string;
      readonly recordingEnabled: boolean;
      /** When both were stored, CallRail uses the text, and so does the decoder. */
      readonly greeting: Greeting | null;
    }
  | {
      readonly type: "advanced";
      readonly recordingEnabled: boolean;
      readonly initialStepId: string | null;
      readonly steps: readonly CallFlowStep[];
    };

export type MessageFlowAssignment =
  | { readonly type: "auto-reply"; readonly message: string }
  | { readonly type: "advanced"; readonly id: MessageFlowId };

/** A message flow needs texting on. `messageFlow: null` removes the current flow or auto-reply. */
export type TrackerTexting =
  | { readonly smsEnabled?: false; readonly messageFlow?: never }
  | { readonly smsEnabled: true; readonly messageFlow?: MessageFlowAssignment | null };

export type SearchType = "paid" | "organic";

/**
 * Which web visitors see the session pool. `"all"` is the common case. Rules
 * match search engines by paid or organic, landing-page substrings, and
 * referrer substrings. `inverted` flips the match.
 */
export type SessionSource =
  | "all"
  | {
      readonly google?: readonly SearchType[];
      readonly bing?: readonly SearchType[];
      readonly yahoo?: readonly SearchType[];
      readonly landing?: readonly string[];
      readonly referrer?: readonly string[];
      /** Include direct visitors. Sent as `"type": "direct"`. */
      readonly direct?: boolean;
      readonly inverted?: boolean;
    };

/** Who sees a source tracker's number. `offline` is never swapped onto a web page. */
export type SourceTrackerSource =
  | { readonly type: "all" }
  | { readonly type: "landing_url"; readonly landing: string }
  | { readonly type: "landing_params"; readonly landing: string }
  | { readonly type: "offline" }
  | { readonly type: "web_referrer"; readonly referrer: string }
  | { readonly type: "direct" }
  | {
      readonly type: "search";
      readonly searchEngine: "google" | "bing" | "yahoo" | "all";
      readonly searchType: "paid" | "organic" | "all";
    }
  | { readonly type: "google_ad_extension" }
  | { readonly type: "mobile_ad_extension" }
  | { readonly type: "google_my_business" };

interface TrackerCommon {
  readonly name: string;
  readonly status: Open<"active" | "disabled">;
  readonly destinationNumber: string | null;
  readonly trackingNumbers: readonly string[];
  /** Played to the person answering. `[source]` is replaced with the caller's source. */
  readonly whisperMessage: string | null;
  readonly smsEnabled: boolean;
  /** Whether `smsEnabled` could be true for this number. */
  readonly smsSupported: boolean;
  readonly company: { readonly id: CompanyId; readonly name: string };
  readonly callFlow: CallFlow;
  readonly messageFlow: MessageFlowAssignment | null;
  readonly createdAt: string;
  readonly disabledAt: string | null;
}

export interface SessionTrackerBase extends TrackerCommon {
  readonly type: "session";
  readonly id: SessionTrackerId;
  readonly source: SessionSource;
}

export interface SourceTrackerBase extends TrackerCommon {
  readonly type: "source";
  readonly id: SourceTrackerId;
  readonly source: SourceTrackerSource;
}

export interface TrackerExtras {
  readonly campaignName: string | null;
  /** CSS selectors or numbers that swap.js replaces on the page. */
  readonly swapTargets: readonly string[] | null;
}

export type TrackerField = keyof TrackerExtras;
export type SessionTracker<F extends TrackerField = never> = SessionTrackerBase & Pick<TrackerExtras, F>;
export type SourceTracker<F extends TrackerField = never> = SourceTrackerBase & Pick<TrackerExtras, F>;
export type Tracker<F extends TrackerField = never> = SessionTracker<F> | SourceTracker<F>;

export type TrackerType = Tracker["type"];

export interface TrackerListQuery<F extends TrackerField, T extends TrackerType> extends OffsetPaging {
  readonly companyId?: CompanyId;
  /** Narrows the result type too. */
  readonly type?: T;
  readonly status?: "active" | "disabled";
  readonly search?: string;
  readonly sort?: Sort<"name">;
  readonly fields?: readonly F[];
}

interface TrackerInputCommon {
  readonly name: string;
  readonly companyId: CompanyId;
  readonly callFlow: CallFlowInput;
  readonly whisperMessage?: string;
  readonly swapTargets?: readonly string[];
}

export type SessionTrackerInput = TrackerInputCommon &
  TrackerTexting & {
    /** 4 to 50. Checked before sending. */
    readonly poolSize: number;
    readonly poolNumbers: NumberRequest;
    readonly source: SessionSource;
  };

export type SourceTrackerInput = TrackerInputCommon &
  TrackerTexting & {
    readonly trackingNumber: NumberRequest;
    readonly source: SourceTrackerSource;
    /** Sets `utm_campaign` on calls to this number. */
    readonly campaignName?: string;
  };

interface TrackerUpdateCommon {
  readonly name?: string;
  readonly whisperMessage?: string | null;
  readonly swapTargets?: readonly string[];
  readonly callFlow?: CallFlowInput;
  /** A tracking number on this tracker to exchange for a new one. */
  readonly replaceTrackingNumber?: string;
}

export type SessionTrackerUpdate = TrackerUpdateCommon &
  TrackerTexting & {
    readonly poolSize?: number;
    readonly source?: SessionSource;
  };

export type SourceTrackerUpdate = TrackerUpdateCommon &
  TrackerTexting & {
    readonly source?: SourceTrackerSource;
    readonly campaignName?: string;
  };

type Of<U extends { readonly type: string }, T extends U["type"]> = Extract<U, { readonly type: T }>;

/** Call flow ids arrive as integers (`344126405`) and as strings (`"CRS…"`). Both decode to a string. */
const callFlowId = id(String);

const otherCallFlowStep = object({ wireType: wire("type", string), id: callFlowId });

const callFlowStep = tagged<Exclude<CallFlowStep, Of<CallFlowStep, "other">>, Of<CallFlowStep, "other">>(
  "type",
  {
    dial: object<Of<CallFlowStep, "dial">>({
      type: oneOf("dial"),
      id: callFlowId,
      destinationNumber: string,
      timeout: nullable(integer),
      timeoutStepId: nullable(callFlowId),
    }),
    voicemail: object<Of<CallFlowStep, "voicemail">>({
      type: oneOf("voicemail"),
      id: callFlowId,
      promptType: open("text", "recording"),
      promptText: nullable(string),
      promptRecordingId: nullable(callFlowId),
      transcribe: boolean,
    }),
    menu: object<Of<CallFlowStep, "menu">>({
      type: oneOf("menu"),
      id: callFlowId,
      promptType: open("text", "recording"),
      promptText: nullable(string),
      promptRecordingId: nullable(callFlowId),
      menuOptions: array(object({ key: string, description: nullable(string), nextStepId: nullable(callFlowId) })),
    }),
  },
  (input, path) => ({ type: "other", ...otherCallFlowStep(input, path), raw: json(input, path) }),
);

function greeting(text: string | null, recordingUrl: string | null): Greeting | null {
  if (text !== null) return { text };
  return recordingUrl === null ? null : { recordingUrl };
}

const basicCallFlow = object({
  destinationNumber: string,
  recordingEnabled: boolean,
  greetingText: nullable(string),
  greetingRecordingUrl: nullable(string),
});

const callFlow = tagged<CallFlow>("type", {
  basic: (input, path) => {
    const { destinationNumber, recordingEnabled, greetingText, greetingRecordingUrl } = basicCallFlow(input, path);
    return { type: "basic", destinationNumber, recordingEnabled, greeting: greeting(greetingText, greetingRecordingUrl) };
  },
  advanced: object<Of<CallFlow, "advanced">>({
    type: oneOf("advanced"),
    recordingEnabled: boolean,
    initialStepId: nullable(callFlowId),
    steps: array(callFlowStep),
  }),
});

const messageFlowAssignment = tagged<MessageFlowAssignment>("type", {
  "auto-reply": object<Of<MessageFlowAssignment, "auto-reply">>({ type: oneOf("auto-reply"), message: string }),
  advanced: object<Of<MessageFlowAssignment, "advanced">>({ type: oneOf("advanced"), id: id(MessageFlowId) }),
});

const searchTypes = array(oneOf("paid", "organic"));
const sessionRules = present<object, Required<Omit<Exclude<SessionSource, "all">, "direct">>>(
  {},
  {
    google: searchTypes,
    bing: searchTypes,
    yahoo: searchTypes,
    landing: array(string),
    referrer: array(string),
    inverted: boolean,
  },
);
const sessionSourceType = object({ type: nullable(oneOf("all", "direct")) });

/** CallRail reads `"all"` back as `{ "type": "all" }`, and `direct` as `"type": "direct"` beside the rules. */
const sessionSource: Decoder<SessionSource> = (input, path) => {
  const { type } = sessionSourceType(input, path);
  if (type === "all") return "all";
  return type === "direct" ? { ...sessionRules(input, path), direct: true } : sessionRules(input, path);
};

const sourceTrackerSource = tagged<SourceTrackerSource>("type", {
  all: object({ type: oneOf("all") }),
  landing_url: object({ type: oneOf("landing_url"), landing: string }),
  landing_params: object({ type: oneOf("landing_params"), landing: string }),
  offline: object({ type: oneOf("offline") }),
  web_referrer: object({ type: oneOf("web_referrer"), referrer: string }),
  direct: object({ type: oneOf("direct") }),
  search: object({
    type: oneOf("search"),
    searchEngine: oneOf("google", "bing", "yahoo", "all"),
    searchType: oneOf("paid", "organic", "all"),
  }),
  google_ad_extension: object({ type: oneOf("google_ad_extension") }),
  mobile_ad_extension: object({ type: oneOf("mobile_ad_extension") }),
  google_my_business: object({ type: oneOf("google_my_business") }),
});

const trackerShape = {
  name: string,
  status: open("active", "disabled"),
  destinationNumber: nullable(string),
  trackingNumbers: array(string),
  whisperMessage: nullable(string),
  smsEnabled: boolean,
  smsSupported: boolean,
  company: object({ id: id(CompanyId), name: string }),
  callFlow,
  messageFlow: oneOrNone(messageFlowAssignment),
  createdAt: string,
  disabledAt: nullable(string),
} satisfies Shape<TrackerCommon>;

const sessionShape = {
  ...trackerShape,
  type: oneOf("session"),
  id: id(SessionTrackerId),
  source: sessionSource,
} satisfies Shape<SessionTrackerBase>;

const sourceShape = {
  ...trackerShape,
  type: oneOf("source"),
  id: id(SourceTrackerId),
  source: sourceTrackerSource,
} satisfies Shape<SourceTrackerBase>;

const extrasShape = { campaignName: nullable(string), swapTargets: nullable(array(string)) } satisfies Shape<TrackerExtras>;

const sessionTracker = object<SessionTrackerBase>(sessionShape);
const sourceTracker = object<SourceTrackerBase>(sourceShape);

function tracker<F extends TrackerField, T extends TrackerType>(
  fields: readonly F[] | undefined,
  only: T,
): Decoder<Extract<Tracker<F>, { readonly type: T }>>;
function tracker<F extends TrackerField>(fields: readonly F[] | undefined): Decoder<Tracker<F>>;
function tracker<F extends TrackerField>(
  fields: readonly F[] | undefined,
  only?: TrackerType,
): Decoder<Tracker<F>> {
  const session = selected(sessionShape, extrasShape, fields);
  const source = selected(sourceShape, extrasShape, fields);
  const variants: { [K in TrackerType]: Decoder<Extract<Tracker<F>, { readonly type: K }>> } = {
    session: tagged("type", { session }),
    source: tagged("type", { source }),
  };
  return only === undefined ? tagged("type", { session, source }) : variants[only];
}

function encodeNumberRequest(request: NumberRequest): JsonBody {
  switch (request.kind) {
    case "local":
      return { local: request.near, area_code: request.areaCode };
    case "area_code":
      return { area_code: request.areaCode };
    case "toll_free":
      return { toll_free: true, area_code: request.areaCode };
  }
}

function encodeCallFlow(flow: CallFlowInput): JsonBody {
  if (flow.type === "advanced") return { type: "advanced", uuid: flow.uuid };
  return {
    type: "basic",
    destination_number: flow.destinationNumber,
    recording_enabled: flow.recordingEnabled,
    greeting_text: flow.greeting === undefined ? undefined : (flow.greeting.text ?? null),
    greeting_recording_url: flow.greeting?.recordingUrl,
  };
}

function encodeTexting(texting: TrackerTexting): JsonBody {
  return { sms_enabled: texting.smsEnabled, message_flow: texting.messageFlow };
}

function encodeSessionSource(source: SessionSource): JsonBody | "all" {
  if (source === "all") return "all";
  return {
    google: source.google,
    bing: source.bing,
    yahoo: source.yahoo,
    landing: source.landing,
    referrer: source.referrer,
    type: source.direct ? "direct" : undefined,
    inverted: source.inverted,
  };
}

function encodeSourceTrackerSource(source: SourceTrackerSource): JsonBody {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [snakeCase(key), value]));
}

function encodeInputCommon(input: TrackerInputCommon): JsonBody {
  return {
    name: input.name,
    company_id: input.companyId,
    call_flow: encodeCallFlow(input.callFlow),
    whisper_message: input.whisperMessage,
    swap_targets: input.swapTargets,
  };
}

function encodeUpdateCommon(changes: TrackerUpdateCommon): JsonBody {
  return {
    name: changes.name,
    // CallRail clears a whisper message with `""` and reads it back as `null`.
    whisper_message: changes.whisperMessage === null ? "" : changes.whisperMessage,
    swap_targets: changes.swapTargets,
    call_flow: changes.callFlow === undefined ? undefined : encodeCallFlow(changes.callFlow),
    replace_tracking_number: changes.replaceTrackingNumber,
  };
}

function checkPoolSize(poolSize: number): number {
  if (Number.isInteger(poolSize) && poolSize >= 4 && poolSize <= 50) return poolSize;
  throw new TypeError(`poolSize must be a whole number from 4 to 50. Got ${poolSize}.`);
}

export class Trackers {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/trackers.json`. */
  list<const F extends TrackerField = never>(
    query: TrackerListQuery<F, "session"> & { readonly type: "session" } & RequestOptions,
  ): PagePromise<OffsetPage<SessionTracker<F>>>;
  list<const F extends TrackerField = never>(
    query: TrackerListQuery<F, "source"> & { readonly type: "source" } & RequestOptions,
  ): PagePromise<OffsetPage<SourceTracker<F>>>;
  list<const F extends TrackerField = never>(
    query?: TrackerListQuery<F, TrackerType> & RequestOptions,
  ): PagePromise<OffsetPage<Tracker<F>>>;
  list<const F extends TrackerField = never>(
    query: TrackerListQuery<F, TrackerType> & RequestOptions = {},
  ): PagePromise<OffsetPage<Tracker<F>>> {
    const type = query.type;
    const item: Decoder<Tracker<F>> = type === undefined ? tracker(query.fields) : tracker(query.fields, type);
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/trackers.json`,
        query: {
          company_id: query.companyId,
          type,
          status: query.status,
          search: query.search,
          ...encodeSort(query.sort),
          ...encodeFields(query.fields),
          page: query.page,
          per_page: query.perPage,
        },
      },
      "trackers",
      item,
      query,
    );
  }

  /** `GET /v3/a/{account_id}/trackers/{tracker_id}.json`. */
  get<const F extends TrackerField = never>(
    id: TrackerId,
    options: { readonly fields?: readonly F[] } & RequestOptions = {},
  ): Promise<Tracker<F>> {
    return this.#http.json(
      { method: "GET", path: v3`a/${this.#accountId}/trackers/${id}.json`, query: encodeFields(options.fields) },
      tracker(options.fields),
      options,
    );
  }

  /** `POST /v3/a/{account_id}/trackers.json` with `type: "session"`. */
  createSession(input: SessionTrackerInput, options?: RequestOptions): Promise<SessionTracker> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/trackers.json`,
        body: {
          kind: "json",
          value: {
            type: "session",
            ...encodeInputCommon(input),
            ...encodeTexting(input),
            pool_size: checkPoolSize(input.poolSize),
            pool_numbers: encodeNumberRequest(input.poolNumbers),
            source: encodeSessionSource(input.source),
          },
        },
      },
      sessionTracker,
      options,
    );
  }

  /** `POST /v3/a/{account_id}/trackers.json` with `type: "source"`. */
  createSource(input: SourceTrackerInput, options?: RequestOptions): Promise<SourceTracker> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/trackers.json`,
        body: {
          kind: "json",
          value: {
            type: "source",
            ...encodeInputCommon(input),
            ...encodeTexting(input),
            tracking_number: encodeNumberRequest(input.trackingNumber),
            source: encodeSourceTrackerSource(input.source),
            campaign_name: input.campaignName,
          },
        },
      },
      sourceTracker,
      options,
    );
  }

  /** `PUT /v3/a/{account_id}/trackers/{tracker_id}.json` for a session tracker. */
  updateSession(id: SessionTrackerId, changes: SessionTrackerUpdate, options?: RequestOptions): Promise<SessionTracker> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/trackers/${id}.json`,
        body: {
          kind: "json",
          value: {
            ...encodeUpdateCommon(changes),
            ...encodeTexting(changes),
            pool_size: changes.poolSize,
            source: changes.source === undefined ? undefined : encodeSessionSource(changes.source),
          },
        },
      },
      sessionTracker,
      options,
    );
  }

  /** `PUT /v3/a/{account_id}/trackers/{tracker_id}.json` for a source tracker. */
  updateSource(id: SourceTrackerId, changes: SourceTrackerUpdate, options?: RequestOptions): Promise<SourceTracker> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/trackers/${id}.json`,
        body: {
          kind: "json",
          value: {
            ...encodeUpdateCommon(changes),
            ...encodeTexting(changes),
            source: changes.source === undefined ? undefined : encodeSourceTrackerSource(changes.source),
            campaign_name: changes.campaignName,
          },
        },
      },
      sourceTracker,
      options,
    );
  }

  /** `DELETE /v3/a/{account_id}/trackers/{tracker_id}.json`. 204. */
  disable(id: TrackerId, options?: RequestOptions): Promise<void> {
    return this.#http.empty({ method: "DELETE", path: v3`a/${this.#accountId}/trackers/${id}.json` }, options);
  }
}
