# Pagination

Every list method returns a `PagePromise`. Await it to get the first page. Loop over it with `for await` to get every item on every page.

## Read one page

```ts
import { account } from "./callrail.js";

const page = await account.companies.list({ perPage: 50 });

console.log(`Page ${page.page} of ${page.totalPages}, ${page.totalRecords} companies in all`);
for (const company of page.items) {
  console.log(company.name);
}
```

`page` starts at 1. `perPage` defaults to 100, and most endpoints accept at most 250.

## Loop over every item

```ts
import { account } from "./callrail.js";

for await (const company of account.companies.list()) {
  console.log(company.name);
}
```

The loop requests the next page only when it reaches the end of the current one, so one page at a time is in memory. When you `break`, the client requests no more pages.

```ts
import { account } from "./callrail.js";

let longCalls = 0;
for await (const call of account.calls.list({ dateRange: "last_30_days", sort: { by: "duration", order: "desc" } })) {
  if ((call.duration ?? 0) < 600) break;
  longCalls += 1;
}

console.log(`${longCalls} calls in the last 30 days lasted ten minutes or more.`);
```

## Step through pages yourself

`next()` requests the following page with the same query. After the last page it resolves `null` and sends nothing.

```ts
import type { OffsetPage, Tag } from "callrail";
import { account } from "./callrail.js";

let page: OffsetPage<Tag> | null = await account.tags.list({ perPage: 25 });

while (page !== null) {
  console.log(page.items.map((tag) => tag.name).join(", "));
  page = await page.next();
}
```

## Page through large call exports

CallRail recommends relative pagination for large sets of calls, and supports it only on `calls.list`. Pass `pagination: "relative"`. Each page then follows the `next_page` link that CallRail returns, and carries `hasNextPage` instead of page totals.

```ts
import { account } from "./callrail.js";

let exported = 0;
for await (const call of account.calls.list({ pagination: "relative", dateRange: "last_year", perPage: 250 })) {
  exported += 1;
  if (exported % 1000 === 0) console.log(`${exported} calls so far, last one at ${call.startTime}`);
}

console.log(`Exported ${exported} calls.`);
```

To start partway through, pass `offset`, which counts pages from 0. A relative query cannot take `page`, and an offset query cannot take `offset`. The compiler rejects the mix.

```ts
import { account } from "./callrail.js";

const tenth = await account.calls.list({ pagination: "relative", offset: 9, perPage: 100 });

console.log(tenth.kind, tenth.items.length, tenth.hasNextPage);
```

A call that arrives between two requests can shift the window, so one page may overlap the next or skip a call. If an export must be exact, deduplicate by `call.id`, and filter with `startDate` and `endDate` that end in the past.

## Read a record and its first page

Three methods return a record together with the first page of its children:

- `smsThreads.get` returns `{ thread, messages }`.
- `textMessages.get` returns `{ conversation, messages }`.
- `leads.timeline` returns `{ lead, events }`.

The child page is an ordinary page. `next()` requests the record again with the next page number, and `for await` walks every child.

```ts
import { SmsThreadId } from "callrail";
import { account } from "./callrail.js";

const { thread, messages } = await account.smsThreads.get(SmsThreadId("KkMhr"));

console.log(`Thread with ${thread.customerName ?? thread.customerPhoneNumber}`);
for await (const message of messages) {
  console.log(message.createdAt, message.direction, message.content);
}
```

## Stop a long loop

A `signal` in the query applies to every page. Aborting it stops the page request in flight and rejects the loop with the signal's reason.

```ts
import { account } from "./callrail.js";

const signal = AbortSignal.timeout(60_000);
let seen = 0;

try {
  for await (const call of account.calls.list({ dateRange: "all_time", signal })) {
    seen += 1;
    if (call.voicemail) console.log(`Voicemail from ${call.customerPhoneNumber} at ${call.startTime}`);
  }
} catch (error) {
  if (!(error instanceof DOMException && error.name === "TimeoutError")) throw error;
  console.log(`Stopped after one minute and ${seen} calls.`);
}
```
