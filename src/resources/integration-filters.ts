/**
 * Integration filters limit which calls an integration receives. CallRail's
 * path is `integration_triggers` and its collection key is `integration_criteria`.
 * The SDK uses the product name, filters.
 */

import { CompanyId, IntegrationFilterId, IntegrationId, TrackerId } from "../ids.js";
import type { AccountId } from "../ids.js";
import { array, emptyAsNull, id, integer, nullable, object, open, string, type Open } from "../decode.js";
import { v3, type Http, type RequestOptions } from "../http.js";
import { offsetPages, type OffsetPage, type PagePromise } from "../pagination.js";
import type { OffsetPaging } from "../query.js";

export type FilterCallType = "first_call" | "vm" | "missed_and_vm";

export interface IntegrationFilter {
  readonly id: IntegrationFilterId;
  readonly companyId: CompanyId;
  /** `null` on the company's default filter, which covers every integration that has no filter of its own. */
  readonly integrationId: IntegrationId | null;
  readonly trackerIds: readonly TrackerId[];
  /** `null` means every call type. */
  readonly callType: Open<FilterCallType> | null;
  /** Seconds. */
  readonly minDuration: number | null;
  /** Seconds. */
  readonly maxDuration: number | null;
  /** The docs type this as an integer and list `good_lead` and `not_a_lead`. Kept as sent until that is resolved. */
  readonly leadStatus: string | number | null;
  /** CallRail sideloads only the integration's id and type, such as `"Webhooks"` or `"All (Default Integration Trigger)"`. */
  readonly integration: { readonly id: IntegrationId | null; readonly type: string } | null;
}

export interface IntegrationFilterInput {
  readonly companyId: CompanyId;
  readonly integrationId: IntegrationId;
  readonly trackerIds?: readonly TrackerId[];
  readonly callType?: FilterCallType | null;
  readonly minDuration?: number;
  readonly maxDuration?: number;
  readonly leadStatus?: "good_lead" | "not_a_lead";
}

/** Omitted keys stay as they are. `null` clears. */
export interface IntegrationFilterUpdate {
  readonly trackerIds?: readonly TrackerId[];
  readonly callType?: FilterCallType | null;
  readonly minDuration?: number | null;
  readonly maxDuration?: number | null;
  readonly leadStatus?: "good_lead" | "not_a_lead" | null;
}

const integrationId = emptyAsNull(id(IntegrationId));

const integrationFilter = object<IntegrationFilter>({
  id: id(IntegrationFilterId),
  companyId: id(CompanyId),
  integrationId,
  trackerIds: array(id(TrackerId)),
  callType: nullable(open("first_call", "vm", "missed_and_vm")),
  minDuration: emptyAsNull(integer),
  maxDuration: emptyAsNull(integer),
  leadStatus: nullable<string | number>((input, path) => (typeof input === "number" ? input : string(input, path))),
  integration: nullable(object({ id: integrationId, type: string })),
});

export class IntegrationFilters {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/integration_triggers.json`. `companyId` is required by CallRail. */
  list(
    query: { readonly companyId: CompanyId } & OffsetPaging & RequestOptions,
  ): PagePromise<OffsetPage<IntegrationFilter>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/integration_triggers.json`,
        query: { company_id: query.companyId, page: query.page, per_page: query.perPage },
      },
      "integration_criteria",
      integrationFilter,
      query,
    );
  }

  /** `POST /v3/a/{account_id}/integration_triggers.json`. */
  create(input: IntegrationFilterInput, options?: RequestOptions): Promise<IntegrationFilter> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/integration_triggers.json`,
        body: {
          kind: "json",
          value: {
            company_id: input.companyId,
            integration_id: input.integrationId,
            tracker_ids: input.trackerIds,
            call_type: input.callType,
            min_duration: input.minDuration,
            max_duration: input.maxDuration,
            lead_status: input.leadStatus,
          },
        },
      },
      integrationFilter,
      options,
    );
  }

  /** `GET /v3/a/{account_id}/integration_triggers/{id}.json`. */
  get(id: IntegrationFilterId, options?: RequestOptions): Promise<IntegrationFilter> {
    return this.#http.json(
      { method: "GET", path: v3`a/${this.#accountId}/integration_triggers/${id}.json` },
      integrationFilter,
      options,
    );
  }

  /** `PUT /v3/a/{account_id}/integration_triggers/{id}.json`. The docs table drops the leading slash. The real path has it. */
  update(id: IntegrationFilterId, changes: IntegrationFilterUpdate, options?: RequestOptions): Promise<IntegrationFilter> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/integration_triggers/${id}.json`,
        body: {
          kind: "json",
          value: {
            tracker_ids: changes.trackerIds,
            call_type: changes.callType,
            min_duration: changes.minDuration,
            max_duration: changes.maxDuration,
            lead_status: changes.leadStatus,
          },
        },
      },
      integrationFilter,
      options,
    );
  }

  /** `DELETE /v3/a/{account_id}/integration_triggers/{id}.json`. The integration keeps running unfiltered. 204. */
  delete(id: IntegrationFilterId, options?: RequestOptions): Promise<void> {
    return this.#http.empty({ method: "DELETE", path: v3`a/${this.#accountId}/integration_triggers/${id}.json` }, options);
  }
}
