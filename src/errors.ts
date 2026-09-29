/**
 * Every failure a caller can handle is a `CallRailError` whose `problem` is one
 * case of a discriminated union. Switch on `problem.kind`. The compiler checks
 * the switch is exhaustive, which a class hierarchy with `instanceof` cannot do.
 *
 * CallRail error bodies have no single schema. The docs show `{ "error": "..." }`,
 * Ruby hash text like `{ error: '...' }` and `{ "error" => "..." }`, and field
 * error maps. `readErrorBody` normalizes all of them into one message and one
 * field-error map. It is pure, so the table of body shapes is tested directly.
 *
 * Mistakes the type system cannot catch before a request is sent, such as a
 * duplicate message-flow step id, throw `TypeError` synchronously and never
 * reach the network. Those are programmer errors, not problems.
 */

import { STATUS_CODES } from "node:http";
import type { HttpMethod } from "./http.js";

/** Which documented rate-limit budget a request draws from. Derived from the endpoint, never from the response. */
export type RateLimitBucket = "general" | "sms_send" | "outbound_call";

export type Problem =
  /** 401. The API key is missing or wrong. */
  | { readonly kind: "unauthorized"; readonly status: 401 }
  /** 403. The key works but cannot see this account or record. */
  | { readonly kind: "forbidden"; readonly status: 403 }
  /** 404. */
  | { readonly kind: "not_found"; readonly status: 404 }
  /**
   * 400, 405, 406, 422, or any other 4xx. `fieldErrors` is `{}` when the body
   * named no fields.
   */
  | {
      readonly kind: "invalid_request";
      readonly status: number;
      readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
    }
  /**
   * 429. Never retried automatically, because every documented window is an
   * hour or a day. `retryAfterMs` is `null` unless the response carried a
   * `Retry-After` header, which the docs do not promise.
   */
  | {
      readonly kind: "rate_limited";
      readonly status: 429;
      readonly bucket: RateLimitBucket;
      readonly retryAfterMs: number | null;
    }
  /** 5xx after the retry budget for GETs is spent. Never retried for writes. */
  | { readonly kind: "server_error"; readonly status: number }
  /** The request never produced a response. */
  | { readonly kind: "network"; readonly cause: unknown }
  | { readonly kind: "timeout"; readonly timeoutMs: number }
  /**
   * A 2xx that the SDK could not trust: a body that failed to decode, a body
   * that was not JSON, or a `next_page` / media URL on a foreign origin (the
   * SDK refuses to send the API key anywhere but the configured base URL).
   * After a write, CallRail has already accepted the change, so do not send it again.
   */
  | {
      readonly kind: "unexpected_response";
      /** The response status. `0` for `foreign_url`, because the SDK sent nothing. */
      readonly status: number;
      readonly reason: "decode" | "not_json" | "foreign_url";
      /** JSON path of the bad value when `reason` is `"decode"`. */
      readonly path: string | null;
    };

export type ProblemKind = Problem["kind"];

export class CallRailError extends Error {
  override readonly name = "CallRailError";
  readonly problem: Problem;
  /** The request that failed. The URL never includes the API key, which lives in a header. */
  readonly request: { readonly method: HttpMethod; readonly url: string };
  /** Raw response text, kept for logs. `null` when there was no response. */
  readonly responseText: string | null;

  constructor(init: {
    readonly problem: Problem;
    readonly message: string;
    readonly request: { readonly method: HttpMethod; readonly url: string };
    readonly responseText: string | null;
  }) {
    super(init.message);
    this.problem = init.problem;
    this.request = init.request;
    this.responseText = init.responseText;
  }
}

export interface ErrorBody {
  /** Human text from the body, or `"<status> <reason>"` when the body had none. */
  readonly message: string;
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
}

/**
 * Normalizes every documented error body shape. Order of attempts:
 * 1. JSON `{ "error": "text" }` or `{ "error": { "message": "text" } }`.
 * 2. JSON `{ "errors": ["a", "b"] }` (message `"a; b"`) or
 *    `{ "errors": { "name": ["is taken"] } }` (message `"name is taken"`).
 * 3. JSON `{ "message": "text" }`.
 * 4. Ruby hash text: `{ error: 'text' }` or `{ "error" => "text" }`.
 * 5. Any other non-empty text, trimmed to 500 characters (HTML error pages included).
 * 6. `"<status> <reason>"` with the reason from `node:http` `STATUS_CODES`,
 *    because HTTP/2 responses carry no status text.
 */
export function readErrorBody(status: number, text: string): ErrorBody {
  const trimmed = text.trim();
  const fromJson = readJsonError(trimmed);
  if (fromJson) return fromJson;
  const ruby = /^\{\s*:?["']?(?:error|message)["']?\s*(?:=>|:)\s*(["'])([\s\S]*)\1\s*\}$/.exec(trimmed);
  if (ruby?.[2]) return { message: ruby[2], fieldErrors: {} };
  if (trimmed !== "") return { message: trimmed.slice(0, 500), fieldErrors: {} };
  return { message: `${status} ${STATUS_CODES[status] ?? "Unknown Status"}`, fieldErrors: {} };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): readonly string[] {
  if (typeof value === "string") return value === "" ? [] : [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item !== "") : [];
}

function readJsonError(text: string): ErrorBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { error, errors, message } = parsed;
  if (typeof error === "string" && error !== "") return { message: error, fieldErrors: {} };
  if (isRecord(error) && typeof error["message"] === "string") return { message: error["message"], fieldErrors: {} };
  if (Array.isArray(errors) && strings(errors).length > 0) return { message: strings(errors).join("; "), fieldErrors: {} };
  if (isRecord(errors)) {
    const fieldErrors: Record<string, readonly string[]> = {};
    const sentences: string[] = [];
    for (const [field, value] of Object.entries(errors)) {
      const list = strings(value);
      if (list.length === 0) continue;
      fieldErrors[field] = list;
      // Rails reports errors that belong to no single field under `base`, and prints them without a field name.
      for (const item of list) sentences.push(field === "base" ? item : `${field} ${item}`);
    }
    if (sentences.length > 0) return { message: sentences.join("; "), fieldErrors };
  }
  if (typeof message === "string" && message !== "") return { message, fieldErrors: {} };
  return null;
}

/** Pure mapping from a non-2xx status to a problem. `bucket` comes from the endpoint. */
export function problemForStatus(
  status: number,
  body: ErrorBody,
  bucket: RateLimitBucket,
  retryAfterHeader: string | null,
): Problem {
  switch (status) {
    case 401:
      return { kind: "unauthorized", status: 401 };
    case 403:
      return { kind: "forbidden", status: 403 };
    case 404:
      return { kind: "not_found", status: 404 };
    case 429: {
      const seconds = retryAfterHeader?.trim() ?? "";
      return { kind: "rate_limited", status: 429, bucket, retryAfterMs: /^\d+$/.test(seconds) ? Number(seconds) * 1000 : null };
    }
  }
  if (status >= 500) return { kind: "server_error", status };
  return { kind: "invalid_request", status, fieldErrors: body.fieldErrors };
}
