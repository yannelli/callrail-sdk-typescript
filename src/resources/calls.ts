/**
 * The calls resource covers list (offset or relative), get, outbound create,
 * update, summary, timeseries, recording, and page views.
 *
 * Field selection is typed. `fields: ["source", "tags"]` makes `call.source`
 * and `call.tags` exist on the result type, as `T | null`. Fields you did not
 * request are absent at runtime too, so the type and the object agree. The SDK
 * sends `fields` as CallRail's comma-separated snake_case list.
 */

import { CallId, CompanyId, PersonId, TrackerId } from "../ids.js";
import type { AccountId, OutboundCallerNumber, UserId } from "../ids.js";
import {
  array,
  boolean,
  dict,
  emptyAsNull,
  falseWhenMissing,
  id,
  integer,
  json,
  listOrEmpty,
  money,
  nullable,
  number,
  object,
  open,
  selected,
  string,
  wire,
  type Decoder,
  type JsonValue,
  type Open,
  type Shape,
} from "../decode.js";
import { v3, type Endpoint, type Http, type Query, type RequestOptions } from "../http.js";
import { offsetPages, relativePages, type OffsetPage, type PagePromise, type RelativePage } from "../pagination.js";
import {
  encodeDateFilter,
  encodeFields,
  encodeMoney,
  encodeSort,
  encodeTagChange,
  type DateFilter,
  type OffsetPaging,
  type Sort,
  type TagChange,
} from "../query.js";

export type LeadStatus = Open<"good_lead" | "not_a_lead" | "previously_marked_good_lead">;

/** Present on every call, in every response. */
export interface CallBase {
  readonly id: CallId;
  readonly answered: boolean;
  readonly businessPhoneNumber: string | null;
  readonly customerCity: string | null;
  readonly customerCountry: string | null;
  readonly customerName: string | null;
  /** E.164. */
  readonly customerPhoneNumber: string | null;
  readonly customerState: string | null;
  readonly direction: Open<"inbound" | "outbound">;
  /** Seconds. */
  readonly duration: number | null;
  /** URL of this call's recording endpoint, not audio. Use `calls.recording(id)` for the playable URL. */
  readonly recording: string | null;
  /** Seconds. Examples send a string, the table says integer. Decoded as a number either way. */
  readonly recordingDuration: number | null;
  readonly recordingPlayer: string | null;
  /** ISO 8601 with the offset of the requested time zone. Kept as a string so the offset survives. */
  readonly startTime: string;
  /** E.164. */
  readonly trackingPhoneNumber: string | null;
  readonly voicemail: boolean;
}

export interface AttributionTouch {
  readonly eventDate: string;
  readonly adPosition: string | null;
  readonly campaign: string | null;
  readonly device: string | null;
  readonly keywords: string | null;
  readonly landing: string | null;
  readonly landingPageUrlParams: Readonly<Record<string, string>>;
  readonly matchType: string | null;
  readonly medium: string | null;
  readonly referrer: string | null;
  readonly referrerUrlParams: Readonly<Record<string, string>>;
  readonly sessionBrowser: string | null;
  readonly urlUtmParams: Readonly<Record<string, string>>;
  readonly source: string | null;
}

export interface Milestones {
  readonly firstTouch: AttributionTouch | null;
  readonly leadCreated: AttributionTouch | null;
  readonly qualified: AttributionTouch | null;
  readonly lastTouch: AttributionTouch | null;
}

export type Speaker = Open<"caller" | "agent">;

export interface SpottedKeyword {
  readonly keyword: string;
  readonly locations: readonly { readonly speaker: Speaker; readonly start: number }[];
}

export interface TranscriptPhrase {
  readonly speaker: Speaker;
  readonly phrase: string;
  /** Seconds from the start of the recording. */
  readonly start: number;
}

export interface VoiceAssistMessage {
  /** `question -> answer`. */
  readonly contents: Readonly<Record<string, string>>;
  /** `question -> override`, when a user corrected an AI answer. */
  readonly overrides: Readonly<Record<string, string>> | null;
  readonly recordedAt: string | null;
  readonly urgency: string | null;
}

