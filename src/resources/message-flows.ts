/**
 * Message flows decide what happens when a tracking number receives a text.
 *
 * CallRail's wire format is a map of steps keyed by id, plus an
 * `initial_step_id`, plus an `initial_step` flag on every step that must agree
 * with it. The SDK takes an ordered list instead. The first step is the initial
 * step, and the encoder derives the map, the id, and every flag, so they cannot
 * disagree. The encoder also throws `TypeError` before sending when two steps
 * share an id or a `nextStepId` names a step that is not in the list.
 *
 * Decoding reverses the transform and puts the initial step first. A saved step
 * of a known type is assignable to `MessageFlowStepInput`, so a flow read with
 * `get` can be edited and sent back. A step of a type the SDK does not know
 * decodes as `other` and is not assignable, so it cannot be silently dropped
 * on the way back.
 */

import { MessageFlowId, MessageFlowStepId, TagId, TrackerId } from "../ids.js";
import type { AccountId, CompanyId } from "../ids.js";
import {
  array,
  boolean,
  DecodeError,
  dict,
  id,
  json,
  nullable,
  object,
  oneOf,
  string,
  tagged,
  wire,
  type Decoder,
  type JsonValue,
} from "../decode.js";
import { v3, type Http, type JsonBody, type RequestOptions } from "../http.js";
import { offsetPages, type OffsetPage, type PagePromise } from "../pagination.js";
import type { NonEmpty, OffsetPaging } from "../query.js";

export type ScheduleDay =
  | "any_day"
  | "weekdays"
  | "weekends"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Hour = `${"0" | "1"}${Digit}` | `2${"0" | "1" | "2" | "3"}`;
type Minute = `${"0" | "1" | "2" | "3" | "4" | "5"}${Digit}`;

/** 24-hour `HHMM`, as CallRail spells it: `"0800"`, `"1700"`, `"2359"`. A window cannot cross midnight, so split it in two. */
export type ClockTime = `${Hour}${Minute}`;

export interface ScheduleWindow {
  readonly day: ScheduleDay;
  readonly startTime: ClockTime;
  readonly endTime: ClockTime;
}

/**
 * One step, as you write it. `id` is yours, such as `"response-01"`. CallRail
 * replaces it with a generated id on save. `nextStepId: null` ends the flow.
 */
export type MessageFlowStepInput =
  | {
      readonly type: "schedule";
      readonly id: string;
      readonly branches: NonEmpty<{ readonly times: NonEmpty<ScheduleWindow>; readonly nextStepId: string | null }>;
      readonly nextStepId: string | null;
    }
  | {
      readonly type: "sms_response";
      readonly id: string;
      /** Up to 1550 characters. Over 160 may arrive as several texts. */
      readonly message: string;
      /** `true` replies only to someone texting the business for the first time. */
      readonly firstText: boolean;
      readonly nextStepId: string | null;
    }
  | { readonly type: "no_response"; readonly id: string; readonly nextStepId: string | null }
  | { readonly type: "tag"; readonly id: string; readonly tagIds: NonEmpty<TagId>; readonly nextStepId: string | null }
  | {
      /** Not available on HIPAA or white-label accounts. */
      readonly type: "forward_message";
      readonly id: string;
      /** E.164. */
      readonly destinationNumber: string;
      readonly nextStepId: string | null;
    };

type Saved<S> = S extends { readonly type: "schedule" }
  ? Omit<S, "id" | "nextStepId" | "branches"> & {
      readonly id: MessageFlowStepId;
      readonly nextStepId: MessageFlowStepId | null;
      readonly branches: NonEmpty<{
        readonly times: NonEmpty<ScheduleWindow>;
        readonly nextStepId: MessageFlowStepId | null;
      }>;
    }
  : Omit<S, "id" | "nextStepId"> & { readonly id: MessageFlowStepId; readonly nextStepId: MessageFlowStepId | null };

/** A step read back from CallRail. A step type the SDK does not know arrives as `other`, with its raw JSON. */
export type MessageFlowStep =
  | Saved<MessageFlowStepInput>
  | {
      readonly type: "other";
      readonly wireType: string;
      readonly id: MessageFlowStepId;
      readonly nextStepId: MessageFlowStepId | null;
      readonly raw: JsonValue;
    };

export interface MessageFlowSummary {
  readonly id: MessageFlowId;
  readonly name: string;
  readonly updatedAt: string;
  readonly trackerIds: readonly TrackerId[];
}

export interface MessageFlow extends MessageFlowSummary {
  /** Initial step first. */
  readonly steps: NonEmpty<MessageFlowStep>;
}

export interface MessageFlowInput {
  readonly companyId: CompanyId;
  /** CallRail requires a unique name. */
  readonly name: string;
  /** The first step is the initial step. */
  readonly steps: NonEmpty<MessageFlowStepInput>;
}

export interface MessageFlowUpdate {
  readonly name?: string;
  readonly steps?: NonEmpty<MessageFlowStepInput>;
}

type StepOf<T extends MessageFlowStep["type"]> = Extract<MessageFlowStep, { readonly type: T }>;

function nonEmpty<T>(decode: Decoder<T>): Decoder<NonEmpty<T>> {
  const list = array(decode);
  return (input, path) => {
    const [first, ...rest] = list(input, path);
    if (first === undefined) throw new DecodeError(path, "a non-empty array", input);
    return [first, ...rest];
  };
}

function isClockTime(value: string): value is ClockTime {
  return /^([01]\d|2[0-3])[0-5]\d$/.test(value);
}

const clockTime: Decoder<ClockTime> = (input, path) => {
  if (typeof input === "string" && isClockTime(input)) return input;
  throw new DecodeError(path, "a time as HHMM", input);
};

