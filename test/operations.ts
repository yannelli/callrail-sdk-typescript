import {
  AccountId,
  CallId,
  CallerIdId,
  OutboundCallerNumber,
  CompanyId,
  ConversationId,
  FormSubmissionId,
  IntegrationFilterId,
  IntegrationId,
  MessageFlowId,
  NotificationId,
  PersonId,
  SessionTrackerId,
  SmsThreadId,
  SourceTrackerId,
  SummaryEmailId,
  TagId,
  TrackerId,
  UserId,
  type AccountClient,
  type CallRail,
} from "../src/index.js";

export interface Operation {
  readonly name: string;
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  readonly path: string;
  readonly send: (account: AccountClient, callrail: CallRail) => Promise<unknown>;
}

const company = CompanyId("COM1");
const basicFlow = { type: "basic", destinationNumber: "+13035550199", recordingEnabled: true } as const;

export const operations: readonly Operation[] = [
  { name: "accounts.list", method: "GET", path: "/v3/a.json", send: (_, c) => c.accounts.list() },
  { name: "accounts.get", method: "GET", path: "/v3/a/ACC1.json", send: (_, c) => c.accounts.get(AccountId("ACC1")) },

  { name: "calls.list", method: "GET", path: "/v3/a/ACC1/calls.json", send: (a) => a.calls.list() },
  { name: "calls.get", method: "GET", path: "/v3/a/ACC1/calls/CAL1.json", send: (a) => a.calls.get(CallId("CAL1")) },
  {
    name: "calls.create",
    method: "POST",
    path: "/v3/a/ACC1/calls.json",
    send: (a) =>
      a.calls.create({
        callerId: OutboundCallerNumber(7703334455),
        customerPhoneNumber: "+13035550100",
        businessPhoneNumber: "+13035550199",
      }),
  },
  {
    name: "calls.update",
    method: "PUT",
    path: "/v3/a/ACC1/calls/CAL1.json",
    send: (a) => a.calls.update(CallId("CAL1"), { note: "Call back tomorrow" }),
  },
  { name: "calls.summary", method: "GET", path: "/v3/a/ACC1/calls/summary.json", send: (a) => a.calls.summary() },
  { name: "calls.timeseries", method: "GET", path: "/v3/a/ACC1/calls/timeseries.json", send: (a) => a.calls.timeseries() },
  {
    name: "calls.recording",
    method: "GET",
    path: "/v3/a/ACC1/calls/CAL1/recording.json",
    send: (a) => a.calls.recording(CallId("CAL1")),
  },
  {
    name: "calls.pageViews",
    method: "GET",
    path: "/v3/a/ACC1/calls/CAL1/page_views.json",
    send: (a) => a.calls.pageViews(CallId("CAL1")),
  },

  { name: "tags.list", method: "GET", path: "/v3/a/ACC1/tags.json", send: (a) => a.tags.list() },
  {
    name: "tags.create",
    method: "POST",
    path: "/v3/a/ACC1/tags.json",
    send: (a) => a.tags.create({ name: "VIP", level: "account" }),
  },
  {
    name: "tags.update",
    method: "PUT",
    path: "/v3/a/ACC1/tags/993186.json",
    send: (a) => a.tags.update(TagId(993186), { color: "blue1" }),
  },
  { name: "tags.delete", method: "DELETE", path: "/v3/a/ACC1/tags/993186.json", send: (a) => a.tags.delete(TagId(993186)) },

  { name: "companies.list", method: "GET", path: "/v3/a/ACC1/companies.json", send: (a) => a.companies.list() },
  { name: "companies.get", method: "GET", path: "/v3/a/ACC1/companies/COM1.json", send: (a) => a.companies.get(company) },
  {
    name: "companies.create",
    method: "POST",
    path: "/v3/a/ACC1/companies.json",
    send: (a) => a.companies.create({ name: "Acme Plumbing" }),
  },
  {
    name: "companies.update",
    method: "PUT",
    path: "/v3/a/ACC1/companies/COM1.json",
    send: (a) => a.companies.update(company, { timeZone: "America/Denver" }),
  },
  {
    name: "companies.bulkUpdate",
    method: "POST",
    path: "/v3/a/ACC1/companies/bulk_update.json",
    send: (a) => a.companies.bulkUpdate({ companies: "all", externalFormCapture: true }),
  },
  { name: "companies.disable", method: "DELETE", path: "/v3/a/ACC1/companies/COM1.json", send: (a) => a.companies.disable(company) },

  { name: "formSubmissions.list", method: "GET", path: "/v3/a/ACC1/form_submissions.json", send: (a) => a.formSubmissions.list() },
  {
    name: "formSubmissions.create",
    method: "POST",
    path: "/v3/a/ACC1/form_submissions.json",
    send: (a) =>
      a.formSubmissions.create({
        companyId: company,
        formUrl: "https://example.com/contact",
        formData: { name: "James Smith", phone: "303-555-0100" },
        referrer: "google",
        referringUrl: "https://www.google.com/",
        landingPageUrl: "https://example.com/?utm_source=google",
      }),
  },
  {
    name: "formSubmissions.update",
    method: "PUT",
    path: "/v3/a/ACC1/form_submissions/FOR1.json",
    send: (a) => a.formSubmissions.update(FormSubmissionId("FOR1"), { leadStatus: "good_lead" }),
  },
  {
    name: "formSubmissions.ignoreFields",
    method: "POST",
    path: "/v3/a/ACC1/form_submissions/ignored_fields.json",
    send: (a) => a.formSubmissions.ignoreFields({ companies: "all", fieldNames: ["ssn"] }),
  },
  { name: "formSubmissions.summary", method: "GET", path: "/v3/a/ACC1/forms/summary.json", send: (a) => a.formSubmissions.summary() },

  {
    name: "integrations.list",
    method: "GET",
    path: "/v3/a/ACC1/integrations.json",
    send: (a) => a.integrations.list({ companyId: company }),
  },
  {
    name: "integrations.get",
    method: "GET",
    path: "/v3/a/ACC1/integrations/7.json",
    send: (a) => a.integrations.get(IntegrationId(7)),
  },
  {
    name: "integrations.create",
    method: "POST",
    path: "/v3/a/ACC1/integrations.json",
    send: (a) =>
      a.integrations.create({
        companyId: company,
        type: "Webhooks",
        webhooks: { post_call: ["https://example.com/webhooks/callrail/post_call"] },
      }),
  },
  {
    name: "integrations.update",
    method: "PUT",
    path: "/v3/a/ACC1/integrations/7.json",
    send: (a) => a.integrations.update(IntegrationId(7), { state: "disabled" }),
  },
  {
    name: "integrations.disable",
    method: "DELETE",
    path: "/v3/a/ACC1/integrations/7.json",
    send: (a) => a.integrations.disable(IntegrationId(7)),
  },

  {
    name: "integrationFilters.list",
    method: "GET",
    path: "/v3/a/ACC1/integration_triggers.json",
    send: (a) => a.integrationFilters.list({ companyId: company }),
  },
  {
    name: "integrationFilters.create",
    method: "POST",
    path: "/v3/a/ACC1/integration_triggers.json",
    send: (a) => a.integrationFilters.create({ companyId: company, integrationId: IntegrationId(7), callType: "first_call" }),
  },
  {
    name: "integrationFilters.get",
    method: "GET",
    path: "/v3/a/ACC1/integration_triggers/3.json",
    send: (a) => a.integrationFilters.get(IntegrationFilterId(3)),
  },
  {
    name: "integrationFilters.update",
    method: "PUT",
    path: "/v3/a/ACC1/integration_triggers/3.json",
    send: (a) => a.integrationFilters.update(IntegrationFilterId(3), { minDuration: 30 }),
  },
  {
    name: "integrationFilters.delete",
    method: "DELETE",
    path: "/v3/a/ACC1/integration_triggers/3.json",
    send: (a) => a.integrationFilters.delete(IntegrationFilterId(3)),
  },

  { name: "notifications.list", method: "GET", path: "/v3/a/ACC1/notifications.json", send: (a) => a.notifications.list() },
  {
    name: "notifications.create",
    method: "POST",
    path: "/v3/a/ACC1/notifications.json",
    send: (a) => a.notifications.create({ channels: ["email"], callAlerts: "missed_and_vm" }),
  },
  {
    name: "notifications.update",
    method: "PUT",
    path: "/v3/a/ACC1/notifications/11.json",
    send: (a) => a.notifications.update(NotificationId(11), { smsAlerts: true }),
  },
  {
    name: "notifications.delete",
    method: "DELETE",
    path: "/v3/a/ACC1/notifications/11.json",
    send: (a) => a.notifications.delete(NotificationId(11)),
  },

  {
    name: "callerIds.list",
    method: "GET",
    path: "/v3/a/ACC1/caller_ids.json",
    send: (a) => a.callerIds.list({ companyId: company }),
  },
  { name: "callerIds.get", method: "GET", path: "/v3/a/ACC1/caller_ids/42.json", send: (a) => a.callerIds.get(CallerIdId(42)) },
  {
    name: "callerIds.create",
    method: "POST",
    path: "/v3/a/ACC1/caller_ids.json",
    send: (a) => a.callerIds.create({ companyId: company, phoneNumber: "+13035550199", name: "Front desk" }),
  },
  {
    name: "callerIds.delete",
    method: "DELETE",
    path: "/v3/a/ACC1/caller_ids/42.json",
    send: (a) => a.callerIds.delete(CallerIdId(42)),
  },

  { name: "smsThreads.list", method: "GET", path: "/v3/a/ACC1/sms-threads.json", send: (a) => a.smsThreads.list() },
  {
    name: "smsThreads.get",
    method: "GET",
    path: "/v3/a/ACC1/sms-threads/SMT1.json",
    send: (a) => a.smsThreads.get(SmsThreadId("SMT1")),
  },
  {
    name: "smsThreads.update",
    method: "PUT",
    path: "/v3/a/ACC1/sms-threads/SMT1.json",
    send: (a) => a.smsThreads.update(SmsThreadId("SMT1"), { notes: "Asked for a quote" }),
  },

  { name: "summaryEmails.list", method: "GET", path: "/v3/a/ACC1/summary_emails", send: (a) => a.summaryEmails.list() },
  {
    name: "summaryEmails.create",
    method: "POST",
    path: "/v3/a/ACC1/summary_emails.json",
    send: (a) =>
      a.summaryEmails.create({
        recipient: { userId: UserId("USR1") },
        frequency: ["weekly"],
        sections: { summaryStatistics: true, topSources: true },
      }),
  },
  {
    name: "summaryEmails.get",
    method: "GET",
    path: "/v3/a/ACC1/summary_emails/SUM1.json",
    send: (a) => a.summaryEmails.get(SummaryEmailId("SUM1")),
  },
  {
    name: "summaryEmails.update",
    method: "PUT",
    path: "/v3/a/ACC1/summary_emails/SUM1.json",
    send: (a) => a.summaryEmails.update(SummaryEmailId("SUM1"), { sections: { callLog: true } }),
  },
  {
    name: "summaryEmails.delete",
    method: "DELETE",
    path: "/v3/a/ACC1/summary_emails/SUM1.json",
    send: (a) => a.summaryEmails.delete(SummaryEmailId("SUM1")),
  },

  { name: "textMessages.list", method: "GET", path: "/v3/a/ACC1/text-messages.json", send: (a) => a.textMessages.list() },
  {
    name: "textMessages.get",
    method: "GET",
    path: "/v3/a/ACC1/text-messages/SCI1.json",
    send: (a) => a.textMessages.get(ConversationId("SCI1")),
  },
  {
    name: "textMessages.send",
    method: "POST",
    path: "/v3/a/ACC1/text-messages.json",
    send: (a) =>
      a.textMessages.send({
        companyId: company,
        customerPhoneNumber: "3035550100",
        trackingNumber: "3035550199",
        content: "Your table is ready.",
      }),
  },

  { name: "messageFlows.list", method: "GET", path: "/v3/a/ACC1/message-flows.json", send: (a) => a.messageFlows.list() },
  {
    name: "messageFlows.get",
    method: "GET",
    path: "/v3/a/ACC1/message-flows/MFL1.json",
    send: (a) => a.messageFlows.get(MessageFlowId("MFL1")),
  },
  {
    name: "messageFlows.create",
    method: "POST",
    path: "/v3/a/ACC1/message-flows.json",
    send: (a) =>
      a.messageFlows.create({
        companyId: company,
        name: "After hours",
        steps: [{ type: "sms_response", id: "reply", message: "We are closed.", firstText: false, nextStepId: null }],
      }),
  },
  {
    name: "messageFlows.update",
    method: "PUT",
    path: "/v3/a/ACC1/message-flows/MFL1.json",
    send: (a) => a.messageFlows.update(MessageFlowId("MFL1"), { name: "After hours v2" }),
  },
  {
    name: "messageFlows.delete",
    method: "DELETE",
    path: "/v3/a/ACC1/message-flows/MFL1.json",
    send: (a) => a.messageFlows.delete(MessageFlowId("MFL1")),
  },

  { name: "trackers.list", method: "GET", path: "/v3/a/ACC1/trackers.json", send: (a) => a.trackers.list() },
  { name: "trackers.get", method: "GET", path: "/v3/a/ACC1/trackers/TRK1.json", send: (a) => a.trackers.get(TrackerId("TRK1")) },
  {
    name: "trackers.createSession",
    method: "POST",
    path: "/v3/a/ACC1/trackers.json",
    send: (a) =>
      a.trackers.createSession({
        name: "Website visitors",
        companyId: company,
        callFlow: basicFlow,
        poolSize: 4,
        poolNumbers: { kind: "local", near: "+13035550199" },
        source: "all",
      }),
  },
  {
    name: "trackers.createSource",
    method: "POST",
    path: "/v3/a/ACC1/trackers.json",
    send: (a) =>
      a.trackers.createSource({
        name: "Billboard I-25",
        companyId: company,
        callFlow: basicFlow,
        trackingNumber: { kind: "toll_free" },
        source: { type: "offline" },
      }),
  },
  {
    name: "trackers.updateSession",
    method: "PUT",
    path: "/v3/a/ACC1/trackers/TRK1.json",
    send: (a) => a.trackers.updateSession(SessionTrackerId("TRK1"), { poolSize: 6 }),
  },
  {
    name: "trackers.updateSource",
    method: "PUT",
    path: "/v3/a/ACC1/trackers/TRK1.json",
    send: (a) => a.trackers.updateSource(SourceTrackerId("TRK1"), { name: "Billboard I-70" }),
  },
  {
    name: "trackers.disable",
    method: "DELETE",
    path: "/v3/a/ACC1/trackers/TRK1.json",
    send: (a) => a.trackers.disable(TrackerId("TRK1")),
  },

  { name: "users.list", method: "GET", path: "/v3/a/ACC1/users.json", send: (a) => a.users.list() },
  { name: "users.get", method: "GET", path: "/v3/a/ACC1/users/USR1.json", send: (a) => a.users.get(UserId("USR1")) },
  {
    name: "users.create",
    method: "POST",
    path: "/v3/a/ACC1/users.json",
    send: (a) =>
      a.users.create({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        role: "manager",
        companies: [company],
      }),
  },
  {
    name: "users.update",
    method: "PUT",
    path: "/v3/a/ACC1/users/USR1.json",
    send: (a) => a.users.update(UserId("USR1"), { firstName: "Augusta" }),
  },
  { name: "users.delete", method: "DELETE", path: "/v3/a/ACC1/users/USR1.json", send: (a) => a.users.delete(UserId("USR1")) },

  { name: "leads.list", method: "GET", path: "/v3/a/ACC1/leads.json", send: (a) => a.leads.list() },
  {
    name: "leads.timeline",
    method: "GET",
    path: "/v3/a/ACC1/leads/PER1/timeline.json",
    send: (a) => a.leads.timeline(PersonId("PER1")),
  },
];