/** The docs show one `{ name, value }` object. The decoder also accepts an array and always returns one. */
export interface KeypadEntry {
  readonly name: string;
  readonly value: string;
}

/**
 * Every field `fields` can add. Each is `T | null` when requested, because
 * CallRail returns `null` for data a call does not have (session-tracker fields on a
 * source-tracker call, transcripts without a Conversation Intelligence plan).
 */
export interface CallExtras {
  readonly agentEmail: string | null;
  readonly callHighlights: readonly string[] | null;
  /** A string on list, an array of sentences on get. Kept as the documented union. */
  readonly callSummary: string | readonly string[] | null;
  /** The docs spell one value `abandonded`. Both spellings decode. */
  readonly callType: Open<
    "abandoned" | "answered" | "in_progress" | "missed" | "outbound" | "voicemail" | "voicemail_transcription"
  > | null;
  readonly campaign: string | null;
  readonly companyId: CompanyId | null;
  readonly companyName: string | null;
  readonly companyTimeZone: string | null;
  readonly createdAt: string | null;
  /** Cookies captured by the Custom Cookie Capture integration. Keys verbatim. */
  readonly custom: Readonly<Record<string, string>> | null;
  readonly deviceType: Open<"mobile" | "desktop"> | null;
  readonly fbclid: string | null;
  readonly firstCall: boolean | null;
  readonly formattedCallType: string | null;
  readonly formattedCustomerLocation: string | null;
  readonly formattedBusinessPhoneNumber: string | null;
  readonly formattedCustomerName: string | null;
  readonly formattedCustomerNameOrPhoneNumber: string | null;
  readonly formattedCustomerPhoneNumber: string | null;
  readonly formattedDuration: string | null;
  readonly formattedTrackingPhoneNumber: string | null;
  readonly formattedTrackingSource: string | null;
  readonly formattedValue: string | null;
  readonly ga: string | null;
  readonly gclid: string | null;
  /** Documented as an integer. Branded as a call id so it can be passed to `calls.get`. */
  readonly goodLeadCallId: CallId | null;
  readonly goodLeadCallTime: string | null;
  readonly keypadEntries: readonly KeypadEntry[] | null;
  readonly keywords: string | null;
  readonly keywordsSpotted: readonly SpottedKeyword[] | null;
  readonly landingPageUrl: string | null;
  readonly lastRequestedUrl: string | null;
  readonly leadStatus: LeadStatus | null;
  readonly medium: string | null;
  readonly milestones: Milestones | null;
  readonly msclkid: string | null;
  readonly note: string | null;
  /** `"anonymous"` on the wire decodes to `null`. */
  readonly personId: PersonId | null;
  readonly priorCalls: number | null;
  readonly referrerDomain: string | null;
  readonly referringUrl: string | null;
  readonly sentiment: string | null;
  readonly sessionUuid: string | null;
  readonly source: string | null;
  readonly sourceName: string | null;
  /** Share of talk time by speaker. Keys verbatim. */
  readonly speakerPercent: Readonly<Record<string, number>> | null;
  /** Tag names. Tag objects on the wire are reduced to their names, which is what `update` takes. */
  readonly tags: readonly string[] | null;
  readonly timelineUrl: string | null;
  readonly totalCalls: number | null;
  readonly trackerId: TrackerId | null;
  readonly transcription: string | null;
  readonly utmCampaign: string | null;
  readonly utmContent: string | null;
  readonly utmMedium: string | null;
  readonly utmSource: string | null;
  readonly utmTerm: string | null;
  /** Dollars. REST sends `"$1.00"` and webhooks send `""` for no value. */
  readonly value: number | null;
  readonly voiceAssistMessage: VoiceAssistMessage | null;
  /** Two image URLs, present only for recorded calls. */
  readonly waveforms: readonly string[] | null;
  readonly zipCode: readonly string[] | null;
  readonly leadScore: string | null;
  readonly leadExplanation: string | null;
  /** `calls.get` only. */
  readonly conversationalTranscript: readonly TranscriptPhrase[] | null;
  /** `calls.get` only. */
  readonly integrationData: readonly { readonly integration: string; readonly data: JsonValue }[] | null;
}

