# Errors and rate limits

Every failure you can handle rejects with a `CallRailError`. Its `problem` property is a discriminated union, so you `switch` on `problem.kind` and TypeScript tells you when a case is missing.

## Handle a failed request

```ts
import { CallRailError, CompanyId } from "callrail";
import { account } from "./callrail.js";

try {
  await account.companies.update(CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"), { name: "Acme Plumbing" });
} catch (error) {
  if (!(error instanceof CallRailError)) throw error;
  switch (error.problem.kind) {
    case "invalid_request":
      console.error(error.message, error.problem.fieldErrors);
      break;
    case "not_found":
      console.error("That company does not exist in this account.");
      break;
    default:
      throw error;
  }
}
```

`error.message` holds CallRail's own explanation when the response had one, and the status line otherwise.

## Know the problem kinds

| `kind` | Cause | Extra properties |
| --- | --- | --- |
| `unauthorized` | A 401. The API key is missing or wrong. | `status` |
| `forbidden` | A 403. The key cannot see this account or record. | `status` |
| `not_found` | A 404. | `status` |
| `invalid_request` | A 400, 422, or any other 4xx that is not listed here. | `status`, `fieldErrors` |
| `rate_limited` | A 429. | `status`, `bucket`, `retryAfterMs` |
| `server_error` | A 5xx, after the retries for a `GET`. | `status` |
| `network` | No response arrived. | `cause` |
| `timeout` | An attempt ran past `timeoutMs`, after the retries for a `GET`. | `timeoutMs` |
| `unexpected_response` | A 2xx that the client could not read. | `status`, `reason`, `path` |

## Handle every kind

A function that returns a value from a `switch` over `problem.kind` fails to compile when it misses a kind. If a later version of this package adds one, the compiler points you at every place that needs it.

```ts
import { CallRailError, type Problem } from "callrail";
import { account } from "./callrail.js";

function explain(problem: Problem): string {
  switch (problem.kind) {
    case "unauthorized":
      return "Check CALLRAIL_API_KEY.";
    case "forbidden":
      return "This key cannot see that account or record.";
    case "not_found":
      return "The record does not exist.";
    case "invalid_request":
      return `CallRail rejected the request with status ${problem.status}.`;
    case "rate_limited":
      return `The ${problem.bucket} rate limit is used up.`;
    case "server_error":
      return `CallRail failed with status ${problem.status}.`;
    case "network":
      return "The request never reached CallRail.";
    case "timeout":
      return `CallRail did not answer within ${problem.timeoutMs} ms.`;
    case "unexpected_response":
      return `CallRail answered ${problem.status} with a body the client could not read, because of ${problem.reason}.`;
  }
}

try {
  await account.calls.list();
} catch (error) {
  if (!(error instanceof CallRailError)) throw error;
  console.error(explain(error.problem));
}
```

## Read field errors

When CallRail names the fields it rejected, `invalid_request` carries them in `fieldErrors`, keyed by CallRail's field name. The map is empty when the response named no fields.

```ts
import { CallRailError, CompanyId } from "callrail";
import { account } from "./callrail.js";

try {
  await account.messageFlows.create({
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
    name: "After hours",
    steps: [{ type: "sms_response", id: "reply", message: "We open at 8 AM.", firstText: false, nextStepId: null }],
  });
} catch (error) {
  if (!(error instanceof CallRailError) || error.problem.kind !== "invalid_request") throw error;
  for (const [field, messages] of Object.entries(error.problem.fieldErrors)) {
    console.error(`${field}: ${messages.join(", ")}`);
  }
}
```

## Log a failure

`error.request` holds the method and URL of the request that failed. The URL never contains the API key, which travels in a header. `error.responseText` holds the raw response body, or `null` when no response arrived.

```ts
import { CallRailError } from "callrail";
import { account } from "./callrail.js";

try {
  await account.users.list();
} catch (error) {
  if (!(error instanceof CallRailError)) throw error;
  console.error(JSON.stringify({ kind: error.problem.kind, request: error.request, body: error.responseText }));
  throw error;
}
```

## Stay within the rate limits

CallRail counts each account's requests over an hour and over a day. Every process that uses a key for that account draws from the same budget. These are the default limits:

| Budget | `bucket` | Per hour | Per day |
| --- | --- | --- | --- |
| General requests | `general` | 1,000 | 10,000 |
| Sending text messages | `sms_send` | 150 | 1,000 |
| Placing outbound calls | `outbound_call` | 100 | 2,000 |

`textMessages.send` draws from the text budget and `calls.create` draws from the outbound call budget. Every other method draws from the general budget. CallRail support can raise the limits for an account.

The client has no rate limiter of its own. A counter in one process cannot see what other processes spent, so the 429 response from CallRail is the only reliable signal. The client never retries a 429, because the windows last an hour or a day. Handle `rate_limited` by deferring the work.

```ts
import { CallRailError, CompanyId } from "callrail";
import { account } from "./callrail.js";

export async function sendReminder(customerPhoneNumber: string): Promise<"sent" | "retry_later"> {
  try {
    await account.textMessages.send({
      companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
      customerPhoneNumber,
      content: "Your appointment is tomorrow at 9 AM.",
    });
    return "sent";
  } catch (error) {
    if (error instanceof CallRailError && error.problem.kind === "rate_limited") return "retry_later";
    throw error;
  }
}
```

`retryAfterMs` is `null` unless the response had a `Retry-After` header. CallRail does not document that header, so plan for `null`.

## Know what the client retries

The client retries a `GET` after a network error, a timeout, or a 500, 502, 503, or 504 response, up to `maxRetries` times. It never retries a write, a 429, or any other 4xx. [Configuration](configuration.md) covers the retry options.

## Check before you repeat a write

A `network` or `timeout` problem on a write is ambiguous. The request may have reached CallRail before the connection failed. Before you send a text message or place a call again, check whether the first one went out, for example by listing the recent messages of that conversation.

An `unexpected_response` problem after a write means CallRail accepted the change and the client could not read the answer. Do not send the write again. Read the record to see its current state. For a response that did not decode, `problem.path` names the JSON path of the value that did not match, such as `$.company_id`.

## Fix programmer errors

Some mistakes are not visible to the type checker, so the client throws a `TypeError` before it sends anything. Examples include an invalid constructor option, an id constructor given an empty string, a message flow in which two steps share an id, and a session tracker pool size outside 4 to 50. Fix the calling code instead of catching these.

Webhook handlers get a different error type, `WebhookError`, which [Webhooks](webhooks.md) covers.
