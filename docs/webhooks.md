# Webhooks

CallRail can send an event to your server in a POST request. It sends the 10 kinds of events in [Know the events](#know-the-events). `callrail/webhooks` checks that each request came from CallRail and turns its body into a typed event. It never sends a request itself. [Integrations](integrations.md#create-an-integration) shows how to register your URLs.

## Know the events

| Kind | CallRail sends it | Payload |
| --- | --- | --- |
| `pre_call` | When an inbound call reaches CallRail, before it connects | `call` |
| `answered_call` | When an inbound call has been routed | `call` |
| `post_call` | After an inbound call ends and its recording, transcript, and summary attach | `call` |
| `updated_call` | When an ended call changes, such as a new tag or note | `call`, `changes` |
| `post_outbound_call` | After an outbound call ends | `call` |
| `updated_outbound_call` | When an ended outbound call changes | `call`, `changes` |
| `sms_received` | After a tracking number receives a text | `message` |
| `sms_sent` | After a tracking number sends a text | `message` |
| `form_captured` | When a visitor submits a form on a site with form tracking | `submission` |
| `convert_assist_complete` | After Convert Assist answers its prompts for an interaction | `convertAssist` |

A `post_call` webhook waits for the recording, transcript, and summary, for up to 20 minutes after hangup. If they are still missing then, it fires without them, and an `updated_call` webhook brings them later. `updated_call` also fires when someone marks the call as spam. Every event carries a `timestamp`, except `form_captured`, whose documented payload has none.

## Receive a webhook

A webhook body does not say which event it is, and the call events share one shape. Give each kind its own URL and tell `readWebhook` which kind that URL receives.

```ts
// server.ts
import express from "express";
import type { CallId } from "callrail";
import { readWebhook, WebhookError, type WebhookCall } from "callrail/webhooks";

const signingKey = process.env.CALLRAIL_SIGNING_KEY;
if (!signingKey) {
  throw new Error("Set CALLRAIL_SIGNING_KEY before you start the server.");
}

const calls = new Map<CallId, WebhookCall>();
const app = express();

app.post("/webhooks/callrail/post_call", express.raw({ type: "*/*" }), (request, response) => {
  try {
    const { call } = readWebhook("post_call", { body: request.body, signature: request.get("Signature"), signingKey });
    calls.set(call.id, call);
    response.sendStatus(204);
  } catch (error) {
    if (!(error instanceof WebhookError)) throw error;
    console.warn("Rejected a CallRail webhook.", error.reason, error.message);
    response.sendStatus(error.reason === "missing_signature" || error.reason === "bad_signature" ? 401 : 204);
  }
});

app.use(express.json());

app.listen(3000);
```

`readWebhook` checks the `Signature` header against the body before it reads anything, then decodes the body as the kind you named. It needs the body exactly as it arrived, as bytes. `express.raw()` gives you a `Buffer`, which is a `Uint8Array`. Register webhook routes before `express.json()`. After `express.json()` parses a body, `readWebhook` cannot make a check of its signature. The type accepts only a `Uint8Array`. If you change the bytes to a string or to JSON and back, the result can differ from the bytes that CallRail signed.

## Respond to a rejected webhook

`readWebhook` throws a `WebhookError` whose `reason` says what went wrong.

- `missing_signature` means the request has no `Signature` header, so it did not come from CallRail. Respond with 401.
- `bad_signature` means the signature does not match the body. It also means that the request has more than one `Signature` header, or a header that is not strict Base64. The usual causes are a request that did not come from CallRail, an incorrect signing key, or a body that changed before `readWebhook` got it. Respond with 401. Many of these errors after a deploy usually mean that the key or the body handling changed.
- `malformed_body` means CallRail signed the request, but the body does not match the documented shape of the kind you named. `error.path` points at the value that did not match. If the body is not UTF-8 text or not JSON, `error.path` is `null`. If you set `maxAgeMs` and the `timestamp` is not a date, the reason is also `malformed_body`, with the path `$.timestamp`. Keep the raw body so you can process it later, and respond with a 2xx.
- `stale` means the event is older than the `maxAgeMs` you allowed. Skip it and respond with a 2xx.

CallRail never sends a webhook again, whatever your response is. After many failed deliveries, CallRail can turn off the integration. Thus, respond with a 2xx to each request that CallRail signed, also when your code cannot use it.

## Route every kind through one handler

`isWebhookKind` checks a route parameter, so one route can receive each kind. A check of `event.event` narrows the payload type.

```ts
// router.ts
import express from "express";
import { isWebhookKind, readWebhook, WebhookError } from "callrail/webhooks";

const signingKey = process.env.CALLRAIL_SIGNING_KEY;
if (!signingKey) {
  throw new Error("Set CALLRAIL_SIGNING_KEY before you start the server.");
}

const app = express();

app.post("/webhooks/callrail/:kind", express.raw({ type: "*/*" }), (request, response) => {
  const { kind } = request.params;
  if (!isWebhookKind(kind)) {
    response.sendStatus(404);
    return;
  }

  const event = readWebhook(kind, { body: request.body, signature: request.get("Signature"), signingKey });
  switch (event.event) {
    case "post_call":
    case "updated_call":
      console.log(event.call.id, event.call.duration, event.call.recording);
      break;
    case "sms_received":
      console.log(`Text from ${event.message.sourceNumber}: ${event.message.content}`);
      break;
    case "form_captured":
      console.log(event.submission.formUrl, event.submission.formData);
      break;
    default:
      break;
  }
  response.sendStatus(204);
});

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  if (!(error instanceof WebhookError)) {
    next(error);
    return;
  }
  console.warn("Rejected a CallRail webhook.", error.reason, error.message, error.path);
  response.sendStatus(error.reason === "missing_signature" || error.reason === "bad_signature" ? 401 : 204);
});

app.listen(3000);
```

## Receive a webhook in a route handler

Frameworks that hand you a Fetch `Request`, such as Next.js route handlers, give you the bytes through `arrayBuffer()`.

```ts
// app/webhooks/callrail/sms_received/route.ts
import { readWebhook, WebhookError } from "callrail/webhooks";

export async function POST(request: Request): Promise<Response> {
  try {
    const { message } = readWebhook("sms_received", {
      body: new Uint8Array(await request.arrayBuffer()),
      signature: request.headers.get("Signature"),
      signingKey: process.env.CALLRAIL_SIGNING_KEY ?? "",
    });
    console.log(message.sourceNumber, message.content, message.mediaUrls);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (!(error instanceof WebhookError)) throw error;
    const rejected = error.reason === "missing_signature" || error.reason === "bad_signature";
    return new Response(null, { status: rejected ? 401 : 204 });
  }
}
```

Do not call `request.json()` or `request.text()` first. Both read the body, and neither gives back the exact bytes. The handler reads the key, so a build without the variable still succeeds. If the key is empty, `readWebhook` throws a `TypeError` on the first request. The error message names the problem.

## Reject replayed events

Another person can capture a webhook and send it to you again, and its signature still matches. For five kinds, `readWebhook` can refuse an event whose `timestamp` is too old.

```ts
import { readWebhook, type WebhookRequest } from "callrail/webhooks";

export function screenPop(request: WebhookRequest) {
  const { call } = readWebhook("pre_call", request, { maxAgeMs: 5 * 60 * 1000 });
  return { caller: call.customerName, number: call.customerPhoneNumber };
}
```

`maxAgeMs` is available for `pre_call`, `answered_call`, `sms_received`, `sms_sent`, and `convert_assist_complete`. Their timestamps are close to the moment CallRail sends them. An older event throws a `WebhookError` with reason `stale`. `now` replaces the clock, which helps in tests.

The type refuses `maxAgeMs` for the other kinds. In CallRail's published example, a call webhook's `timestamp` is the call's start time, not the time it was sent. A `post_call` webhook can arrive 20 minutes after hangup, and an `updated_call` webhook can arrive days later. An age limit would discard real events, and CallRail never sends them again. `form_captured` has no timestamp at all. For these kinds, store each event by its id, as the `Map` in the first example does. Every payload is a full copy of the record, so a replay writes the same record again and changes nothing.

## Find the signing key

Each company has its own signing key. Copy it from the Webhooks integration page in the CallRail app, or read it through the API.

```ts
import { IntegrationId } from "callrail";
import { account } from "./callrail.js";

const integration = await account.integrations.get(IntegrationId(4321), { fields: ["signingKey"] });

if (integration.signingKey === null) {
  throw new Error("This integration has no signing key. Use the company's Webhooks integration.");
}
console.log(integration.signingKey);
```

A server that receives webhooks for many companies must find the correct key before it can make a check of a signature. Put the company in the URL, such as `/webhooks/callrail/COM8154748ae6bd4e278a7cddd38a662f4f/post_call`, and look up that company's key.

## Check the signature only

`verifyWebhook` checks the signature and throws the same errors as `readWebhook`. It does not decode the body. Use it when you send the raw request to a queue and decode it later.

```ts
import { verifyWebhook, WebhookError } from "callrail/webhooks";

export const queue: { body: Uint8Array; signature: string | null }[] = [];

export async function POST(request: Request): Promise<Response> {
  const body = new Uint8Array(await request.arrayBuffer());
  const signature = request.headers.get("Signature");
  try {
    verifyWebhook({ body, signature, signingKey: process.env.CALLRAIL_SIGNING_KEY ?? "" });
  } catch (error) {
    if (error instanceof WebhookError) return new Response(null, { status: 401 });
    throw error;
  }
  queue.push({ body, signature });
  return new Response(null, { status: 204 });
}
```

The worker that takes a job from the queue calls `readWebhook` with the stored body and signature. `readWebhook` checks the signature again before it decodes the body.

## Read the payloads

- `call` is a `WebhookCall`. It has each base field of a call from the REST API, and the optional fields that CallRail included. In a `pre_call` or `answered_call` event, the call is still in progress. Thus `duration` can be `null`, and a missing `answered` or `voicemail` reads as `false`.
- `changes` lists the fields that changed, such as `tags`, `note`, or `call_summary`. The `call` already holds the new values.
- `message` is a `WebhookText`. `sourceNumber` is formatted as CallRail displays it, such as `770-555-5555`, not in E.164 format. `mediaUrls` expire soon, so download the media right away and store the files, not the links. `leadStatus` can be any of the four values that [Text messages](text-messages.md#read-a-conversations-lead-status) describes.
- `submission` holds the form's fields in `formData`, keyed by field name, plus the page and the attribution fields.
- `convertAssist` holds the person, the last interaction, and Convert Assist's answers.

Webhook bodies send numbers for most ids. The decoder changes them into the same branded ids that the REST API returns. Some bodies send `""` for an empty value. The decoder changes `""` to `null` for a field that is not a string, such as an object, a number, or an id. A string field, such as `note`, keeps `""`.

To test your handlers, sign a fixture body with `signWebhook`, as [Testing](testing.md#test-a-webhook-handler) shows.