export type CallField = keyof CallExtras;
export type CallListField = Exclude<CallField, "conversationalTranscript" | "integrationData">;

export type Call<F extends CallField = never> = CallBase & Pick<CallExtras, F>;

export type CallSortField =
  | "customerName"
  | "customerPhoneNumber"
  | "duration"
  | "startTime"
  | "source"
  | "customerCity"
  | "customerCountry"
  | "landingPageUrl"
  | "deviceType"
  | "answered"
  | "firstCall"
  | "sourceName"
  | "leadStatus"
  | "tags";

export interface CallListFilters {
  readonly companyId?: CompanyId;
  readonly trackerId?: TrackerId;
  readonly callType?: "first_call" | "missed" | "voicemails" | "inbound" | "outbound";
  readonly answerStatus?: "answered" | "missed" | "voicemail";
  readonly device?: "desktop" | "mobile";
  readonly direction?: "inbound" | "outbound";
  readonly leadStatus?: "good_lead" | "not_a_lead" | "not_scored";
  /** Calls carrying any of these tag names. */
  readonly tags?: readonly string[];
  /** One term, matched against numbers, customer name, note, and source. */
  readonly search?: string;
  readonly sort?: Sort<CallSortField>;
  /** At most 250. */
  readonly perPage?: number;
}

type CallListBase<F extends CallListField> = DateFilter & CallListFilters & { readonly fields?: readonly F[] };

export type OffsetCallListQuery<F extends CallListField = never> = CallListBase<F> & {
  readonly pagination?: "offset";
  readonly page?: number;
  readonly offset?: never;
};

export type RelativeCallListQuery<F extends CallListField = never> = CallListBase<F> & {
  readonly pagination: "relative";
  /** 0-based page to start from. */
  readonly offset?: number;
  readonly page?: never;
};

/** Sent as `outbound_greeting_text` or as `outbound_greeting_recording_url`, never both. */
export type OutboundGreeting =
  | { readonly text: string; readonly recordingUrl?: never }
  | { readonly recordingUrl: string; readonly text?: never };

export interface OutboundCallInput {
  /**
   * The 10-digit tracking number or verified external number the customer sees.
   * Sent as the integer `caller_id`. Not the `id` of an outbound caller id record.
   */
  readonly callerId: OutboundCallerNumber;
  readonly customerPhoneNumber: string;
  /** The number CallRail rings first. When it answers, CallRail dials the customer. */
  readonly businessPhoneNumber: string;
  readonly recordingEnabled?: boolean;
  readonly greeting?: OutboundGreeting;
  readonly agentId?: UserId;
}

/** Omitted keys stay as they are. `null` clears. */
export interface CallUpdate {
  readonly note?: string | null;
  readonly tags?: TagChange;
  /** Dollars. Sent as a two-decimal string. */
  readonly value?: number | null;
  /** `previously_marked_good_lead` is set by CallRail and cannot be sent. */
  readonly leadStatus?: "good_lead" | "not_a_lead" | null;
  readonly customerName?: string | null;
  /** Marking spam cannot be undone through the API, so `false` does not exist. */
  readonly spam?: true;
}

export interface CallMetrics {
  readonly totalCalls: number;
  readonly missedCalls: number;
  readonly answeredCalls: number;
  readonly firstTimeCallers: number;
  /** Seconds. */
  readonly averageDuration: number;
  readonly formattedAverageDuration: string;
  readonly leads: number;
}

export type CallMetricField = Exclude<keyof CallMetrics, "totalCalls">;

export type SelectedCallMetrics<F extends CallMetricField> = Pick<Omit<CallMetrics, "totalCalls">, F> & {
  readonly totalCalls: number;
};

export type CallGroupBy = "source" | "keywords" | "campaign" | "referrer" | "landing_page";

