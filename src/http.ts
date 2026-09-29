/**
 * The only module that touches `fetch`. It is internal, and nothing here is
 * exported from the package entry point except `CallRailOptions`,
 * `RequestOptions`, and `FetchLike`.
 *
 * Request rules that every resource gets for free:
 * - `Authorization: Token token="<key>"` on every request, plus `Request-From`
 *   when configured.
 * - GET parameters go on the query string. Arrays encode as repeated
 *   `key[]=a&key[]=b`. `undefined` values are dropped.
 * - POST, PUT, and DELETE bodies are JSON with `Content-Type: application/json`,
 *   except a multipart body, which only `textMessages.send` with a file builds.
 * - An `empty` operation accepts any 2xx and never reads the body, so a 204, an
 *   empty 200, and a 200 with a courtesy JSON message all succeed the same way.
 * - Paths are built with the `v3` tag, which prefixes `/v3/` and percent-encodes
 *   every interpolated segment. A path without the leading slash cannot be written.
 * - Absolute URLs that CallRail hands back (`next_page`, media links) are
 *   followed exactly as given, after a check that their origin matches `baseUrl`.
 *
 * Retry policy, as data in `retryDelayMs`:
 * - GET only. A POST that timed out may have sent the SMS or placed the call.
 * - Network failures, timeouts, 500, 502, 503, and 504. Never 429 (hourly and
 *   daily windows make an in-process wait useless) and never another 4xx.
 * - `maxRetries` attempts after the first, full-jitter exponential backoff from 500 ms.
 *
 * There is no client-side rate limiter. CallRail meters per account across
 * every process that holds a key, so a per-process counter would be a guess
 * that disagrees with the server. The server's 429 is the single source of truth.
 */

import { CallRailError, problemForStatus, readErrorBody } from "./errors.js";
import type { Brand } from "./ids.js";
import { DecodeError, type Decoder } from "./decode.js";
import type { RateLimitBucket } from "./errors.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/** An absolute path on the API host that starts with `/v3/`. Only `v3` produces one. */
export type ApiPath = Brand<string, "ApiPath">;

/**
 * `v3\`a/${accountId}/calls/${callId}.json\`` is `/v3/a/ACC1/calls/CAL1.json`.
 * Each interpolation is `encodeURIComponent`-encoded, so an id can never add a
 * path segment or a query string.
 */
export function v3(strings: TemplateStringsArray, ...segments: readonly (string | number)[]): ApiPath {
  let path = `/v3/${strings[0] ?? ""}`;
  segments.forEach((segment, index) => {
    path += encodeURIComponent(String(segment)) + (strings[index + 1] ?? "");
  });
  return path as ApiPath;
}

export type QueryValue = string | number | boolean | readonly (string | number)[] | undefined;
export type Query = Readonly<Record<string, QueryValue>>;

/** A key whose value is `undefined` is left out at any depth, as `JSON.stringify` does. */
export type JsonBody = { readonly [key: string]: BodyValue | undefined };
type BodyValue = null | boolean | number | string | readonly BodyValue[] | JsonBody;

export type RequestBody =
  | { readonly kind: "json"; readonly value: JsonBody }
  | { readonly kind: "multipart"; readonly value: FormData };

export interface Endpoint {
  readonly method: HttpMethod;
  readonly path: ApiPath;
  readonly query?: Query;
  readonly body?: RequestBody;
  /** Defaults to `"general"`. Only outbound calls and SMS sends draw from a tighter budget. */
  readonly bucket?: RateLimitBucket;
}

/**
 * Per-call options. Every method that sends a request accepts them in its last
 * parameter, either on their own or alongside that method's query or fields.
 */
export interface RequestOptions {
  /**
   * Cancels the request, its retries, and, on a list, every later page. The
   * method rejects with `signal.reason`, which is an `AbortError` unless you
   * passed your own reason. A write that is cancelled after it was sent may
   * still take effect on CallRail's side.
   */
  readonly signal?: AbortSignal;
}

/** The one call shape the SDK makes. The global `fetch` satisfies it. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface CallRailOptions {
  /** An API key from CallRail settings. It has the same access as the user who created it. */
  readonly apiKey: string;
  /**
   * Your product name, lowercase with underscores (`hanks_hotdogs`), sent as
   * `Request-From`. Third-party products should set it. Omit it when you call
   * the API for your own data.
   */
  readonly requestFrom?: string;
  /** Defaults to `https://api.callrail.com`. Must be an absolute `https:` URL with no path. */
  readonly baseUrl?: string;
  /** Defaults to the global `fetch` in Node 20+. Any WHATWG-compatible fetch fits. Tests pass `fakeFetch()`. */
  readonly fetch?: FetchLike;
  /** Per-attempt timeout. Defaults to 30000. */
  readonly timeoutMs?: number;
  /** Extra attempts for a failed GET. Defaults to 2. `0` disables retries. */
  readonly maxRetries?: number;
}

