/**
 * Leads (people) and their timelines.
 *
 * Field selection runs the other way here. Leads return every field by
 * default and `fields` limits them. `Lead<F>` defaults to all fields, and
 * `fields: ["name"]` narrows the type to `id` and `name`. The SDK always adds
 * `id` to the list it sends, so every lead can be looked up again.
 *
 * The timeline path uses `{agency_id}` in the docs. It is the account id.
 */

import { CompanyId, PersonId, TimelineEventId } from "../ids.js";
import type { AccountId } from "../ids.js";
import {
  array,
  boolean,
  dict,
  id,
  integer,
  json,
  nullable,
  object,
  oneOf,
  open,
  selected,
  string,
  tagged,
  wire,
  type Decoder,
  type JsonValue,
  type Open,
  type Shape,
} from "../decode.js";
import { v3, type Http, type RequestOptions } from "../http.js";
import { offsetPages, recordWithPage, type OffsetPage, type PagePromise } from "../pagination.js";
import { encodeFields, encodeSort, type NonEmpty, type OffsetPaging, type Sort } from "../query.js";
import { messageType } from "./text-messages.js";

export interface LeadFields {
  readonly name: string | null;
  /** E.164. */
  readonly phone: string | null;
  readonly email: string | null;
  readonly createdAt: string;
  readonly companyId: CompanyId | null;
  readonly companyName: string | null;
}

export type LeadField = keyof LeadFields;
export type Lead<F extends LeadField = LeadField> = { readonly id: PersonId } & Pick<LeadFields, F>;

export interface LeadListQuery<F extends LeadField> extends OffsetPaging {
  readonly companyId?: CompanyId;
  /** Defaults to `createdAt`, descending. */
  readonly sort?: Sort<"createdAt" | "name" | "email">;
  readonly fields?: NonEmpty<F>;
}

export interface Touchpoint {
  readonly touchpointType: string | null;
  readonly source: string | null;
  readonly medium: string | null;
  readonly createdAt: string | null;
}

export interface ConvertAssistAnswer {
  readonly answerKey: string;
  readonly answerText: string;
}

/** @internal */
export const convertAssistAnswer = object<ConvertAssistAnswer>({ answerKey: string, answerText: string });

export interface LeadSummary {
  readonly customerName: string | null;
  readonly customerPhoneNumber: string | null;
  readonly totalInteractions: number;
  readonly firstTouch: Touchpoint | null;
  readonly lastTouch: Touchpoint | null;
  /** CallRail names this timestamp `lead_creation_time`. It is decoded into `createdAt` like the other touchpoints. */
  readonly leadCreation: Touchpoint | null;
  readonly leadQualification: Touchpoint | null;
  /** Timeline tags carry string ids (`"TAG123"`), unlike tag records, so they stay plain strings. */
  readonly tags: readonly { readonly id: string; readonly name: string; readonly color: string | null }[];
  readonly convertAssist: {
    readonly id: string;
    readonly createdAt: string;
    readonly lastInteractionId: string;
    readonly lastInteractionType: string;
    readonly interactionCount: number;
    readonly status: string;
    readonly answers: readonly ConvertAssistAnswer[];
  } | null;
  readonly voiceAssist: boolean;
  readonly transcript: boolean;
  readonly source: string | null;
  readonly medium: string | null;
  readonly campaign: string | null;
  readonly landingPageUrl: string | null;
  readonly referrerUrl: string | null;
  /** `gclid`, `gbraid`, `wbraid`, `msclkid`, or `fbclid`, keys verbatim. */
  readonly clickId: Readonly<Record<string, string>> | null;
}

interface EventCommon {
  readonly id: TimelineEventId;
  readonly eventDate: string;
}

/** One entry in a lead's history. A type the SDK does not know arrives as `other`, with its raw JSON. */
export type TimelineEvent =
  | (EventCommon & {
      readonly type: "call";
      readonly customerName: string | null;
      readonly customerPhoneNumber: string | null;
      readonly direction: Open<"inbound" | "outbound">;
      readonly duration: number | null;
      readonly answered: boolean | null;
    })
  | (EventCommon & {
      readonly type: "form_submission";
      readonly formName: string | null;
      readonly formUrl: string | null;
      readonly formFields: Readonly<Record<string, JsonValue>>;
      readonly formSubmissionUrl: string | null;
    })
  | (EventCommon & {
      readonly type: "sms";
      readonly messageContent: string | null;
      readonly messagePhoneNumber: string | null;
      readonly messageType: Open<"sms" | "mms">;
      readonly threadId: string | null;
    })
  | (EventCommon & {
      readonly type: "chat";
      readonly chatId: string | null;
      readonly chatSubject: string | null;
      readonly conversationParticipantPhoneNumber: string | null;
    })
  | (EventCommon & {
      readonly type: "milestone";
      readonly milestoneType: Open<"lead_created" | "lead_qualified">;
      readonly touchpointType: string | null;
    })
  | (EventCommon & { readonly type: "other"; readonly wireType: string; readonly raw: JsonValue });

export interface LeadTimeline {
  readonly lead: LeadSummary;
  readonly events: OffsetPage<TimelineEvent>;
}