export interface CallMetricFilters {
  readonly device?: "desktop" | "mobile" | "all";
  /** Seconds. */
  readonly minDuration?: number;
  /** Seconds. */
  readonly maxDuration?: number;
  readonly tags?: readonly string[];
  readonly trackerIds?: readonly TrackerId[];
  readonly direction?: "inbound" | "outbound" | "all";
  readonly answerStatus?: "answered" | "missed" | "voicemail" | "all";
  readonly firstTimeCallers?: boolean;
  readonly leadStatus?: "good_lead" | "not_a_lead" | "not_scored";
  /** Sent as `agent`. */
  readonly agentId?: UserId;
}

/** Grouping by company exists only at account level, so it cannot be combined with `companyId`. */
export type CallSummaryScope =
  | { readonly companyId: CompanyId; readonly groupBy?: CallGroupBy }
  | { readonly companyId?: never; readonly groupBy?: CallGroupBy | "company" | "company_id" };

export type CallSummaryQuery<F extends CallMetricField = never> = DateFilter &
  CallSummaryScope &
  CallMetricFilters & { readonly fields?: readonly F[]; readonly search?: string };

export interface CallSummary<F extends CallMetricField = never> {
  readonly startDate: string;
  readonly endDate: string;
  readonly timeZone: string;
  readonly total: SelectedCallMetrics<F>;
  /** `null` when the query had no `groupBy`. */
  readonly groupedBy: string | null;
  /** Empty when the query had no `groupBy`. */
  readonly groups: readonly (SelectedCallMetrics<F> & { readonly key: string })[];
}

export type CallTimeseriesQuery<F extends CallMetricField = never> = DateFilter &
  CallMetricFilters & {
    readonly companyId?: CompanyId;
    readonly fields?: readonly F[];
    /** Defaults to `day`. CallRail returns at most 200 points. */
    readonly interval?: "hour" | "day" | "week" | "month" | "year";
    /** Matches `source`. CallRail does not search the other timeseries fields. */
    readonly search?: string;
  };

export interface CallTimeseries<F extends CallMetricField = never> {
  readonly startDate: string;
  readonly endDate: string;
  readonly timeZone: string;
  readonly total: SelectedCallMetrics<F>;
  /** `date` is `YYYY-MM-DD`, or a full timestamp for hourly intervals. */
  readonly points: readonly (SelectedCallMetrics<F> & { readonly date: string })[];
}

export interface CallRecording {
  /**
   * A stable CallRail link, except on HIPAA accounts, where it is a temporary
   * S3 link that expires in about 24 hours. Do not store it on HIPAA accounts.
   */
  readonly url: string;
}

export interface PageView {
  readonly pageUrl: string;
  readonly referrerUrl: string | null;
  readonly createdAt: string;
}

/** @internal */
export const callBaseShape = {
  id: id(CallId),
  answered: boolean,
  businessPhoneNumber: nullable(string),
  customerCity: nullable(string),
  customerCountry: nullable(string),
  customerName: nullable(string),
  customerPhoneNumber: nullable(string),
  customerState: nullable(string),
  direction: open("inbound", "outbound"),
  duration: emptyAsNull(integer),
  recording: nullable(string),
  recordingDuration: emptyAsNull(integer),
  recordingPlayer: nullable(string),
  startTime: string,
  trackingPhoneNumber: nullable(string),
  voicemail: boolean,
} satisfies Shape<CallBase>;

/**
 * @internal
 * For calls that have not ended: the outbound-call response and the pre-call
 * and answered-call webhooks. The outbound example sends `"answered": null`.
 */
export const inProgressCallShape = {
  ...callBaseShape,
  answered: falseWhenMissing,
  voicemail: falseWhenMissing,
} satisfies Shape<CallBase>;

/** @internal */
export const leadStatus: Decoder<LeadStatus | null> = nullable(
  open("good_lead", "not_a_lead", "previously_marked_good_lead"),
);

const urlParams = dict(string);

