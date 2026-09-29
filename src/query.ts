/**
 * Input vocabulary shared by several resources, and the pure encoders that turn
 * it into CallRail's query strings and bodies. Each input type makes one
 * documented rule structural:
 * - `DateFilter` is a named range or both `startDate` and `endDate`, never a mix.
 * - `Sort` cannot have an `order` without `by`.
 * - `TagChange` adds to tags or replaces them, so no `append_tags` flag can be forgotten.
 * - `NonEmpty` marks lists the API rejects when empty.
 */

import type { JsonBody, Query } from "./http.js";
import { snakeCase, type Open } from "./decode.js";

export type NonEmpty<T> = readonly [T, ...T[]];

/** An object with at least one of the keys of `T` present. */
export type AtLeastOne<T> = {
  [K in keyof T]-?: { readonly [P in K]-?: T[P] } & { readonly [P in Exclude<keyof T, K>]?: T[P] };
}[keyof T];

export type DateRange =
  | "recent"
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "all_time";

/** `"user"` or an IANA zone. The account time zone applies when omitted. */
export type TimeZone = Open<
  | "user"
  | "America/New_York"
  | "America/Indiana/Indianapolis"
  | "America/Chicago"
  | "America/Denver"
  | "America/Phoenix"
  | "America/Los_Angeles"
>;

/**
 * Dates are ISO 8601 strings, inclusive, as CallRail documents them
 * (`"2026-01-01"` or `"2026-01-01T09:00:00-05:00"`). The SDK does not convert
 * `Date` objects, because the meaning of a bare date depends on `timeZone`.
 * Records older than 25 months are outside retention and return an error.
 */
export type DateFilter =
  | {
      readonly dateRange?: DateRange;
      readonly startDate?: never;
      readonly endDate?: never;
      readonly timeZone?: TimeZone;
    }
  | {
      readonly startDate: string;
      readonly endDate: string;
      readonly dateRange?: never;
      readonly timeZone?: TimeZone;
    };

export interface Sort<F extends string> {
  readonly by: F;
  readonly order?: "asc" | "desc";
}

/**
 * Tags are set by name and a new name creates the tag.
 * `{ add: [...] }` sends `append_tags: true`. `{ replace: [] }` clears every tag.
 */
export type TagChange = { readonly add: NonEmpty<string> } | { readonly replace: readonly string[] };

export interface OffsetPaging {
  /** 1-based. Defaults to 1. */
  readonly page?: number;
  /** Defaults to 100. Most endpoints allow at most 250. */
  readonly perPage?: number;
}

/** `{ dateRange: "today" }` becomes `date_range=today`. Pure. */
export function encodeDateFilter(filter: DateFilter): Query {
  return {
    date_range: filter.dateRange,
    start_date: filter.startDate,
    end_date: filter.endDate,
    time_zone: filter.timeZone,
  };
}

/** `{ by: "startTime", order: "desc" }` becomes `sort=start_time&order=desc`. Pure. */
export function encodeSort<F extends string>(sort: Sort<F> | undefined): Query {
  if (sort === undefined) return {};
  return { sort: snakeCase(sort.by), order: sort.order };
}

/**
 * `["agentEmail", "milestones"]` becomes `fields=agent_email,milestones`. Pure.
 * `always` names fields the response type relies on, sent first whenever any field is requested.
 */
export function encodeFields(fields: readonly string[] | undefined, always: readonly string[] = []): Query {
  if (fields === undefined || fields.length === 0) return {};
  return { fields: [...new Set([...always, ...fields])].map(snakeCase).join(",") };
}

/** Pure. `{ add: ["VIP"] }` becomes `{ tags: ["VIP"], append_tags: true }`. */
export function encodeTagChange(change: TagChange | undefined): JsonBody {
  if (change === undefined) return {};
  return "add" in change ? { tags: change.add, append_tags: true } : { tags: change.replace, append_tags: false };
}

/** Dollars as CallRail's two-decimal string. `null` clears the value and `undefined` leaves it alone. */
export function encodeMoney(value: number | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (!Number.isFinite(value)) throw new TypeError(`value must be a finite number of dollars. Got ${value}.`);
  return value.toFixed(2);
}
