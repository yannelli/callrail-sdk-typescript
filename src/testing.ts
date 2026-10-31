/**
 * `@yannelli/callrail/testing` is a scripted `fetch` for tests, yours and the SDK's.
 *
 * `fakeFetch(...replies)` answers requests in order and records each one as
 * plain data, so a test asserts the literal method, path, query, and body the
 * SDK sent, then the parsed result it returned. A request beyond the scripted
 * replies fails the test with the unexpected request in the message. Replies
 * never match by URL, because matching would hide a wrong URL instead of
 * failing on it.
 */

import type { JsonValue } from "./decode.js";

export interface FakeReplyInit {
  /** Defaults to 200. */
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  /** Sent as JSON with `Content-Type: application/json`. */
  readonly json?: JsonValue;
  /** Sent verbatim. For HTML error pages, Ruby-hash error text, and empty 204s. */
  readonly text?: string;
}

export type FakeReply = FakeReplyInit | { readonly networkError: string };

export interface RecordedMultipartFile {
  readonly filename: string;
  readonly type: string;
  readonly size: number;
}

export interface RecordedRequest {
  readonly method: string;
  /** The exact URL fetched. Relative-pagination tests compare it to `next_page` byte for byte. */
  readonly url: string;
  /** Pathname only, such as `/v3/a/ACC1/calls.json`. */
  readonly path: string;
  /** Repeated keys (`tags[]`) collect into arrays. Values are the decoded strings. */
  readonly query: Readonly<Record<string, string | readonly string[]>>;
  /** Lowercased names. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body:
    | { readonly kind: "none" }
    | { readonly kind: "json"; readonly value: JsonValue }
    | { readonly kind: "multipart"; readonly fields: Readonly<Record<string, string | RecordedMultipartFile>> };
}

export interface FakeFetch {
  (url: string, init: RequestInit): Promise<Response>;
  readonly requests: readonly RecordedRequest[];
}

export function fakeFetch(...replies: readonly FakeReply[]): FakeFetch {
  const pending = [...replies];
  const requests: RecordedRequest[] = [];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    init.signal?.throwIfAborted();
    const request = await record(url, init);
    requests.push(request);
    const reply = pending.shift();
    if (reply === undefined) {
      throw new Error(`fakeFetch has no reply scripted for request ${requests.length}, ${request.method} ${request.url}`);
    }
    if ("networkError" in reply) throw new TypeError(reply.networkError);
    return respond(reply);
  };
  return Object.assign(fetch, { requests });
}

async function record(url: string, init: RequestInit): Promise<RecordedRequest> {
  const parsed = new URL(url);
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of parsed.searchParams) {
    const existing = query[key];
    if (existing === undefined) query[key] = key.endsWith("[]") ? [value] : value;
    else query[key] = [...(Array.isArray(existing) ? existing : [existing]), value];
  }
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, name) => {
    headers[name] = value;
  });
  return {
    method: init.method ?? "GET",
    url,
    path: parsed.pathname,
    query,
    headers,
    body: await recordBody(init.body),
  };
}

async function recordBody(body: RequestInit["body"]): Promise<RecordedRequest["body"]> {
  if (body === undefined || body === null) return { kind: "none" };
  if (typeof body === "string") return { kind: "json", value: JSON.parse(body) as JsonValue };
  if (body instanceof FormData) {
    const fields: Record<string, string | RecordedMultipartFile> = {};
    for (const [name, value] of body) {
      fields[name] = typeof value === "string" ? value : { filename: value.name, type: value.type, size: value.size };
    }
    return { kind: "multipart", fields };
  }
  throw new TypeError("fakeFetch records JSON strings and FormData bodies only.");
}

function respond(reply: FakeReplyInit): Response {
  const status = reply.status ?? 200;
  const headers = new Headers(reply.headers);
  let body: string | null = reply.text ?? null;
  if (reply.json !== undefined) {
    body = JSON.stringify(reply.json);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const nullBodyStatus = status === 204 || status === 205 || status === 304;
  return new Response(nullBodyStatus ? null : body, { status, headers });
}