/** @internal */
export const milestones: Decoder<Milestones> = (() => {
  const attributionTouch = object<AttributionTouch>({
    eventDate: string,
    adPosition: nullable(string),
    campaign: nullable(string),
    device: nullable(string),
    keywords: nullable(string),
    landing: nullable(string),
    landingPageUrlParams: urlParams,
    matchType: nullable(string),
    medium: nullable(string),
    referrer: nullable(string),
    referrerUrlParams: urlParams,
    sessionBrowser: nullable(string),
    urlUtmParams: urlParams,
    source: nullable(string),
  });
  const eventDate = object({ eventDate: nullable(string) });
  // A milestone that has not happened arrives as an object of nulls, `"event_date": null` included.
  const touch = emptyAsNull((input, path) =>
    eventDate(input, path).eventDate === null ? null : attributionTouch(input, path),
  );
  return object<Milestones>({ firstTouch: touch, leadCreated: touch, qualified: touch, lastTouch: touch });
})();

/** @internal `"anonymous"` means CallRail has not matched the interaction to a person. */
export const personId: Decoder<PersonId | null> = (input, path) =>
  input === "anonymous" ? null : emptyAsNull(id(PersonId))(input, path);

const speaker = open("caller", "agent");

/** @internal Calls and leads send tag objects, SMS threads send names. Both decode to the name. */
export const tagName: Decoder<string> = (input, path) =>
  typeof input === "string" ? input : object({ name: string })(input, path).name;

const keypadEntry = object<KeypadEntry>({ name: string, value: string });

const keypadEntries: Decoder<readonly KeypadEntry[]> = (input, path) =>
  Array.isArray(input) ? array(keypadEntry)(input, path) : [keypadEntry(input, path)];

const textOrSentences: Decoder<string | readonly string[]> = (input, path) =>
  Array.isArray(input) ? array(string)(input, path) : string(input, path);

const callType: Decoder<CallExtras["callType"]> = nullable((input, path) => {
  const value = string(input, path);
  return value === "abandonded" ? "abandoned" : value;
});

/** @internal */
export const callExtrasShape = {
  agentEmail: nullable(string),
  callHighlights: emptyAsNull(array(string)),
  callSummary: nullable(textOrSentences),
  callType,
  campaign: nullable(string),
  companyId: emptyAsNull(id(CompanyId)),
  companyName: nullable(string),
  companyTimeZone: nullable(string),
  createdAt: nullable(string),
  custom: emptyAsNull(dict(string)),
  deviceType: nullable(open("mobile", "desktop")),
  fbclid: nullable(string),
  firstCall: emptyAsNull(boolean),
  formattedCallType: nullable(string),
  formattedCustomerLocation: nullable(string),
  formattedBusinessPhoneNumber: nullable(string),
  formattedCustomerName: nullable(string),
  formattedCustomerNameOrPhoneNumber: nullable(string),
  formattedCustomerPhoneNumber: nullable(string),
  formattedDuration: nullable(string),
  formattedTrackingPhoneNumber: nullable(string),
  formattedTrackingSource: nullable(string),
  formattedValue: nullable(string),
  ga: nullable(string),
  gclid: nullable(string),
  goodLeadCallId: emptyAsNull(id(CallId)),
  goodLeadCallTime: nullable(string),
  keypadEntries: emptyAsNull(keypadEntries),
  keywords: nullable(string),
  keywordsSpotted: emptyAsNull(
    array(
      object<SpottedKeyword>({
        keyword: string,
        locations: array(object({ speaker, start: number })),
      }),
    ),
  ),
  landingPageUrl: nullable(string),
  lastRequestedUrl: nullable(string),
  leadStatus,
  medium: nullable(string),
  milestones: emptyAsNull(milestones),
  msclkid: nullable(string),
  note: nullable(string),
  personId,
  priorCalls: emptyAsNull(integer),
  referrerDomain: nullable(string),
  referringUrl: nullable(string),
  sentiment: nullable(string),
  sessionUuid: nullable(string),
  source: nullable(string),
  sourceName: nullable(string),
  speakerPercent: emptyAsNull(dict(number)),
  tags: emptyAsNull(array(tagName)),
  timelineUrl: nullable(string),
  totalCalls: emptyAsNull(integer),
  trackerId: emptyAsNull(id(TrackerId)),
  transcription: nullable(string),
  utmCampaign: nullable(string),
  utmContent: nullable(string),
  utmMedium: nullable(string),
  utmSource: nullable(string),
  utmTerm: nullable(string),
  value: money,
  voiceAssistMessage: emptyAsNull(
    object<VoiceAssistMessage>({
      contents: dict(string),
      overrides: emptyAsNull(dict(string)),
      recordedAt: nullable(string),
      urgency: nullable(string),
    }),
  ),
  waveforms: emptyAsNull(array(string)),
  zipCode: emptyAsNull(array(string)),
  leadScore: nullable(string),
  leadExplanation: nullable(string),
  conversationalTranscript: emptyAsNull(array(object<TranscriptPhrase>({ speaker, phrase: string, start: number }))),
  integrationData: emptyAsNull(array(object({ integration: string, data: nullable(json) }))),
} satisfies Shape<CallExtras>;