const leadIdShape = { id: id(PersonId) } satisfies Shape<Lead<never>>;

const leadFieldsShape = {
  name: nullable(string),
  phone: nullable(string),
  email: nullable(string),
  createdAt: string,
  companyId: nullable(id(CompanyId)),
  companyName: nullable(string),
} satisfies Shape<LeadFields>;

function lead<F extends LeadField>(fields: readonly F[]): Decoder<Lead<F>>;
function lead(fields?: undefined): Decoder<Lead>;
function lead<F extends LeadField>(fields?: readonly F[]): Decoder<Lead<F> | Lead> {
  if (fields !== undefined) return selected(leadIdShape, leadFieldsShape, fields);
  return object<Lead>({ ...leadIdShape, ...leadFieldsShape });
}

const touchpointShape = {
  touchpointType: nullable(string),
  source: nullable(string),
  medium: nullable(string),
  createdAt: nullable(string),
} satisfies Shape<Touchpoint>;

const touchpoint = nullable(object(touchpointShape));

const leadSummary = object<LeadSummary>({
  customerName: nullable(string),
  customerPhoneNumber: nullable(string),
  totalInteractions: integer,
  firstTouch: touchpoint,
  lastTouch: touchpoint,
  leadCreation: nullable(object({ ...touchpointShape, createdAt: wire("lead_creation_time", nullable(string)) })),
  leadQualification: touchpoint,
  tags: array(object({ id: id(String), name: string, color: nullable(string) })),
  convertAssist: nullable(
    object({
      id: string,
      createdAt: string,
      lastInteractionId: string,
      lastInteractionType: string,
      interactionCount: integer,
      status: string,
      answers: array(convertAssistAnswer),
    }),
  ),
  voiceAssist: boolean,
  transcript: boolean,
  source: nullable(string),
  medium: nullable(string),
  campaign: nullable(string),
  landingPageUrl: nullable(string),
  referrerUrl: nullable(string),
  clickId: nullable(dict(string)),
});

type EventOf<T extends TimelineEvent["type"]> = Extract<TimelineEvent, { readonly type: T }>;

const eventCommonShape = { id: id(TimelineEventId), eventDate: string } satisfies Shape<EventCommon>;
const otherEvent = object({ ...eventCommonShape, wireType: wire("type", string) });

const timelineEvent = tagged<Exclude<TimelineEvent, EventOf<"other">>, EventOf<"other">>(
  "type",
  {
    call: object<EventOf<"call">>({
      ...eventCommonShape,
      type: oneOf("call"),
      customerName: nullable(string),
      customerPhoneNumber: nullable(string),
      direction: open("inbound", "outbound"),
      duration: nullable(integer),
      answered: nullable(boolean),
    }),
    form_submission: object<EventOf<"form_submission">>({
      ...eventCommonShape,
      type: oneOf("form_submission"),
      formName: nullable(string),
      formUrl: nullable(string),
      formFields: dict(json),
      formSubmissionUrl: nullable(string),
    }),
    sms: object<EventOf<"sms">>({
      ...eventCommonShape,
      type: oneOf("sms"),
      messageContent: nullable(string),
      messagePhoneNumber: nullable(string),
      messageType,
      threadId: nullable(string),
    }),
    chat: object<EventOf<"chat">>({
      ...eventCommonShape,
      type: oneOf("chat"),
      chatId: nullable(string),
      chatSubject: nullable(string),
      conversationParticipantPhoneNumber: nullable(string),
    }),
    milestone: object<EventOf<"milestone">>({
      ...eventCommonShape,
      type: oneOf("milestone"),
      milestoneType: open("lead_created", "lead_qualified"),
      touchpointType: nullable(string),
    }),
  },
  (input, path) => ({ type: "other", ...otherEvent(input, path), raw: json(input, path) }),
);

export class Leads {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/leads.json`. */
  list<const F extends LeadField>(
    query: LeadListQuery<F> & { readonly fields: NonEmpty<F> } & RequestOptions,
  ): PagePromise<OffsetPage<Lead<F>>>;
  list(query?: Omit<LeadListQuery<LeadField>, "fields"> & RequestOptions): PagePromise<OffsetPage<Lead>>;
  list(query: LeadListQuery<LeadField> & RequestOptions = {}): PagePromise<OffsetPage<Lead>> {
    const fields = query.fields;
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/leads.json`,
        query: {
          company_id: query.companyId,
          ...encodeSort(query.sort),
          ...encodeFields(fields, ["id"]),
          page: query.page,
          per_page: query.perPage,
        },
      },
      "leads",
      fields === undefined ? lead() : lead(fields),
      query,
    );
  }

  /** `GET /v3/a/{account_id}/leads/{lead_id}/timeline.json`. Collection key `timeline`. */
  async timeline(id: PersonId, options: OffsetPaging & RequestOptions = {}): Promise<LeadTimeline> {
    const { record, page } = await recordWithPage(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/leads/${id}/timeline.json`,
        query: { page: options.page, per_page: options.perPage },
      },
      object({ lead: leadSummary }),
      "timeline",
      timelineEvent,
      options,
    );
    return { lead: record.lead, events: page };
  }
}