const scheduleWindow = object<ScheduleWindow>({
  day: oneOf("any_day", "weekdays", "weekends", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"),
  startTime: clockTime,
  endTime: clockTime,
});

const stepId = id(MessageFlowStepId);
const nextStepId = nullable(stepId);
const otherStep = object({ wireType: wire("type", string), id: stepId, nextStepId });

const step = tagged<Exclude<MessageFlowStep, StepOf<"other">>, StepOf<"other">>(
  "type",
  {
    schedule: object<StepOf<"schedule">>({
      type: oneOf("schedule"),
      id: stepId,
      nextStepId,
      branches: nonEmpty(object({ times: nonEmpty(scheduleWindow), nextStepId })),
    }),
    sms_response: object<StepOf<"sms_response">>({
      type: oneOf("sms_response"),
      id: stepId,
      nextStepId,
      message: string,
      firstText: boolean,
    }),
    no_response: object<StepOf<"no_response">>({ type: oneOf("no_response"), id: stepId, nextStepId }),
    tag: object<StepOf<"tag">>({ type: oneOf("tag"), id: stepId, nextStepId, tagIds: nonEmpty(id(TagId)) }),
    forward_message: object<StepOf<"forward_message">>({
      type: oneOf("forward_message"),
      id: stepId,
      nextStepId,
      destinationNumber: string,
    }),
  },
  (input, path) => ({ type: "other", ...otherStep(input, path), raw: json(input, path) }),
);

const summary = object<MessageFlowSummary>({
  id: id(MessageFlowId),
  name: string,
  updatedAt: string,
  trackerIds: array(id(TrackerId)),
});

const stepMap = object({ initialStepId: stepId, steps: dict(step) });

const flow: Decoder<MessageFlow> = (input, path) => {
  const { initialStepId, steps } = stepMap(input, path);
  const initial = steps[initialStepId];
  if (initial === undefined) throw new DecodeError(`${path}.initial_step_id`, "the id of a step in steps", initialStepId);
  const rest = Object.entries(steps).flatMap(([key, value]) => (key === initialStepId ? [] : [value]));
  return { ...summary(input, path), steps: [initial, ...rest] };
};

/** Throws `TypeError` on a duplicate id or a `nextStepId` that names no step in the list. */
function encodeSteps(steps: NonEmpty<MessageFlowStepInput>): JsonBody {
  const ids = new Set<string>();
  for (const { id } of steps) {
    if (ids.has(id)) throw new TypeError(`Message flow step ids must be unique. Got ${JSON.stringify(id)} twice.`);
    ids.add(id);
  }
  for (const step of steps) {
    const targets = step.type === "schedule" ? [step.nextStepId, ...step.branches.map((branch) => branch.nextStepId)] : [step.nextStepId];
    for (const target of targets) {
      if (target !== null && !ids.has(target)) {
        throw new TypeError(`nextStepId must name a step in the list. Step ${JSON.stringify(step.id)} names ${JSON.stringify(target)}.`);
      }
    }
  }
  return {
    initial_step_id: steps[0].id,
    steps: Object.fromEntries(steps.map((step, index) => [step.id, encodeStep(step, index === 0)])),
  };
}

function encodeStep(step: MessageFlowStepInput, initial: boolean): JsonBody {
  const common = { id: step.id, type: step.type, initial_step: initial, next_step_id: step.nextStepId };
  switch (step.type) {
    case "schedule":
      return {
        ...common,
        branches: step.branches.map((branch) => ({
          times: branch.times.map((time) => ({ day: time.day, start_time: time.startTime, end_time: time.endTime })),
          next_step_id: branch.nextStepId,
        })),
      };
    case "sms_response":
      return { ...common, message: step.message, first_text: step.firstText };
    case "no_response":
      return common;
    case "tag":
      return { ...common, tag_ids: step.tagIds };
    case "forward_message":
      return { ...common, destination_number: step.destinationNumber };
  }
}

export class MessageFlows {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/message-flows.json`. Collection key `message-flows`. */
  list(
    query: { readonly companyId?: CompanyId } & OffsetPaging & RequestOptions = {},
  ): PagePromise<OffsetPage<MessageFlowSummary>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/message-flows.json`,
        query: { company_id: query.companyId, page: query.page, per_page: query.perPage },
      },
      "message-flows",
      summary,
      query,
    );
  }

  /** `GET /v3/a/{account_id}/message-flows/{message_flow_id}.json`. */
  get(id: MessageFlowId, options?: RequestOptions): Promise<MessageFlow> {
    return this.#http.json({ method: "GET", path: v3`a/${this.#accountId}/message-flows/${id}.json` }, flow, options);
  }

  /** `POST /v3/a/{account_id}/message-flows.json`. */
  create(input: MessageFlowInput, options?: RequestOptions): Promise<MessageFlow> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/message-flows.json`,
        body: { kind: "json", value: { company_id: input.companyId, name: input.name, ...encodeSteps(input.steps) } },
      },
      flow,
      options,
    );
  }

  /** `PUT /v3/a/{account_id}/message-flows/{message_flow_id}.json`. */
  update(id: MessageFlowId, changes: MessageFlowUpdate, options?: RequestOptions): Promise<MessageFlow> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/message-flows/${id}.json`,
        body: {
          kind: "json",
          value: { name: changes.name, ...(changes.steps === undefined ? {} : encodeSteps(changes.steps)) },
        },
      },
      flow,
      options,
    );
  }

  /** `DELETE /v3/a/{account_id}/message-flows/{message_flow_id}.json`. Fails while a tracker uses the flow. 204. */
  delete(id: MessageFlowId, options?: RequestOptions): Promise<void> {
    return this.#http.empty({ method: "DELETE", path: v3`a/${this.#accountId}/message-flows/${id}.json` }, options);
  }
}