export interface ResolvedConfig {
  readonly apiKey: string;
  readonly requestFrom: string | null;
  readonly baseUrl: URL;
  readonly fetch: FetchLike;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

/**
 * Validates options once, at construction. Throws `TypeError` for an empty key,
 * a `requestFrom` outside `/^[a-z0-9_]+$/`, a non-https or path-carrying
 * `baseUrl`, a non-positive timeout, or a negative or fractional retry count.
 */
export function resolveConfig(options: CallRailOptions): ResolvedConfig {
  const { apiKey, requestFrom, baseUrl = "https://api.callrail.com", timeoutMs = 30_000, maxRetries = 2 } = options;
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new TypeError("CallRail apiKey is empty. Pass the key from CallRail settings.");
  }
  if (requestFrom !== undefined && !/^[a-z0-9_]+$/.test(requestFrom)) {
    throw new TypeError(`requestFrom must be lowercase letters, digits, and underscores, such as "hanks_hotdogs". Got ${JSON.stringify(requestFrom)}.`);
  }
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new TypeError(`baseUrl must be an absolute URL. Got ${JSON.stringify(baseUrl)}.`);
  }
  if (base.protocol !== "https:" || base.pathname !== "/" || base.search !== "" || base.hash !== "") {
    throw new TypeError(`baseUrl must be an https: origin with no path, such as "https://api.callrail.com". Got ${JSON.stringify(baseUrl)}.`);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError(`timeoutMs must be a positive number. Got ${timeoutMs}.`);
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new TypeError(`maxRetries must be a whole number of 0 or more. Got ${maxRetries}.`);
  }
  const fetch = options.fetch ?? globalThis.fetch;
  if (typeof fetch !== "function") {
    throw new TypeError("No global fetch. Use Node 20 or later, or pass options.fetch.");
  }
  return { apiKey, requestFrom: requestFrom ?? null, baseUrl: base, fetch, timeoutMs, maxRetries };
}

const retriedStatuses: ReadonlySet<number> = new Set([500, 502, 503, 504]);
const firstBackoffMs = 500;
const maxBackoffMs = 8_000;

/**
 * Delay before the next attempt, or `null` to stop. Pure.
 * `attempt` counts from 1 for the first retry.
 */
export function retryDelayMs(
  method: HttpMethod,
  failure: { readonly kind: "network" | "timeout" } | { readonly kind: "status"; readonly status: number },
  attempt: number,
  maxRetries: number,
  random: () => number,
): number | null {
  if (method !== "GET" || attempt > maxRetries) return null;
  if (failure.kind === "status" && !retriedStatuses.has(failure.status)) return null;
  const ceiling = Math.min(maxBackoffMs, firstBackoffMs * 2 ** (attempt - 1));
  return Math.floor(random() * ceiling);
}

type Failure = { readonly kind: "network" | "timeout" } | { readonly kind: "status"; readonly status: number };

type Attempt<R> =
  | { readonly ok: true; readonly value: R; readonly status: number }
  | { readonly ok: false; readonly failure: Failure; readonly error: CallRailError };

interface Target {
  readonly method: HttpMethod;
  readonly url: string;
  readonly body: RequestBody | undefined;
  readonly bucket: RateLimitBucket;
}

export class Http {
  readonly #config: ResolvedConfig;

  constructor(config: ResolvedConfig) {
    this.#config = config;
  }

  /** Sends the request and decodes a 2xx JSON body. Non-2xx becomes a `CallRailError`. */
  async json<T>(endpoint: Endpoint, decode: Decoder<T>, options?: RequestOptions): Promise<T> {
    const target = this.#target(endpoint);
    const { value: text, status } = await this.#send(target, options?.signal, (response) => response.text());
    return this.#decode(target, status, text, decode);
  }

  /** Sends the request and ignores the body of any 2xx. */
  async empty(endpoint: Endpoint, options?: RequestOptions): Promise<void> {
    await this.#send(this.#target(endpoint), options?.signal, (response) => discard(response));
  }

  /** GETs an absolute URL CallRail returned, unmodified, after the same-origin check. */
  async jsonAt<T>(url: string, decode: Decoder<T>, options?: RequestOptions): Promise<T> {
    const target = this.#absolute(url);
    const { value: text, status } = await this.#send(target, options?.signal, (response) => response.text());
    return this.#decode(target, status, text, decode);
  }

  /** GETs a short-lived media URL with the API key. Same-origin check applies. */
  async blobAt(url: string, options?: RequestOptions): Promise<Blob> {
    const { value } = await this.#send(this.#absolute(url), options?.signal, (response) => response.blob());
    return value;
  }

