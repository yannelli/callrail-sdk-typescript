/**
 * Tags. Account-level tags apply everywhere. Company-level tags need a company.
 * Calls, form submissions, and SMS threads are tagged by name through their own
 * `update` methods, which can create tags. This module manages the tag records.
 */

import { CompanyId, TagId } from "../ids.js";
import type { AccountId } from "../ids.js";
import { emptyAsNull, id, nullable, object, open, string, type Open } from "../decode.js";
import { v3, type Http, type RequestOptions } from "../http.js";
import { offsetPages, type OffsetPage, type PagePromise } from "../pagination.js";
import { encodeSort, type OffsetPaging, type Sort } from "../query.js";

/** The documented palette. Each name maps to a text color and a background color. */
export type TagColor =
  | "gray1"
  | "gray2"
  | "blue1"
  | "blue2"
  | "cyan1"
  | "cyan2"
  | "purple1"
  | "purple2"
  | "pink1"
  | "pink2"
  | "pink3"
  | "pink4"
  | "red1"
  | "red2"
  | "orange1"
  | "orange2"
  | "orange3"
  | "orange4"
  | "yellow1"
  | "yellow2"
  | "green1"
  | "green2"
  | "green3"
  | "green4";

export interface Tag {
  readonly id: TagId;
  readonly name: string;
  readonly tagLevel: Open<"account" | "company">;
  readonly color: Open<TagColor>;
  readonly backgroundColor: string | null;
  /** `null` for account-level tags. */
  readonly companyId: CompanyId | null;
  readonly status: Open<"enabled" | "disabled">;
  readonly createdAt: string;
}

/** CallRail rejects `tag_level=account` together with `company_id`. */
export type TagListScope =
  | { readonly tagLevel: "account"; readonly companyId?: never }
  | { readonly tagLevel?: "company"; readonly companyId?: CompanyId };

export type TagListQuery = TagListScope &
  OffsetPaging & {
    readonly status?: "enabled" | "disabled";
    readonly sort?: Sort<"name">;
  };

export type TagInput =
  | { readonly name: string; readonly color?: TagColor; readonly level: "account"; readonly companyId?: never }
  | { readonly name: string; readonly color?: TagColor; readonly level?: "company"; readonly companyId: CompanyId };

export interface TagUpdate {
  readonly name?: string;
  readonly color?: TagColor;
  /**
   * A disabled tag stays on past interactions and cannot be applied to new ones.
   * The docs table types `disabled` as a string but describes `true` and `false`, so it is sent as a boolean.
   */
  readonly disabled?: boolean;
}

const tag = object<Tag>({
  id: id(TagId),
  name: string,
  tagLevel: open("account", "company"),
  color: open(),
  backgroundColor: nullable(string),
  companyId: emptyAsNull(id(CompanyId)),
  status: open("enabled", "disabled"),
  createdAt: string,
});

export class Tags {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/tags.json`. */
  list(query: TagListQuery & RequestOptions = {}): PagePromise<OffsetPage<Tag>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/tags.json`,
        query: {
          company_id: query.companyId,
          tag_level: query.tagLevel,
          status: query.status,
          ...encodeSort(query.sort),
          page: query.page,
          per_page: query.perPage,
        },
      },
      "tags",
      tag,
      query,
    );
  }

  /** `POST /v3/a/{account_id}/tags.json`. */
  create(input: TagInput, options?: RequestOptions): Promise<Tag> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/tags.json`,
        body: {
          kind: "json",
          value: { name: input.name, company_id: input.companyId, color: input.color, tag_level: input.level },
        },
      },
      tag,
      options,
    );
  }

  /** `PUT /v3/a/{account_id}/tags/{tag_id}.json`. */
  update(id: TagId, changes: TagUpdate, options?: RequestOptions): Promise<Tag> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/tags/${id}.json`,
        body: { kind: "json", value: { name: changes.name, color: changes.color, disabled: changes.disabled } },
      },
      tag,
      options,
    );
  }

  /** `DELETE /v3/a/{account_id}/tags/{tag_id}.json`. Removes the tag from every call flow and interaction. 204. */
  delete(id: TagId, options?: RequestOptions): Promise<void> {
    return this.#http.empty({ method: "DELETE", path: v3`a/${this.#accountId}/tags/${id}.json` }, options);
  }
}