const metricExtras: Shape<Omit<CallMetrics, "totalCalls">> = {
  missedCalls: integer,
  answeredCalls: integer,
  firstTimeCallers: integer,
  averageDuration: number,
  formattedAverageDuration: string,
  leads: integer,
};

/** `total_calls` comes back whatever `fields` says, so it is always decoded. */
function metrics<X, F extends CallMetricField>(
  base: Shape<X>,
  fields: readonly F[] | undefined,
): Decoder<X & SelectedCallMetrics<F>> {
  const rest = selected(base, metricExtras, fields);
  const total = object({ totalCalls: integer });
  return (input, path) => ({ ...rest(input, path), ...total(input, path) });
}

function metricFilters(filters: CallMetricFilters): Query {
  return {
    device: filters.device,
    min_duration: filters.minDuration,
    max_duration: filters.maxDuration,
    tags: filters.tags,
    tracker_ids: filters.trackerIds,
    direction: filters.direction,
    answer_status: filters.answerStatus,
    first_time_callers: filters.firstTimeCallers,
    lead_status: filters.leadStatus,
    agent: filters.agentId,
  };
}

const pageView = object<PageView>({ pageUrl: string, referrerUrl: nullable(string), createdAt: string });

const callRecording = object<CallRecording>({ url: string });

type AnyCallListQuery = (OffsetCallListQuery<CallListField> | RelativeCallListQuery<CallListField>) & RequestOptions;

export class Calls {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/calls.json?relative_pagination=true`. Follows `next_page` exactly. */
  list<const F extends CallListField = never>(
    query: RelativeCallListQuery<F> & RequestOptions,
  ): PagePromise<RelativePage<Call<F>>>;
  /** `GET /v3/a/{account_id}/calls.json`. */
  list<const F extends CallListField = never>(
    query?: OffsetCallListQuery<F> & RequestOptions,
  ): PagePromise<OffsetPage<Call<F>>>;
  list(query: AnyCallListQuery = {}): unknown {
    const endpoint: Endpoint = {
      method: "GET",
      path: v3`a/${this.#accountId}/calls.json`,
      query: {
        ...encodeDateFilter(query),
        company_id: query.companyId,
        tracker_id: query.trackerId,
        call_type: query.callType,
        answer_status: query.answerStatus,
        device: query.device,
        direction: query.direction,
        lead_status: query.leadStatus,
        tags: query.tags,
        search: query.search,
        ...encodeSort(query.sort),
        per_page: query.perPage,
        ...encodeFields(query.fields),
        page: query.page,
        offset: query.offset,
      },
    };
    const call = selected(callBaseShape, callExtrasShape, query.fields);
    return query.pagination === "relative"
      ? relativePages(this.#http, endpoint, "calls", call, query)
      : offsetPages(this.#http, endpoint, "calls", call, query);
  }

  /** `GET /v3/a/{account_id}/calls/{call_id}.json`. */
  get<const F extends CallField = never>(
    id: CallId,
    options: { readonly fields?: readonly F[] } & RequestOptions = {},
  ): Promise<Call<F>> {
    return this.#http.json(
      { method: "GET", path: v3`a/${this.#accountId}/calls/${id}.json`, query: encodeFields(options.fields) },
      selected(callBaseShape, callExtrasShape, options.fields),
      options,
    );
  }

