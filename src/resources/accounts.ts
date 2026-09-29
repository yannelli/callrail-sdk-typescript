/**
 * Accounts are the root. Listing them is the one call that takes no account id.
 * Everything else hangs off `callrail.account(id)`.
 */

import { AccountId } from "../ids.js";
import { boolean, emptyAsNull, id, integer, selected, string, type Shape } from "../decode.js";
import { v3, type Http, type RequestOptions } from "../http.js";
import { offsetPages, type OffsetPage, type PagePromise } from "../pagination.js";
import { encodeFields, encodeSort, type OffsetPaging, type Sort } from "../query.js";

export interface AccountBase {
  readonly id: AccountId;
  readonly name: string;
  readonly outboundRecordingEnabled: boolean;
  /** HIPAA accounts get expiring recording URLs. */
  readonly hipaaAccount: boolean;
}

export interface AccountExtras {
  /** The nine-digit id from the app URL. */
  readonly numericId: number | null;
}

export type AccountField = keyof AccountExtras;
export type Account<F extends AccountField = never> = AccountBase & Pick<AccountExtras, F>;

export interface AccountListQuery<F extends AccountField> extends OffsetPaging {
  readonly hipaaAccount?: boolean;
  readonly sort?: Sort<"name">;
  readonly fields?: readonly F[];
}

const accountBaseShape = {
  id: id(AccountId),
  name: string,
  outboundRecordingEnabled: boolean,
  hipaaAccount: boolean,
} satisfies Shape<AccountBase>;

const accountExtrasShape = { numericId: emptyAsNull(integer) } satisfies Shape<AccountExtras>;

export class Accounts {
  readonly #http: Http;

  /** @internal */
  constructor(http: Http) {
    this.#http = http;
  }

  /** `GET /v3/a.json`. */
  list<const F extends AccountField = never>(
    query: AccountListQuery<F> & RequestOptions = {},
  ): PagePromise<OffsetPage<Account<F>>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a.json`,
        query: {
          hipaa_account: query.hipaaAccount,
          ...encodeSort(query.sort),
          ...encodeFields(query.fields),
          page: query.page,
          per_page: query.perPage,
        },
      },
      "accounts",
      selected(accountBaseShape, accountExtrasShape, query.fields),
      query,
    );
  }

  /** `GET /v3/a/{account_id}.json`. */
  get<const F extends AccountField = never>(
    id: AccountId,
    options: { readonly fields?: readonly F[] } & RequestOptions = {},
  ): Promise<Account<F>> {
    return this.#http.json(
      { method: "GET", path: v3`a/${id}.json`, query: encodeFields(options.fields) },
      selected(accountBaseShape, accountExtrasShape, options.fields),
      options,
    );
  }
}
