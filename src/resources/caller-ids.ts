/**
 * Outbound caller ids are business numbers verified to appear as the caller on
 * outbound calls. `calls.create` takes one as `callerId`.
 */

import { CallerIdId, CompanyId } from "../ids.js";
import type { AccountId } from "../ids.js";
import { boolean, id, nullable, object, string } from "../decode.js";
import { v3, type Http, type RequestOptions } from "../http.js";
import { offsetPages, type OffsetPage, type PagePromise } from "../pagination.js";
import type { OffsetPaging } from "../query.js";

export interface CallerId {
  readonly id: CallerIdId;
  readonly phoneNumber: string;
  readonly name: string;
  readonly companyId: CompanyId;
  /** `false` until the number is validated. */
  readonly verified: boolean;
  readonly createdAt: string;
  readonly validationCode: string | null;
}

export interface CallerIdInput {
  readonly companyId: CompanyId;
  readonly phoneNumber: string;
  readonly name: string;
}

const callerId = object<CallerId>({
  id: id(CallerIdId),
  phoneNumber: string,
  name: string,
  companyId: id(CompanyId),
  verified: boolean,
  createdAt: string,
  validationCode: nullable(string),
});

export class CallerIds {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/caller_ids.json`. `companyId` is required by CallRail. */
  list(query: { readonly companyId: CompanyId } & OffsetPaging & RequestOptions): PagePromise<OffsetPage<CallerId>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/caller_ids.json`,
        query: { company_id: query.companyId, page: query.page, per_page: query.perPage },
      },
      "caller_ids",
      callerId,
      query,
    );
  }

  /** `GET /v3/a/{account_id}/caller_ids/{id}.json`. */
  get(id: CallerIdId, options?: RequestOptions): Promise<CallerId> {
    return this.#http.json({ method: "GET", path: v3`a/${this.#accountId}/caller_ids/${id}.json` }, callerId, options);
  }

  /**
   * `POST /v3/a/{account_id}/caller_ids.json`. CallRail then rings the number,
   * and whoever answers enters `validationCode` on the keypad. A missed call
   * needs a new `create`.
   */
  create(input: CallerIdInput, options?: RequestOptions): Promise<CallerId> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/caller_ids.json`,
        body: {
          kind: "json",
          value: { company_id: input.companyId, phone_number: input.phoneNumber, name: input.name },
        },
      },
      callerId,
      options,
    );
  }

  /** `DELETE /v3/a/{account_id}/caller_ids/{id}.json`. 204. */
  delete(id: CallerIdId, options?: RequestOptions): Promise<void> {
    return this.#http.empty({ method: "DELETE", path: v3`a/${this.#accountId}/caller_ids/${id}.json` }, options);
  }
}
