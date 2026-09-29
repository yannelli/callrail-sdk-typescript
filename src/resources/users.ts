/**
 * Users and roles. Admins see every company. Managers and reporting users see
 * only the companies they are assigned, so those roles require a company list.
 * Only admins can create, delete, or update other users.
 */

import { CompanyId, UserId } from "../ids.js";
import type { AccountId } from "../ids.js";
import { array, boolean, id, nullable, object, open, string, type Open } from "../decode.js";
import { v3, type Http, type RequestOptions } from "../http.js";
import { offsetPages, type OffsetPage, type PagePromise } from "../pagination.js";
import { encodeSort, type NonEmpty, type OffsetPaging, type Sort } from "../query.js";

export type UserRole = "admin" | "manager" | "reporting";

export interface User {
  readonly id: UserId;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly name: string;
  readonly role: Open<UserRole>;
  readonly createdAt: string;
  /** Whether the user accepted the invitation. Sent on list only. */
  readonly accepted: boolean | null;
  readonly companies: readonly { readonly id: CompanyId; readonly name: string }[];
}

export type UserInput = {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
} & (
  | { readonly role: "admin"; readonly companies?: never }
  | { readonly role: "manager" | "reporting"; readonly companies: NonEmpty<CompanyId> }
);

/** Changing an email needs the user's current password. */
export type UserUpdate = {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly companies?: NonEmpty<CompanyId>;
} & (
  | { readonly email?: never; readonly currentPassword?: never }
  | { readonly email: string; readonly currentPassword: string }
);

export interface UserListQuery extends OffsetPaging {
  readonly companyId?: CompanyId;
  /** One term, matched against first name, last name, and email. */
  readonly search?: string;
  readonly sort?: Sort<"email" | "createdAt">;
}

const user = object<User>({
  id: id(UserId),
  email: string,
  firstName: string,
  lastName: string,
  name: string,
  role: open("admin", "manager", "reporting"),
  createdAt: string,
  accepted: nullable(boolean),
  companies: array(object({ id: id(CompanyId), name: string })),
});

export class Users {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/users.json`. */
  list(query: UserListQuery & RequestOptions = {}): PagePromise<OffsetPage<User>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/users.json`,
        query: {
          company_id: query.companyId,
          search: query.search,
          ...encodeSort(query.sort),
          page: query.page,
          per_page: query.perPage,
        },
      },
      "users",
      user,
      query,
    );
  }

  /** `GET /v3/a/{account_id}/users/{user_id}.json`. */
  get(id: UserId, options?: RequestOptions): Promise<User> {
    return this.#http.json({ method: "GET", path: v3`a/${this.#accountId}/users/${id}.json` }, user, options);
  }

  /** `POST /v3/a/{account_id}/users.json`. CallRail emails the new user a link to set a password. */
  create(input: UserInput, options?: RequestOptions): Promise<User> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/users.json`,
        body: {
          kind: "json",
          value: {
            first_name: input.firstName,
            last_name: input.lastName,
            email: input.email,
            role: input.role,
            companies: input.companies,
          },
        },
      },
      user,
      options,
    );
  }

  /**
   * `PUT /v3/a/{account_id}/users/{user_id}.json`. Only a user who accepted the
   * invitation can be updated. Names and email can be changed only for the user
   * who owns the API key.
   */
  update(id: UserId, changes: UserUpdate, options?: RequestOptions): Promise<User> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/users/${id}.json`,
        body: {
          kind: "json",
          value: {
            first_name: changes.firstName,
            last_name: changes.lastName,
            email: changes.email,
            current_password: changes.currentPassword,
            companies: changes.companies,
          },
        },
      },
      user,
      options,
    );
  }

  /** `DELETE /v3/a/{account_id}/users/{user_id}.json`. 204. */
  delete(id: UserId, options?: RequestOptions): Promise<void> {
    return this.#http.empty({ method: "DELETE", path: v3`a/${this.#accountId}/users/${id}.json` }, options);
  }
}
