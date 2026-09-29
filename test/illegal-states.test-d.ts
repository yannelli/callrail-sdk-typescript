import {
  CallerIdId,
  CallId,
  CompanyId,
  OutboundCallerNumber,
  SessionTrackerId,
  SourceTrackerId,
  TagId,
  TrackerId,
  UserId,
  type AccountClient,
  type CallRailError,
  type ClockTime,
} from "../src/index.js";
import { readWebhook, type WebhookRequest } from "../src/webhooks.js";

declare const account: AccountClient;
declare const request: WebhookRequest;
declare const error: CallRailError;

const company = CompanyId("COM1");
const call = CallId("CAL1");

export async function paginationModes(): Promise<void> {
  // @ts-expect-error page numbers do not exist in relative pagination
  account.calls.list({ pagination: "relative", page: 2 });
  // @ts-expect-error offset exists only in relative pagination
  account.calls.list({ offset: 3 });
  // @ts-expect-error relative pagination is calls-only
  account.companies.list({ pagination: "relative" });

  const relative = await account.calls.list({ pagination: "relative", offset: 0 });
  const more: boolean = relative.hasNextPage;
  // @ts-expect-error relative pages have no totals
  relative.totalRecords;

  const offset = await account.calls.list({ page: 2 });
  const total: number = offset.totalRecords;
}

export async function fieldSelection(): Promise<void> {
  const plain = await account.calls.get(call);
  // @ts-expect-error source was not requested
  plain.source;

  const selected = await account.calls.get(call, { fields: ["source", "milestones"] });
  const source: string | null = selected.source;

  // @ts-expect-error integrationData is available on get only
  account.calls.list({ fields: ["integrationData"] });
  // @ts-expect-error fields take camelCase names
  account.calls.get(call, { fields: ["lead_status"] });
}

export function ids(): void {
  // @ts-expect-error a bare string is not a CallId
  account.calls.get("CAL1");
  // @ts-expect-error a CompanyId is not a CallId
  account.calls.get(company);
  // @ts-expect-error tag ids are numbers, and a raw number still goes through TagId()
  account.tags.delete(993186);

  account.tags.delete(TagId(993186));
  account.calls.get(CallId(766970532));
}

export async function trackerTypes(): Promise<void> {
  // @ts-expect-error a source tracker id cannot update a session tracker
  account.trackers.updateSession(SourceTrackerId("TRK2"), { poolSize: 6 });
  // @ts-expect-error a plain TrackerId does not say which type it is
  account.trackers.updateSource(TrackerId("TRK2"), { name: "Billboard I-70" });
  // @ts-expect-error pool size belongs to session trackers
  account.trackers.updateSource(SourceTrackerId("TRK2"), { poolSize: 6 });
  // @ts-expect-error a message flow needs texting turned on
  account.trackers.updateSource(SourceTrackerId("TRK2"), { messageFlow: { type: "auto-reply", message: "Thanks!" } });

  const tracker = await account.trackers.get(TrackerId("TRK1"));
  if (tracker.type === "session") {
    account.trackers.updateSession(tracker.id, { poolSize: 8 });
  } else {
    account.trackers.updateSource(tracker.id, { campaignName: "spring" });
  }

  const sessions = await account.trackers.list({ type: "session" });
  const onlySession: "session" | undefined = sessions.items[0]?.type;
  account.trackers.updateSession(SessionTrackerId("TRK1"), { source: "all" });
  account.trackers.updateSource(SourceTrackerId("TRK2"), {
    smsEnabled: true,
    messageFlow: { type: "auto-reply", message: "Thanks!" },
  });
}