  #target(endpoint: Endpoint): Target {
    const url = new URL(endpoint.path, this.#config.baseUrl);
    for (const [key, value] of Object.entries(endpoint.query ?? {})) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(`${key}[]`, String(item));
      } else {
        url.searchParams.append(key, String(value));
      }
    }
    return { method: endpoint.method, url: url.href, body: endpoint.body, bucket: endpoint.bucket ?? "general" };
  }

  #absolute(url: string): Target {
    const base = this.#config.baseUrl;
    let resolved: URL;
    let exact = url;
    try {
      resolved = new URL(url);
    } catch {
      resolved = new URL(url, base);
      exact = resolved.href;
    }
    if (resolved.origin !== base.origin) {
      throw new CallRailError({
        problem: { kind: "unexpected_response", status: 0, reason: "foreign_url", path: null },
        message: `CallRail returned a URL on ${resolved.origin}. The SDK sends the API key only to ${base.origin}, so it did not follow the URL.`,
        request: { method: "GET", url },
        responseText: null,
      });
    }
    return { method: "GET", url: exact, body: undefined, bucket: "general" };
  }

  async #send<R>(target: Target, signal: AbortSignal | undefined, read: (response: Response) => Promise<R>): Promise<{ readonly value: R; readonly status: number }> {
    for (let retry = 1; ; retry++) {
      signal?.throwIfAborted();
      const attempt = await this.#attempt(target, signal, read);
      if (attempt.ok) return attempt;
      const delay = retryDelayMs(target.method, attempt.failure, retry, this.#config.maxRetries, Math.random);
      if (delay === null) throw attempt.error;
      await sleep(delay, signal);
    }
  }

  async #attempt<R>(target: Target, signal: AbortSignal | undefined, read: (response: Response) => Promise<R>): Promise<Attempt<R>> {
    const { timeoutMs } = this.#config;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const forward = (): void => controller.abort(signal?.reason);
    signal?.addEventListener("abort", forward, { once: true });
    const request = { method: target.method, url: target.url };
    const failed = (cause: unknown): Attempt<R> => {
      if (signal?.aborted) throw signal.reason;
      if (timedOut) {
        return {
          ok: false,
          failure: { kind: "timeout" },
          error: new CallRailError({
            problem: { kind: "timeout", timeoutMs },
            message: `CallRail did not respond within ${timeoutMs} ms.`,
            request,
            responseText: null,
          }),
        };
      }
      return {
        ok: false,
        failure: { kind: "network" },
        error: new CallRailError({
          problem: { kind: "network", cause },
          message: `The request to CallRail failed before a response arrived: ${cause instanceof Error ? cause.message : String(cause)}`,
          request,
          responseText: null,
        }),
      };
    };
    try {
      let response: Response;
      try {
        response = await this.#config.fetch(target.url, {
          method: target.method,
          headers: this.#headers(target.body),
          body: encodeBody(target.body),
          signal: controller.signal,
        });
      } catch (cause) {
        return failed(cause);
      }
      if (response.ok) {
        try {
          return { ok: true, value: await read(response), status: response.status };
        } catch (cause) {
          return failed(cause);
        }
      }
      let text: string;
      try {
        text = await response.text();
      } catch (cause) {
        return failed(cause);
      }
      const body = readErrorBody(response.status, text);
      return {
        ok: false,
        failure: { kind: "status", status: response.status },
        error: new CallRailError({
          problem: problemForStatus(response.status, body, target.bucket, response.headers.get("retry-after")),
          message: body.message,
          request,
          responseText: text,
        }),
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    }
  }

  #headers(body: RequestBody | undefined): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Token token="${this.#config.apiKey}"`,
      accept: "application/json",
    };
    if (this.#config.requestFrom !== null) headers["request-from"] = this.#config.requestFrom;
    if (body?.kind === "json") headers["content-type"] = "application/json";
    return headers;
  }

  #decode<T>(target: Target, status: number, text: string, decode: Decoder<T>): T {
    const request = { method: target.method, url: target.url };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new CallRailError({
        problem: { kind: "unexpected_response", status, reason: "not_json", path: null },
        message: `CallRail answered ${status} with a body that is not JSON.`,
        request,
        responseText: text,
      });
    }
    try {
      return decode(parsed, "$");
    } catch (error) {
      if (!(error instanceof DecodeError)) throw error;
      throw new CallRailError({
        problem: { kind: "unexpected_response", status, reason: "decode", path: error.path },
        message: `CallRail answered ${status} with a body this SDK cannot read: ${error.message}.`,
        request,
        responseText: text,
      });
    }
  }
}

function encodeBody(body: RequestBody | undefined): string | FormData | null {
  if (body === undefined) return null;
  return body.kind === "json" ? JSON.stringify(body.value) : body.value;
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel();
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const done = (): void => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const abort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
