/**
 * Companies live inside an account. Trackers, calls, texts, and forms point at one.
 * `disable` is CallRail's DELETE. It deactivates the company, its tracking
 * numbers, and its swap.js script. It is not a hard delete.
 */

import { CompanyId } from "../ids.js";
import type { AccountId } from "../ids.js";
import {
  array,
  boolean,
  emptyAsNull,
  falseWhenMissing,
  id,
  integer,
  nullable,
  object,
  open,
  selected,
  string,
  wire,
  type Decoder,
  type Open,
  type Shape,
} from "../decode.js";
import { v3, type Http, type RequestOptions } from "../http.js";
import { offsetPages, type OffsetPage, type PagePromise } from "../pagination.js";
import { encodeFields, encodeSort, type OffsetPaging, type Sort } from "../query.js";

export interface CookieDuration {
  readonly value: number;
  readonly unit: Open<"days" | "weeks" | "months">;
}

export interface CompanyBase {
  readonly id: CompanyId;
  readonly name: string;
  readonly status: Open<"active" | "disabled">;
  readonly timeZone: string;
  readonly createdAt: string;
  readonly disabledAt: string | null;
  readonly dniActive: boolean | null;
  readonly scriptUrl: string | null;
  readonly callscoreEnabled: boolean;
  readonly leadScoringEnabled: boolean;
  /** Deprecated by CallRail and has no effect. CallRail sends `null` for it, which decodes as `false`. */
  readonly swapExcludeJquery: boolean;
  /** CallRail sends `null` until the override is first set, which decodes as `false`. */
  readonly swapPpcOverride: boolean;
  readonly swapLandingOverride: string | null;
  /** `swap_cookie_duration` and `swap_cookie_duration_unit`, kept together because one is meaningless without the other. */
  readonly swapCookieDuration: CookieDuration | null;
  readonly callscribeEnabled: boolean;
  readonly keywordSpottingEnabled: boolean;
  readonly formCapture: boolean;
}

export interface CompanyExtras {
  readonly verifiedCallerIds: readonly { readonly name: string; readonly phoneNumber: string }[] | null;
}

export type CompanyField = keyof CompanyExtras;
export type Company<F extends CompanyField = never> = CompanyBase & Pick<CompanyExtras, F>;

export interface CompanyListQuery<F extends CompanyField> extends OffsetPaging {
  readonly status?: "active" | "disabled";
  readonly search?: string;
  readonly sort?: Sort<"name">;
  readonly fields?: readonly F[];
}

export interface CompanyInput {
  readonly name: string;
  readonly timeZone?: string;
}

/** Omitted keys stay as they are. */
export interface CompanyUpdate {
  readonly name?: string;
  readonly timeZone?: string;
  readonly callscoreEnabled?: boolean;
  readonly keywordSpottingEnabled?: boolean;
  readonly callscribeEnabled?: boolean;
  readonly swapExcludeJquery?: boolean;
  readonly swapPpcOverride?: boolean;
  /** `null` clears the override. */
  readonly swapLandingOverride?: string | null;
  readonly swapCookieDuration?: { readonly value: number; readonly unit: "days" | "weeks" | "months" };
  readonly externalFormCapture?: boolean;
}

export interface CompanyBulkUpdate {
  /** `"all"` sends `["all"]`, CallRail's spelling for every company in the account. */
  readonly companies: readonly [CompanyId, ...CompanyId[]] | "all";
  readonly externalFormCapture: boolean;
}

const companyShape = {
  id: id(CompanyId),
  name: string,
  status: open("active", "disabled"),
  timeZone: string,
  createdAt: string,
  disabledAt: nullable(string),
  dniActive: nullable(boolean),
  scriptUrl: nullable(string),
  callscoreEnabled: boolean,
  leadScoringEnabled: boolean,
  swapExcludeJquery: falseWhenMissing,
  swapPpcOverride: falseWhenMissing,
  swapLandingOverride: nullable(string),
  callscribeEnabled: boolean,
  keywordSpottingEnabled: boolean,
  formCapture: boolean,
} satisfies Shape<Omit<CompanyBase, "swapCookieDuration">>;

