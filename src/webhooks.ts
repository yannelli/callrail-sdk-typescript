/**
 * `callrail/webhooks` receives the POSTs CallRail sends. It never sends a request.
 *
 * `readWebhook(kind, request)` is the one call a handler makes. It checks the
 * `Signature` header against the raw body (HMAC-SHA1 keyed with the company
 * signing key, strict Base64, constant-time comparison) and only then decodes
 * the body as `kind`. No function decodes a body without verifying it, so an
 * unverified payload cannot reach your code through this module.
 *
 * Payloads do not name their event, and pre-call, post-call, and modified-call
 * bodies share one shape. Register a distinct URL per event kind (for example
 * `/webhooks/callrail/post_call`) and pass that kind to `readWebhook`.
 *
 * Replays. CallRail never resends, so rejecting a genuine webhook loses data.
 * In the published test vector `timestamp` equals the call's `start_time`, so
 * for post-call and modified-call events it is not the send time. A post-call
 * webhook can arrive 20 minutes after hangup and a modified-call webhook days
 * later. `maxAgeMs` is therefore offered only for kinds whose timestamp tracks
 * the send time. For the rest, every payload is a full snapshot of the record,
 * so an upsert by id makes a replay harmless.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { CompanyId, ConversationId, FormSubmissionId, PersonId, TextMessageId } from "./ids.js";
import {
  array,
  boolean,
  DecodeError,
  dict,
  id,
  integer,
  json,
  nullable,
  object,
  present,
  string,
  wire,
  type Decoder,
} from "./decode.js";
import {
  callBaseShape,
  callExtrasShape,
  inProgressCallShape,
  leadStatus,
  personId,
  type CallBase,
  type CallExtras,
  type LeadStatus,
} from "./resources/calls.js";
import type { FormSubmissionBase, FormSubmissionExtras } from "./resources/form-submissions.js";
import type { WebhookKind } from "./resources/integrations.js";
import { convertAssistAnswer, type ConvertAssistAnswer } from "./resources/leads.js";
import { messageType, type MessageType } from "./resources/text-messages.js";

export type { WebhookKind } from "./resources/integrations.js";

export type WebhookErrorReason = "missing_signature" | "bad_signature" | "malformed_body" | "stale";

export class WebhookError extends Error {
  override readonly name = "WebhookError";
  readonly reason: WebhookErrorReason;
  /** JSON path of the bad value when `reason` is `"malformed_body"` and the body was JSON. */
  readonly path: string | null;

  constructor(reason: WebhookErrorReason, message: string, path?: string) {
    super(message);
    this.reason = reason;
    this.path = path ?? null;
  }
}

export interface WebhookRequest {
  /**
   * The raw request body, byte for byte, such as the Buffer from `express.raw()`
   * or `new Uint8Array(await request.arrayBuffer())` in a route handler. A string
   * is not accepted, because decoding and re-encoding text can change the bytes
   * that were signed.
   */
  readonly body: Uint8Array;
  /** The `Signature` header as your framework hands it over. More than one value is rejected. */
  readonly signature: string | readonly string[] | null | undefined;
  /** From the Webhooks integration page, or `integrations.get(id, { fields: ["signingKey"] })`. */
  readonly signingKey: string;
}

/**
 * The call in a call webhook. Base fields always, extras when present.
 * Webhook bodies send `""` for empty objects and numbers for most ids, and the
 * decoder normalizes both, so these values compare equal to what the REST API returns.
 */
export type WebhookCall = CallBase & Partial<CallExtras>;

export interface WebhookText {
  /** Numeric on the wire. */
  readonly id: TextMessageId;
  readonly resourceId: string;
  /** The sender's name, for `sms_sent`. */
  readonly agent: string | null;
  /** As CallRail formats it (`770-555-5555`), not E.164. */
  readonly sourceNumber: string;
  readonly destinationNumber: string;
  readonly content: string;
  readonly messageType: MessageType;
  /** Short-lived. Download now and store the media, not the URL. */
  readonly mediaUrls: readonly string[];
  readonly leadStatus: LeadStatus | null;
  readonly conversationId: ConversationId;
  /** `company_resource_id` on the wire. */
  readonly companyId: CompanyId;
  /** `person_resource_id` on the wire. */
  readonly personId: PersonId | null;
}

export type WebhookFormSubmission = Pick<
  FormSubmissionBase,
  | "id"
  | "companyId"
  | "formData"
  | "formUrl"
  | "landingPageUrl"
  | "referrer"
  | "referringUrl"
  | "submittedAt"
  | "firstForm"
  | "source"
  | "keywords"
  | "campaign"
  | "medium"