  /**
   * `POST /v3/a/{account_id}/calls.json`. US and Canada only. Draws from the outbound-call budget and is never retried.
   * The call is still ringing when this resolves, so `answered` and `voicemail` are `false` and `duration` is `null`.
   */
  create(input: OutboundCallInput, options?: RequestOptions): Promise<Call> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/calls.json`,
        bucket: "outbound_call",
        body: {
          kind: "json",
          value: {
            caller_id: input.callerId,
            customer_phone_number: input.customerPhoneNumber,
            business_phone_number: input.businessPhoneNumber,
            recording_enabled: input.recordingEnabled,
            outbound_greeting_text: input.greeting?.text,
            outbound_greeting_recording_url: input.greeting?.recordingUrl,
            agent_id: input.agentId,
          },
        },
      },
      object(inProgressCallShape),
      options,
    );
  }

  /** `PUT /v3/a/{account_id}/calls/{call_id}.json`. */
  update(id: CallId, changes: CallUpdate, options?: RequestOptions): Promise<Call> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/calls/${id}.json`,
        body: {
          kind: "json",
          value: {
            note: changes.note,
            ...encodeTagChange(changes.tags),
            value: encodeMoney(changes.value),
            lead_status: changes.leadStatus,
            customer_name: changes.customerName,
            spam: changes.spam,
          },
        },
      },
      object(callBaseShape),
      options,
    );
  }

  /** `GET /v3/a/{account_id}/calls/summary.json`. */
  summary<const F extends CallMetricField = never>(
    query: CallSummaryQuery<F> & RequestOptions = {},
  ): Promise<CallSummary<F>> {
    return this.#http.json(
      {
        method: "GET",
        path: v3`a/${this.#accountId}/calls/summary.json`,
        query: {
          ...encodeDateFilter(query),
          company_id: query.companyId,
          group_by: query.groupBy,
          ...metricFilters(query),
          search: query.search,
          ...encodeFields(query.fields),
        },
      },
      object<CallSummary<F>>({
        startDate: string,
        endDate: string,
        timeZone: string,
        total: wire("total_results", metrics<object, F>({}, query.fields)),
        groupedBy: nullable(string),
        groups: wire("grouped_results", listOrEmpty(metrics({ key: string }, query.fields))),
      }),
      query,
    );
  }

  /** `GET /v3/a/{account_id}/calls/timeseries.json`. */
  timeseries<const F extends CallMetricField = never>(
    query: CallTimeseriesQuery<F> & RequestOptions = {},
  ): Promise<CallTimeseries<F>> {
    return this.#http.json(
      {
        method: "GET",
        path: v3`a/${this.#accountId}/calls/timeseries.json`,
        query: {
          ...encodeDateFilter(query),
          company_id: query.companyId,
          interval: query.interval,
          search: query.search,
          ...metricFilters(query),
          ...encodeFields(query.fields),
        },
      },
      object<CallTimeseries<F>>({
        startDate: string,
        endDate: string,
        timeZone: string,
        total: wire("total_results", metrics<object, F>({}, query.fields)),
        points: wire("data", array(metrics({ date: string }, query.fields))),
      }),
      query,
    );
  }

  /** `GET /v3/a/{account_id}/calls/{call_id}/recording.json`. */
  recording(id: CallId, options?: RequestOptions): Promise<CallRecording> {
    return this.#http.json(
      { method: "GET", path: v3`a/${this.#accountId}/calls/${id}/recording.json` },
      callRecording,
      options,
    );
  }

  /** `GET /v3/a/{account_id}/calls/{call_id}/page_views.json`. */
  pageViews(
    id: CallId,
    options: OffsetPaging & RequestOptions & { readonly timeZone?: string } = {},
  ): PagePromise<OffsetPage<PageView>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/calls/${id}/page_views.json`,
        query: { page: options.page, per_page: options.perPage, time_zone: options.timeZone },
      },
      "page_views",
      pageView,
      options,
    );
  }
}
