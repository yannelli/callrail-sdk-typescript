/**
 * The entry point. `new CallRail(options)` validates configuration once.
 * `callrail.account(id)` returns an `AccountClient` without sending a request.
 * Every resource hangs off it, so the account id is written once per process,
 * not once per call.
 */

import { AccountId } from "./ids.js";
import { Http, resolveConfig, type CallRailOptions } from "./http.js";
import { Accounts } from "./resources/accounts.js";
import { Calls } from "./resources/calls.js";
import { CallerIds } from "./resources/caller-ids.js";
import { Companies } from "./resources/companies.js";
import { FormSubmissions } from "./resources/form-submissions.js";
import { IntegrationFilters } from "./resources/integration-filters.js";
import { Integrations } from "./resources/integrations.js";
import { Leads } from "./resources/leads.js";
import { MessageFlows } from "./resources/message-flows.js";
import { Notifications } from "./resources/notifications.js";
import { SmsThreads } from "./resources/sms-threads.js";
import { SummaryEmails } from "./resources/summary-emails.js";
import { Tags } from "./resources/tags.js";
import { TextMessages } from "./resources/text-messages.js";
import { Trackers } from "./resources/trackers.js";
import { Users } from "./resources/users.js";

export class CallRail {
  /** Listing accounts is the one call that takes no account id. */
  readonly accounts: Accounts;
  readonly #http: Http;

  /** Throws `TypeError` for invalid options. See `CallRailOptions`. */
  constructor(options: CallRailOptions) {
    this.#http = new Http(resolveConfig(options));
    this.accounts = new Accounts(this.#http);
  }

  /**
   * Scopes every resource to one account. Accepts `ACC…` or the nine-digit
   * number from the app URL, because this id usually comes from configuration.
   * Sends no request.
   */
  account(id: AccountId | string | number): AccountClient {
    return new AccountClient(this.#http, AccountId(id));
  }
}

export class AccountClient {
  readonly id: AccountId;
  readonly calls: Calls;
  readonly tags: Tags;
  readonly companies: Companies;
  readonly formSubmissions: FormSubmissions;
  readonly integrations: Integrations;
  readonly integrationFilters: IntegrationFilters;
  readonly notifications: Notifications;
  readonly callerIds: CallerIds;
  readonly smsThreads: SmsThreads;
  readonly summaryEmails: SummaryEmails;
  readonly textMessages: TextMessages;
  readonly messageFlows: MessageFlows;
  readonly trackers: Trackers;
  readonly users: Users;
  readonly leads: Leads;

  /** @internal */
  constructor(http: Http, id: AccountId) {
    this.id = id;
    this.calls = new Calls(http, id);
    this.tags = new Tags(http, id);
    this.companies = new Companies(http, id);
    this.formSubmissions = new FormSubmissions(http, id);
    this.integrations = new Integrations(http, id);
    this.integrationFilters = new IntegrationFilters(http, id);
    this.notifications = new Notifications(http, id);
    this.callerIds = new CallerIds(http, id);
    this.smsThreads = new SmsThreads(http, id);
    this.summaryEmails = new SummaryEmails(http, id);
    this.textMessages = new TextMessages(http, id);
    this.messageFlows = new MessageFlows(http, id);
    this.trackers = new Trackers(http, id);
    this.users = new Users(http, id);
    this.leads = new Leads(http, id);
  }
}