> &
  Pick<FormSubmissionExtras, "utmSource" | "utmMedium" | "utmCampaign">;

export interface WebhookConvertAssist {
  readonly personId: PersonId;
  readonly lastInteractionId: string;
  readonly lastInteractionType: string;
  readonly interactionCount: number;
  readonly answers: readonly ConvertAssistAnswer[];
}

interface WebhookPayloads {
  readonly pre_call: { readonly timestamp: string; readonly call: WebhookCall };
  readonly answered_call: { readonly timestamp: string; readonly call: WebhookCall };
  readonly post_call: { readonly timestamp: string; readonly call: WebhookCall };
  readonly post_outbound_call: { readonly timestamp: string; readonly call: WebhookCall };
  /** `changes` names the fields that changed, such as `note`, `tags`, or `call_summary`. The call already holds the new values. */
  readonly updated_call: { readonly timestamp: string; readonly call: WebhookCall; readonly changes: readonly string[] };
  readonly updated_outbound_call: {
    readonly timestamp: string;
    readonly call: WebhookCall;
    readonly changes: readonly string[];
  };
  readonly sms_received: { readonly timestamp: string; readonly message: WebhookText };
  readonly sms_sent: { readonly timestamp: string; readonly message: WebhookText };
  /** The documented form payload has no `timestamp`. */
  readonly form_captured: { readonly submission: WebhookFormSubmission };
  readonly convert_assist_complete: { readonly timestamp: string; readonly convertAssist: WebhookConvertAssist };
}

/** One event per kind. `WebhookEvent` with no argument is the union of all of them. */
export type WebhookEvent<K extends WebhookKind = WebhookKind> = {
  readonly [P in K]: { readonly event: P } & WebhookPayloads[P];
}[K];

/** Kinds whose `timestamp` is close to the moment CallRail sent the request. */
export type FreshnessCheckedKind = "pre_call" | "answered_call" | "sms_received" | "sms_sent" | "convert_assist_complete";

export interface FreshnessOptions {
  /** Reject with `stale` when `timestamp` is older than this. */
  readonly maxAgeMs: number;
  /** Defaults to `Date.now`. */
  readonly now?: () => number;
}

const timestamp = object({ timestamp: string });

function callPayload(call: Decoder<WebhookCall>): Decoder<{ readonly timestamp: string; readonly call: WebhookCall }> {
  return (input, path) => ({ timestamp: timestamp(input, path).timestamp, call: call(input, path) });
}

const inProgressCall = callPayload(present<CallBase, CallExtras>(inProgressCallShape, callExtrasShape));
const endedCall = callPayload(present<CallBase, CallExtras>(callBaseShape, callExtrasShape));
const changes = object({ changes: array(string) });

const modifiedCall: Decoder<WebhookPayloads["updated_call"]> = (input, path) => ({
  ...endedCall(input, path),
  changes: changes(input, path).changes,
});

const text = object<WebhookText>({
  id: id(TextMessageId),
  resourceId: string,
  agent: nullable(string),
  sourceNumber: string,
  destinationNumber: string,
  content: string,
  messageType,
  mediaUrls: array(string),
  leadStatus,
  conversationId: id(ConversationId),
  companyId: wire("company_resource_id", id(CompanyId)),
  personId: wire("person_resource_id", personId),
});

const textPayload: Decoder<WebhookPayloads["sms_sent"]> = (input, path) => ({
  timestamp: timestamp(input, path).timestamp,
  message: text(input, path),
});

const formSubmission = object<WebhookFormSubmission>({
  id: id(FormSubmissionId),
  companyId: id(CompanyId),
  formData: dict(json),
  formUrl: nullable(string),
  landingPageUrl: nullable(string),
  referrer: nullable(string),
  referringUrl: nullable(string),
  submittedAt: string,
  firstForm: boolean,
  source: nullable(string),
  keywords: nullable(string),
  campaign: nullable(string),
  medium: nullable(string),
  utmSource: nullable(string),
  utmMedium: nullable(string),
  utmCampaign: nullable(string),
});

const convertAssist = object<WebhookConvertAssist>({
  personId: wire("person_resource_id", id(PersonId)),
  lastInteractionId: wire("last_interaction_resource_id", string),
  lastInteractionType: string,
  interactionCount: integer,
  answers: array(convertAssistAnswer),
});

