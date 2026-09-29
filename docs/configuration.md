# Configuration

You configure the client once, when you construct it. The constructor checks every option, so a missing key or a malformed base URL fails when your app starts, not on its first request.

## Create one client module

Most apps work with one CallRail account. Create the client in one module and import it everywhere else. The examples in the rest of these docs import `callrail` and `account` from this file.

```ts
// callrail.ts
import { CallRail } from "callrail";

const apiKey = process.env.CALLRAIL_API_KEY;
const accountId = process.env.CALLRAIL_ACCOUNT_ID;
if (!apiKey || !accountId) {
  throw new Error("Set CALLRAIL_API_KEY and CALLRAIL_ACCOUNT_ID before you start the app.");
}

export const callrail = new CallRail({ apiKey });
export const account = callrail.account(accountId);
```

`callrail.account(id)` sends no request. It returns an `AccountClient`, and every resource on it, such as `account.calls` or `account.companies`, puts the account id into each request path. The id can be the `ACC` id or the nine-digit number that follows `/a/` in the address bar of the CallRail dashboard. [Accounts and ids](accounts.md) covers ids in depth.

Import the module with a `.js` extension, the way Node.js resolves ES modules. TypeScript maps `./callrail.js` to `callrail.ts`.

```ts
import { account } from "./callrail.js";

const companies = await account.companies.list();
console.log(`${companies.totalRecords} companies`);
```

## Know the options

The constructor takes one object.

| Option | Default | Purpose |
| --- | --- | --- |
| `apiKey` | Required | An API key from your CallRail settings. |
| `requestFrom` | Not sent | Your product name, sent as the `Request-From` header. |
| `timeoutMs` | `30000` | How long one attempt waits for a response. |
| `maxRetries` | `2` | How many extra attempts a failed `GET` gets. |
| `baseUrl` | `https://api.callrail.com` | The origin that receives every request. |
| `fetch` | The global `fetch` | The function that sends every request. |

The constructor throws a `TypeError` for an empty `apiKey` and for a `requestFrom` that has characters other than lowercase letters, digits, and underscores. It also throws for a `baseUrl` that is not an `https:` origin without a path, a `timeoutMs` that is not a positive number, and a `maxRetries` that is negative or fractional.

## Identify your product

If you build a product that other CallRail customers connect to, set `requestFrom` to your product name in lowercase with underscores. Leave it out when you call the API for your own data.

```ts
import { CallRail } from "callrail";

export function clientFor(customerApiKey: string): CallRail {
  return new CallRail({ apiKey: customerApiKey, requestFrom: "hanks_hotdogs" });
}
```

## Set timeouts and retries

`timeoutMs` limits each attempt, not the whole method call. When a `GET` fails with a network error, a timeout, or a 500, 502, 503, or 504 response, the client tries again, up to `maxRetries` more times. Before each retry it waits a random time between zero and a ceiling. The ceiling starts at half a second, doubles with each retry, and stops at eight seconds.

The client never retries a `POST`, a `PUT`, or a `DELETE`. A write that timed out may already have sent the text message or placed the call. It never retries a 429 response either, as [Errors and rate limits](errors-and-rate-limits.md) explains.

With the defaults, a `GET` that never gets an answer rejects after three attempts of 30 seconds each, plus the waits between them. Tighten both options for code that a person is waiting on, and loosen them for background jobs.

```ts
import { CallRail } from "callrail";

const apiKey = process.env.CALLRAIL_API_KEY;
if (!apiKey) throw new Error("Set CALLRAIL_API_KEY.");

export const interactive = new CallRail({ apiKey, timeoutMs: 5_000, maxRetries: 0 });
export const background = new CallRail({ apiKey, timeoutMs: 60_000, maxRetries: 4 });
```

## Cancel a request

Every method that sends a request accepts an `AbortSignal` named `signal` in its last argument. For a list, `signal` goes in the query. For a method that takes an id or an input first, it goes in a trailing options object.

```ts
import { CallId } from "callrail";
import { account } from "./callrail.js";

const signal = AbortSignal.timeout(10_000);

const today = await account.calls.list({ dateRange: "today", signal });
const call = await account.calls.get(CallId("CAL8154748ae6bd4e278a7cddd38a662f4f"), { fields: ["note"], signal });
await account.calls.update(call.id, { note: "Called back" }, { signal });

console.log(today.totalRecords);
```

Aborting stops the request in flight and any retry that is waiting. On a list, it also stops every page that the loop has not fetched yet. The method rejects with the signal's reason, which is an `AbortError` for `controller.abort()` and a `TimeoutError` for `AbortSignal.timeout()`.

The two timeouts do different jobs. `timeoutMs` bounds one attempt, and a `GET` that hits it is retried. `AbortSignal.timeout()` bounds the whole operation, including retries and later pages, and nothing retries after it fires.

If you abort a write after the client sent it, CallRail may still apply it. Read the record again before you repeat the write.

```ts
import { CallId } from "callrail";
import { account } from "./callrail.js";

const controller = new AbortController();
setTimeout(() => controller.abort(), 2_000);

try {
  await account.calls.update(CallId("CAL8154748ae6bd4e278a7cddd38a662f4f"), { note: "Called back" }, { signal: controller.signal });
} catch (error) {
  if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
  console.log("Cancelled. Read the call again to see whether the note was saved.");
}
```

## Replace fetch

The client sends every request through the global `fetch` unless you pass your own. Any function of type `FetchLike`, which is `(url: string, init: RequestInit) => Promise<Response>`, works. Use it to log requests or to send them through your own HTTP stack.

```ts
import { CallRail, type FetchLike } from "callrail";

const apiKey = process.env.CALLRAIL_API_KEY;
if (!apiKey) throw new Error("Set CALLRAIL_API_KEY.");

const logged: FetchLike = async (url, init) => {
  const started = Date.now();
  const response = await fetch(url, init);
  console.log(init.method, url, response.status, `${Date.now() - started} ms`);
  return response;
};

export const callrail = new CallRail({ apiKey, fetch: logged });
```

The API key travels in the `Authorization` header and never in the URL, so the URL is safe to log. Do not log `init.headers`.

The client follows URLs that CallRail returns, such as the next page of calls and text message media, only when their origin matches `baseUrl`. That check keeps your API key from reaching any other host.

To test code that uses the client, pass the scripted `fakeFetch` from `callrail/testing`. [Testing](testing.md) shows how.
