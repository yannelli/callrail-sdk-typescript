/**
 * Summary email subscriptions. The index path has no `.json`
 * (`GET /v3/a/{account_id}/summary_emails`). Every other route has it.
 */

import { AccountId, CompanyId, SummaryEmailId, UserId } from "../ids.js";
import {
  array,
  boolean,
  DecodeError,
  id,
  nullable,
  object,
  oneOf,
  string,
  wire,
  type Decoder,
  type Open,
} from "../decode.js";
import { v3, type Http, type JsonBody, type RequestOptions } from "../http.js";
import { offsetPages, type OffsetPage, type PagePromise } from "../pagination.js";
import type { AtLeastOne, NonEmpty, OffsetPaging } from "../query.js";

export type SummaryFrequency = "daily" | "weekly" | "monthly";

/** Which report sections the email includes. Wire keys `summary_statistics`, `top_sources`, `top_keywords`, `call_log`. */
export interface SummarySections {
  readonly summaryStatistics: boolean;
  readonly topSources: boolean;
  readonly topKeywords: boolean;
  readonly callLog: boolean;
}

/** CallRail's labels, verbatim. */
export type SummaryLeadFilter = "Lead" | "Not a Lead" | "Not Scored" | "All";

export interface SummaryEmail {
  readonly id: SummaryEmailId;
  readonly scope:
    | { readonly type: "Company"; readonly id: CompanyId; readonly name: string }
    | { readonly type: "Account"; readonly id: AccountId; readonly name: string };
  /** The single-record tables say string and every example sends an array. Both decode to an array. */
  readonly frequency: readonly Open<SummaryFrequency>[];
  readonly sections: SummarySections;
  readonly leadStatus: Open<SummaryLeadFilter> | null;
  readonly recipient:
    | { readonly type: "user"; readonly userId: UserId; readonly name: string; readonly email: string }
    | { readonly type: "email"; readonly email: string };
}

/** A user recipient defaults to account scope. An email-only recipient must name a company. */
export type SummaryEmailRecipient =
  | { readonly recipient: { readonly userId: UserId }; readonly companyId?: CompanyId }
  | { readonly recipient: { readonly email: string }; readonly companyId: CompanyId };

export type SummaryEmailInput = SummaryEmailRecipient & {
  readonly frequency: NonEmpty<SummaryFrequency>;
  readonly sections: AtLeastOne<SummarySections>;
  readonly leadStatus?: SummaryLeadFilter;
};

/** CallRail requires `sections` on every update. `frequency`, when given, replaces the subscribed set. */
export interface SummaryEmailUpdate {
  readonly sections: AtLeastOne<SummarySections>;
  readonly frequency?: NonEmpty<SummaryFrequency>;
  readonly leadStatus?: SummaryLeadFilter;
}

export type SummaryEmailListQuery = OffsetPaging & {
  readonly frequency?: readonly SummaryFrequency[];
  /** Omit for account-level subscriptions. */
  readonly companyId?: CompanyId;
} & ({ readonly userId?: UserId; readonly email?: never } | { readonly email?: string; readonly userId?: never });

const scopeType = object({ type: oneOf("Company", "Account") });
const companyScope = object({ type: oneOf("Company"), id: id(CompanyId), name: string });
const accountScope = object({ type: oneOf("Account"), id: id(AccountId), name: string });

const scope: Decoder<SummaryEmail["scope"]> = (input, path) =>
  scopeType(input, path).type === "Company" ? companyScope(input, path) : accountScope(input, path);

const frequency: Decoder<readonly Open<SummaryFrequency>[]> = (input, path) =>
  typeof input === "string" ? [input] : array(string)(input, path);

const sections = object<SummarySections>({
  summaryStatistics: boolean,
  topSources: boolean,
  topKeywords: boolean,
  callLog: boolean,
});

const leadFilter = object({ leadStatus: nullable(string) });

const summaryEmailFields = object<Omit<SummaryEmail, "recipient">>({
  id: id(SummaryEmailId),
  scope,
  frequency,
  sections: wire("config", sections),
  leadStatus: wire("filters", nullable((input, path) => leadFilter(input, path).leadStatus)),
});

const recipients = object({
  user: nullable(object({ userId: wire("id", id(UserId)), name: string, email: string })),
  email: nullable(string),
});

/** A user recipient arrives as `user`. An email-only recipient arrives as a top-level `email`. */
const recipient: Decoder<SummaryEmail["recipient"]> = (input, path) => {
  const { user, email } = recipients(input, path);
  if (user !== null) return { type: "user", ...user };
  if (email !== null) return { type: "email", email };
  throw new DecodeError(`${path}.user`, "a user or an email-only recipient", undefined);
};

const summaryEmail: Decoder<SummaryEmail> = (input, path) => ({
  ...summaryEmailFields(input, path),
  recipient: recipient(input, path),
});

function encodeSections(sections: AtLeastOne<SummarySections>): JsonBody {
  return {
    summary_statistics: sections.summaryStatistics,
    top_sources: sections.topSources,
    top_keywords: sections.topKeywords,
    call_log: sections.callLog,
  };
}

function encodeLeadFilter(leadStatus: SummaryLeadFilter | undefined): JsonBody | undefined {
  return leadStatus === undefined ? undefined : { lead_status: leadStatus };
}

export class SummaryEmails {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/summary_emails`. No `.json`. Non-admin keys see only their own subscriptions. */
  list(query: SummaryEmailListQuery & RequestOptions = {}): PagePromise<OffsetPage<SummaryEmail>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/summary_emails`,
        query: {
          frequency: query.frequency,
          company_id: query.companyId,
          user_id: query.userId,
          email: query.email,
          page: query.page,
          per_page: query.perPage,
        },
      },
      "summary_emails",
      summaryEmail,
      query,
    );
  }

  /** `POST /v3/a/{account_id}/summary_emails.json`. */
  create(input: SummaryEmailInput, options?: RequestOptions): Promise<SummaryEmail> {
    const { recipient } = input;
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/summary_emails.json`,
        body: {
          kind: "json",
          value: {
            ...("email" in recipient ? { email: recipient.email } : { user_id: recipient.userId }),
            company_id: input.companyId,
            frequency: input.frequency,
            config: encodeSections(input.sections),
            filters: encodeLeadFilter(input.leadStatus),
          },
        },
      },
      summaryEmail,
      options,
    );
  }

  /** `GET /v3/a/{account_id}/summary_emails/{summary_email_id}.json`. */
  get(id: SummaryEmailId, options?: RequestOptions): Promise<SummaryEmail> {
    return this.#http.json(
      { method: "GET", path: v3`a/${this.#accountId}/summary_emails/${id}.json` },
      summaryEmail,
      options,
    );
  }

  /** `PUT /v3/a/{account_id}/summary_emails/{summary_email_id}.json`. */
  update(id: SummaryEmailId, changes: SummaryEmailUpdate, options?: RequestOptions): Promise<SummaryEmail> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/summary_emails/${id}.json`,
        body: {
          kind: "json",
          value: {
            frequency: changes.frequency,
            config: encodeSections(changes.sections),
            filters: encodeLeadFilter(changes.leadStatus),
          },
        },
      },
      summaryEmail,
      options,
    );
  }

  /** `DELETE /v3/a/{account_id}/summary_emails/{summary_email_id}.json`. Unsubscribes. 204. */
  delete(id: SummaryEmailId, options?: RequestOptions): Promise<void> {
    return this.#http.empty({ method: "DELETE", path: v3`a/${this.#accountId}/summary_emails/${id}.json` }, options);
  }
}