const payloads: { readonly [K in WebhookKind]: Decoder<WebhookPayloads[K]> } = {
  pre_call: inProgressCall,
  answered_call: inProgressCall,
  post_call: endedCall,
  post_outbound_call: endedCall,
  updated_call: modifiedCall,
  updated_outbound_call: modifiedCall,
  sms_received: textPayload,
  sms_sent: textPayload,
  form_captured: (input, path) => ({ submission: formSubmission(input, path) }),
  convert_assist_complete: (input, path) => ({
    timestamp: timestamp(input, path).timestamp,
    convertAssist: convertAssist(input, path),
  }),
};

/**
 * Verifies, then decodes. Throws `WebhookError` with `missing_signature` or
 * `bad_signature` before reading the body, then `malformed_body`, then `stale`
 * when a freshness check was asked for and fails.
 */
export function readWebhook<K extends FreshnessCheckedKind>(
  kind: K,
  request: WebhookRequest,
  options?: FreshnessOptions,
): WebhookEvent<K>;
export function readWebhook<K extends WebhookKind>(kind: K, request: WebhookRequest): WebhookEvent<K>;
export function readWebhook<K extends WebhookKind>(
  kind: K,
  request: WebhookRequest,
  options?: FreshnessOptions,
): WebhookEvent<K> {
  if (!isWebhookKind(kind)) throw new TypeError(`Unknown webhook kind ${JSON.stringify(kind)}.`);
  verifyWebhook(request);
  const body = parseJson(request.body);
  try {
    const event = { event: kind, ...payloads[kind](body, "$") };
    if (options !== undefined) rejectStale(kind, timestamp(body, "$").timestamp, options);
    return event;
  } catch (error) {
    if (!(error instanceof DecodeError)) throw error;
    throw new WebhookError("malformed_body", `The ${kind} webhook body does not match its documented shape: ${error.message}.`, error.path);
  }
}

/** Verification alone, for handlers that forward the raw body elsewhere. Throws like `readWebhook`. */
export function verifyWebhook(request: WebhookRequest): void {
  const { body, signingKey } = request;
  if (!(body instanceof Uint8Array)) {
    throw new TypeError("Webhook body must be the raw request bytes, such as the Buffer from express.raw(). A parsed or string body cannot be verified.");
  }
  if (typeof signingKey !== "string" || signingKey === "") {
    throw new TypeError("Webhook signingKey is empty. Copy it from the Webhooks integration page.");
  }
  const signature = singleHeader(request.signature);
  // A SHA-1 digest is 20 bytes, which strict Base64 writes as 27 characters and one `=`.
  const received = /^[A-Za-z0-9+/]{27}=$/.test(signature) ? Buffer.from(signature, "base64") : null;
  const expected = createHmac("sha1", signingKey).update(body).digest();
  if (received === null || received.toString("base64") !== signature || !timingSafeEqual(received, expected)) {
    throw new WebhookError(
      "bad_signature",
      "The Signature header does not match the body. Check the signing key, and pass the raw request bytes rather than re-serialized JSON.",
    );
  }
}

/** The signature CallRail would send for `body`. Pure. Use it to build fixtures for your own handler tests. */
export function signWebhook(body: string | Uint8Array, signingKey: string): string {
  return createHmac("sha1", signingKey).update(body).digest("base64");
}

/** For a route parameter such as `/webhooks/callrail/:kind`. */
export function isWebhookKind(value: string): value is WebhookKind {
  return Object.hasOwn(payloads, value);
}

function singleHeader(signature: WebhookRequest["signature"]): string {
  const values = typeof signature === "string" ? [signature] : (signature ?? []);
  if (values.length > 1) {
    throw new WebhookError("bad_signature", `The request carries ${values.length} Signature headers. CallRail sends one.`);
  }
  const [value] = values;
  if (value === undefined || value === "") {
    throw new WebhookError("missing_signature", "The request has no Signature header, so it cannot be from CallRail.");
  }
  return value;
}

function parseJson(body: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new WebhookError("malformed_body", "The webhook body is not UTF-8 text.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new WebhookError("malformed_body", "The webhook body is not JSON.");
  }
}

function rejectStale(kind: WebhookKind, sentAt: string, options: FreshnessOptions): void {
  const { maxAgeMs, now = Date.now } = options;
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    throw new TypeError(`maxAgeMs must be a positive number. Got ${maxAgeMs}.`);
  }
  const sentAtMs = Date.parse(sentAt);
  if (Number.isNaN(sentAtMs)) {
    throw new WebhookError("malformed_body", `The ${kind} webhook timestamp is not a date.`, "$.timestamp");
  }
  if (now() - sentAtMs > maxAgeMs) {
    throw new WebhookError("stale", `The ${kind} webhook was sent at ${sentAt}, more than ${maxAgeMs} ms ago.`);
  }
}