const companyExtrasShape = {
  verifiedCallerIds: emptyAsNull(array(object({ name: string, phoneNumber: string }))),
} satisfies Shape<CompanyExtras>;

const cookieDuration = object({
  value: wire("swap_cookie_duration", emptyAsNull(integer)),
  unit: wire("swap_cookie_duration_unit", nullable(string)),
});

function withCookieDuration<T extends object>(decode: Decoder<T>): Decoder<T & Pick<CompanyBase, "swapCookieDuration">> {
  return (input, path) => {
    const { value, unit } = cookieDuration(input, path);
    return { ...decode(input, path), swapCookieDuration: value === null || unit === null ? null : { value, unit } };
  };
}

const company = withCookieDuration(object(companyShape));

export class Companies {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/companies.json`. */
  list<const F extends CompanyField = never>(
    query: CompanyListQuery<F> & RequestOptions = {},
  ): PagePromise<OffsetPage<Company<F>>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/companies.json`,
        query: {
          status: query.status,
          search: query.search,
          ...encodeSort(query.sort),
          ...encodeFields(query.fields),
          page: query.page,
          per_page: query.perPage,
        },
      },
      "companies",
      withCookieDuration(selected(companyShape, companyExtrasShape, query.fields)),
      query,
    );
  }

  /** `GET /v3/a/{account_id}/companies/{company_id}.json`. */
  get<const F extends CompanyField = never>(
    id: CompanyId,
    options: { readonly fields?: readonly F[] } & RequestOptions = {},
  ): Promise<Company<F>> {
    return this.#http.json(
      { method: "GET", path: v3`a/${this.#accountId}/companies/${id}.json`, query: encodeFields(options.fields) },
      withCookieDuration(selected(companyShape, companyExtrasShape, options.fields)),
      options,
    );
  }

  /**
   * `POST /v3/a/{account_id}/companies.json`. The documented response has no
   * `form_capture`, so `formCapture` decodes as `false` when it is absent.
   */
  create(input: CompanyInput, options?: RequestOptions): Promise<Company> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/companies.json`,
        body: { kind: "json", value: { name: input.name, time_zone: input.timeZone } },
      },
      withCookieDuration(object({ ...companyShape, formCapture: falseWhenMissing })),
      options,
    );
  }

  /** `PUT /v3/a/{account_id}/companies/{company_id}.json`. */
  update(id: CompanyId, changes: CompanyUpdate, options?: RequestOptions): Promise<Company> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/companies/${id}.json`,
        body: {
          kind: "json",
          value: {
            name: changes.name,
            time_zone: changes.timeZone,
            callscore_enabled: changes.callscoreEnabled,
            keyword_spotting_enabled: changes.keywordSpottingEnabled,
            callscribe_enabled: changes.callscribeEnabled,
            swap_exclude_jquery: changes.swapExcludeJquery,
            swap_ppc_override: changes.swapPpcOverride,
            swap_landing_override: changes.swapLandingOverride,
            swap_cookie_duration: changes.swapCookieDuration?.value,
            swap_cookie_duration_unit: changes.swapCookieDuration?.unit,
            external_form_capture: changes.externalFormCapture,
          },
        },
      },
      company,
      options,
    );
  }

  /** `POST /v3/a/{account_id}/companies/bulk_update.json`. */
  bulkUpdate(input: CompanyBulkUpdate, options?: RequestOptions): Promise<{ readonly updatedRecords: number }> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/companies/bulk_update.json`,
        body: {
          kind: "json",
          value: {
            company_ids: input.companies === "all" ? ["all"] : input.companies,
            external_form_capture: input.externalFormCapture,
          },
        },
      },
      object({ updatedRecords: integer }),
      options,
    );
  }

  /** `DELETE /v3/a/{account_id}/companies/{company_id}.json`. 204. The last active company cannot be disabled. */
  disable(id: CompanyId, options?: RequestOptions): Promise<void> {
    return this.#http.empty({ method: "DELETE", path: v3`a/${this.#accountId}/companies/${id}.json` }, options);
  }
}
