# callrail

A typed Node.js client for the [CallRail API v3](https://apidocs.callrail.com/). It covers every documented endpoint and has no runtime dependencies.

- Every id has its own type, so a company id cannot be passed where a call id belongs.
- A failed request throws a `CallRailError` whose `problem` is a typed union you can `switch` on.
- Lists page themselves with `for await`.
- Reads retry after network errors and server errors. Writes never retry, so a text is never sent twice.
- `callrail/webhooks` verifies CallRail's signature before it hands you a typed event.
- `callrail/testing` gives your tests a scripted `fetch` that records every request.

## Install

```bash
npm install callrail
```

The package needs Node.js 20 or later and is published as ES modules. [Installation](docs/installation.md) covers TypeScript settings and CommonJS projects.

## Quickstart

```ts
import { CallRail, CallRailError } from "callrail";

const apiKey = process.env.CALLRAIL_API_KEY;
if (!apiKey) throw new Error("Set CALLRAIL_API_KEY to an API key from your CallRail settings.");

const callrail = new CallRail({ apiKey });
const account = callrail.account("ACC8154748ae6bd4e278a7cddd38a662f4f");

try {
  for await (const call of account.calls.list({ dateRange: "last_7_days" })) {
    console.log(call.startTime, call.customerName, call.duration);
  }
} catch (error) {
  if (error instanceof CallRailError && error.problem.kind === "unauthorized") {
    console.error("CallRail rejected the API key.");
  } else {
    throw error;
  }
}
```

`callrail.account(id)` makes no request. It returns a client for one account, with every resource under it, such as `account.calls` and `account.trackers`.

## Documentation

Start here:

- [Installation](docs/installation.md)
- [Configuration](docs/configuration.md)
- [Accounts and ids](docs/accounts.md)
- [Pagination](docs/pagination.md)
- [Filtering and fields](docs/filtering-and-fields.md)
- [Errors and rate limits](docs/errors-and-rate-limits.md)

Resources:

- [Calls](docs/calls.md)
- [Text messages](docs/text-messages.md)
- [SMS threads](docs/sms-threads.md)
- [Form submissions](docs/form-submissions.md)
- [Leads](docs/leads.md)
- [Companies](docs/companies.md)
- [Trackers](docs/trackers.md)
- [Message flows](docs/message-flows.md)
- [Outbound caller ids](docs/caller-ids.md)
- [Tags](docs/tags.md)
- [Users](docs/users.md)
- [Notifications](docs/notifications.md)
- [Summary emails](docs/summary-emails.md)
- [Integrations](docs/integrations.md)
- [Integration filters](docs/integration-filters.md)

Receiving and testing:

- [Webhooks](docs/webhooks.md)
- [Testing](docs/testing.md)

## Develop

```bash
npm install
npm run typecheck
npm test
npm run build
npm run docs:check
```

`npm run docs:check` compiles every TypeScript example in this README and in `docs/`. It fails when an API operation has no example in its chapter, or when a relative link points at a missing page or heading. It also fails on prose that uses a long dash, a semicolon, a curly quote, or a colon in the middle of a line.
