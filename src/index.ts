/**
 * The `@yannelli/callrail` entry exports the client, its error, page types, query
 * vocabulary, ids, and every resource's domain types. Receiving webhooks lives in `@yannelli/callrail/webhooks`
 * and the scripted fetch lives in `@yannelli/callrail/testing`, so neither loads unless
 * imported.
 *
 * Nothing here exposes the transport. `Http`, `Endpoint`, decoders, and wire
 * shapes stay inside the package. Resource classes are exported as types only,
 * because the only way to get one is `callrail.account(id)`.
 */

export { CallRail } from "./client.js";
export type { AccountClient } from "./client.js";
export type { CallRailOptions, FetchLike, RequestOptions } from "./http.js";

export { CallRailError } from "./errors.js";
export type { Problem, ProblemKind, RateLimitBucket } from "./errors.js";

export type { OffsetPage, Page, PagePromise, RelativePage } from "./pagination.js";
export type {
  AtLeastOne,
  DateFilter,
  DateRange,
  NonEmpty,
  OffsetPaging,
  Sort,
  TagChange,
  TimeZone,
} from "./query.js";
export type { JsonValue, Open } from "./decode.js";

export {
  AccountId,
  CallId,
  CallerIdId,
  CompanyId,
  OutboundCallerNumber,
  ConversationId,
  FormSubmissionId,
  IntegrationFilterId,
  IntegrationId,
  MessageFlowId,
  MessageFlowStepId,
  NotificationId,
  PersonId,
  SessionTrackerId,
  SmsThreadId,
  SourceTrackerId,
  SummaryEmailId,
  TagId,
  TextMessageId,
  TimelineEventId,
  TrackerId,
  UserId,
} from "./ids.js";

export type * from "./resources/accounts.js";
export type * from "./resources/caller-ids.js";
export type * from "./resources/calls.js";
export type * from "./resources/companies.js";
export type * from "./resources/form-submissions.js";
export type * from "./resources/integration-filters.js";
export type * from "./resources/integrations.js";
export type * from "./resources/leads.js";
export type * from "./resources/message-flows.js";
export type * from "./resources/notifications.js";
export type * from "./resources/sms-threads.js";
export type * from "./resources/summary-emails.js";
export type * from "./resources/tags.js";
export type * from "./resources/text-messages.js";
export type * from "./resources/trackers.js";
export type * from "./resources/users.js";