export function writes(): void {
  // @ts-expect-error spam cannot be undone through the API
  account.calls.update(call, { spam: false });
  // @ts-expect-error a named range and explicit dates cannot be combined
  account.calls.list({ dateRange: "today", startDate: "2026-01-01", endDate: "2026-01-31" });
  // @ts-expect-error order needs a sort field
  account.calls.list({ sort: { order: "desc" } });
  // @ts-expect-error company grouping exists only at account level
  account.calls.summary({ companyId: company, groupBy: "company" });
  // @ts-expect-error an account-level tag cannot name a company
  account.tags.create({ name: "VIP", level: "account", companyId: company });
  // @ts-expect-error media is a URL or a file, never both
  account.textMessages.send({ companyId: company, customerPhoneNumber: "3035550100", content: "Hi", media: { url: "https://example.com/a.png", file: new Uint8Array(), filename: "a.png", contentType: "image/png" } });
  // @ts-expect-error an email-only recipient can only be emailed
  account.notifications.create({ recipient: { email: "ops@example.com" }, scope: { companyId: company }, channels: ["push"] });
  // @ts-expect-error changing an email needs the current password
  account.users.update(UserId("USR1"), { email: "ada@example.com" });
  // @ts-expect-error a manager needs at least one company
  account.users.create({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", role: "manager", companies: [] });
  // @ts-expect-error a summary email needs at least one section
  account.summaryEmails.create({ recipient: { userId: UserId("USR1") }, frequency: ["weekly"], sections: {} });
  // @ts-expect-error schedule times are HHMM on a 24-hour clock
  const late: ClockTime = "2500";

  const close: ClockTime = "1700";
  account.notifications.create({ recipient: { email: "ops@example.com" }, scope: { companyId: company }, channels: ["email"] });
}

export function webhooks(): void {
  // @ts-expect-error post-call timestamps are the call's start time, so no freshness check
  readWebhook("post_call", request, { maxAgeMs: 300_000 });
  // @ts-expect-error a modified-call webhook can arrive days after the call
  readWebhook("updated_call", request, { maxAgeMs: 300_000 });
  // @ts-expect-error outbound post-call timestamps are the call's start time too
  readWebhook("post_outbound_call", request, { maxAgeMs: 300_000 });
  // @ts-expect-error an outbound modified-call webhook can arrive days after the call
  readWebhook("updated_outbound_call", request, { maxAgeMs: 300_000 });
  // @ts-expect-error the form payload has no timestamp to check
  readWebhook("form_captured", request, { maxAgeMs: 300_000 });
  // @ts-expect-error no call decodes a body without the header and the key to verify it
  readWebhook("post_call", { body: new Uint8Array() });
  // @ts-expect-error a string body cannot be verified byte for byte
  readWebhook("post_call", { body: "{}", signature: "c2ln", signingKey: "key" });
  // @ts-expect-error changes exist only on modified-call events
  readWebhook("post_call", request).changes;

  readWebhook("post_call", { body: Buffer.from("{}"), signature: "c2ln", signingKey: "key" });
  readWebhook("sms_received", request, { maxAgeMs: 300_000 });
  readWebhook("convert_assist_complete", request, { maxAgeMs: 300_000 });
  const changes: readonly string[] = readWebhook("updated_call", request).changes;
}

export function cancellation(signal: AbortSignal): void {
  // @ts-expect-error the signal goes in the options object, not in its own argument
  account.calls.get(call, signal);
  // @ts-expect-error writes take the same options object
  account.tags.delete(TagId(993186), signal);

  account.calls.get(call, { fields: ["source"], signal });
  account.calls.list({ pagination: "relative", signal });
  account.tags.delete(TagId(993186), { signal });
}

export function outboundCaller(): void {
  account.calls.create({
    // @ts-expect-error callerId is the 10-digit number, not the caller id record
    callerId: CallerIdId(15),
    customerPhoneNumber: "+13035550100",
    businessPhoneNumber: "+13035550199",
  });

  account.calls.create({
    callerId: OutboundCallerNumber(7703334455),
    customerPhoneNumber: "+13035550100",
    businessPhoneNumber: "+13035550199",
  });
}

export function tagChanges(): void {
  // @ts-expect-error tags are added or replaced, so there is no append_tags flag to forget
  account.calls.update(call, { tags: ["VIP"], appendTags: true });

  account.calls.update(call, { tags: { add: ["VIP"] } });
  account.calls.update(call, { tags: { replace: [] } });
}

export function problems(): string {
  // @ts-expect-error bucket exists only on rate_limited problems
  error.problem.bucket;

  const { problem } = error;
  switch (problem.kind) {
    case "rate_limited":
      return problem.bucket;
    case "invalid_request":
      return Object.keys(problem.fieldErrors).join(", ");
    case "unauthorized":
    case "forbidden":
    case "not_found":
    case "server_error":
    case "network":
    case "timeout":
    case "unexpected_response":
      return problem.kind;
    default: {
      const unreachable: never = problem;
      return unreachable;
    }
  }
}
