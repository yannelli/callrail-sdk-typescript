/**
 * One brand per resource, so a CompanyId cannot be passed where a CallId belongs.
 *
 * CallRail ids come in two forms. Most are strings with a prefix
 * (`CAL…`, `COM…`), but older records and the webhook payloads use bare numbers
 * for the same resources. Those brands wrap `string` and normalize a number with
 * `String(n)`. Tags, integrations, integration filters, notifications, and
 * outbound caller ids are documented as integers everywhere, so those brands wrap
 * `number` and accept a numeric string.
 *
 * Each brand has a constructor of the same name. Ids that come back from the API
 * are already branded. Ids that come from your own storage go through the
 * constructor once. Constructors throw `TypeError` on an empty string, a
 * non-integer, or a value with surrounding whitespace.
 */

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

function stringId<T>(name: string, raw: string | number): T {
  if (typeof raw === "number") {
    if (Number.isSafeInteger(raw) && raw >= 0) return String(raw) as T;
  } else if (typeof raw === "string" && raw !== "" && raw.trim() === raw) {
    return raw as T;
  }
  throw new TypeError(`${name} must be a non-empty string without surrounding spaces, or a whole number. Got ${JSON.stringify(raw)}.`);
}

function numberId<T>(name: string, raw: number | string): T {
  const value = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value as T;
  throw new TypeError(`${name} must be a whole number or a string of digits. Got ${JSON.stringify(raw)}.`);
}

/** `ACC…` or the nine-digit number from the app URL (`/a/227799611`). */
export type AccountId = Brand<string, "AccountId">;
export function AccountId(raw: string | number): AccountId {
  return stringId("AccountId", raw);
}

export type CompanyId = Brand<string, "CompanyId">;
export function CompanyId(raw: string | number): CompanyId {
  return stringId("CompanyId", raw);
}

export type CallId = Brand<string, "CallId">;
export function CallId(raw: string | number): CallId {
  return stringId("CallId", raw);
}

export type TrackerId = Brand<string, "TrackerId">;
export function TrackerId(raw: string | number): TrackerId {
  return stringId("TrackerId", raw);
}

declare const trackerType: unique symbol;

/**
 * Session and source trackers share every URL and differ by `type`. Their ids
 * carry the type too, so `updateSession` cannot be handed a source tracker's id.
 * Both are still a `TrackerId` wherever any tracker will do.
 */
export type SessionTrackerId = TrackerId & { readonly [trackerType]: "session" };
export function SessionTrackerId(raw: string | number): SessionTrackerId {
  return stringId("SessionTrackerId", raw);
}

export type SourceTrackerId = TrackerId & { readonly [trackerType]: "source" };
export function SourceTrackerId(raw: string | number): SourceTrackerId {
  return stringId("SourceTrackerId", raw);
}

export type UserId = Brand<string, "UserId">;
export function UserId(raw: string | number): UserId {
  return stringId("UserId", raw);
}

export type FormSubmissionId = Brand<string, "FormSubmissionId">;
export function FormSubmissionId(raw: string | number): FormSubmissionId {
  return stringId("FormSubmissionId", raw);
}

/** A lead. The docs call it a person (`PER…`) in records and a lead in the leads endpoints. */
export type PersonId = Brand<string, "PersonId">;
export function PersonId(raw: string | number): PersonId {
  return stringId("PersonId", raw);
}

export type SmsThreadId = Brand<string, "SmsThreadId">;
export function SmsThreadId(raw: string | number): SmsThreadId {
  return stringId("SmsThreadId", raw);
}

/** A text-messages conversation (`SCI…`). Distinct from an SMS thread id. */
export type ConversationId = Brand<string, "ConversationId">;
export function ConversationId(raw: string | number): ConversationId {
  return stringId("ConversationId", raw);
}

export type TextMessageId = Brand<string, "TextMessageId">;
export function TextMessageId(raw: string | number): TextMessageId {
  return stringId("TextMessageId", raw);
}

export type MessageFlowId = Brand<string, "MessageFlowId">;
export function MessageFlowId(raw: string | number): MessageFlowId {
  return stringId("MessageFlowId", raw);
}

export type MessageFlowStepId = Brand<string, "MessageFlowStepId">;
export function MessageFlowStepId(raw: string | number): MessageFlowStepId {
  return stringId("MessageFlowStepId", raw);
}

export type SummaryEmailId = Brand<string, "SummaryEmailId">;
export function SummaryEmailId(raw: string | number): SummaryEmailId {
  return stringId("SummaryEmailId", raw);
}

/** Timeline event ids do not share prefixes with the records they point at (`CALL123`, `FORM456`). */
export type TimelineEventId = Brand<string, "TimelineEventId">;
export function TimelineEventId(raw: string | number): TimelineEventId {
  return stringId("TimelineEventId", raw);
}

export type TagId = Brand<number, "TagId">;
export function TagId(raw: number | string): TagId {
  return numberId("TagId", raw);
}

export type IntegrationId = Brand<number, "IntegrationId">;
export function IntegrationId(raw: number | string): IntegrationId {
  return numberId("IntegrationId", raw);
}

export type IntegrationFilterId = Brand<number, "IntegrationFilterId">;
export function IntegrationFilterId(raw: number | string): IntegrationFilterId {
  return numberId("IntegrationFilterId", raw);
}

export type NotificationId = Brand<number, "NotificationId">;
export function NotificationId(raw: number | string): NotificationId {
  return numberId("NotificationId", raw);
}

/** The id of an outbound caller id record, such as `13`. */
export type CallerIdId = Brand<number, "CallerIdId">;
export function CallerIdId(raw: number | string): CallerIdId {
  return numberId("CallerIdId", raw);
}

/**
 * The 10-digit tracking number or verified caller id that `calls.create` sends
 * as `caller_id`. It is the phone number, not a `CallerIdId`.
 */
export type OutboundCallerNumber = Brand<number, "OutboundCallerNumber">;
export function OutboundCallerNumber(raw: number | string): OutboundCallerNumber {
  return numberId("OutboundCallerNumber", raw);
}
