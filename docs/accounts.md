# Accounts and ids

An API key can reach one or more CallRail accounts. Agencies often reach several. Every other resource lives inside an account, so you name the account once with `callrail.account(id)` and the client puts its id into every request path.

## List the accounts a key can see

```ts
import { callrail } from "./callrail.js";

const accounts = await callrail.accounts.list({ sort: { by: "name" } });

for (const account of accounts.items) {
  console.log(account.id, account.name, account.hipaaAccount ? "HIPAA" : "");
}
```

Pass `hipaaAccount: true` or `hipaaAccount: false` to filter by HIPAA status. HIPAA accounts return recording links that expire, as [Calls](calls.md) explains.

## Get one account

```ts
import { AccountId } from "@yannelli/callrail";
import { callrail } from "./callrail.js";

const account = await callrail.accounts.get(AccountId("ACC8154748ae6bd4e278a7cddd38a662f4f"), { fields: ["numericId"] });

console.log(account.name, account.numericId);
```

`numericId` is the nine-digit id from the CallRail dashboard URL. It exists on the result only because the call asked for it in `fields`. [Filtering and fields](filtering-and-fields.md) explains how `fields` shapes a result type.

## Work in an account

`callrail.account(id)` takes either form of the account id, as a string or as a number, and sends no request.

```ts
import { callrail } from "./callrail.js";

const byPrefixedId = callrail.account("ACC8154748ae6bd4e278a7cddd38a662f4f");
const byNumericId = callrail.account(227799611);

console.log(byPrefixedId.id, byNumericId.id);
```

To work across every account a key can see, create one `AccountClient` per account from the same `CallRail` instance.

```ts
import { callrail } from "./callrail.js";

for await (const { id, name } of callrail.accounts.list()) {
  const companies = await callrail.account(id).companies.list();
  console.log(`${name} has ${companies.totalRecords} companies`);
}
```

## Pass ids with their own types

Each resource has its own id type, such as `CallId`, `CompanyId`, or `TagId`. The types are branded, so TypeScript rejects a `CompanyId` where a `CallId` belongs, even though both are strings at runtime.

Ids that come back from the API already have the right type. Pass them along as they are.

```ts
import { account } from "./callrail.js";

const page = await account.calls.list({ perPage: 1 });
const latest = page.items[0];

if (latest) {
  const call = await account.calls.get(latest.id, { fields: ["note"] });
  console.log(call.note);
}
```

An id from your database, a URL, or an environment variable goes through the constructor of the same name once.

```ts
import { CallId, TagId } from "@yannelli/callrail";
import { account } from "./callrail.js";

const call = await account.calls.get(CallId("CAL8154748ae6bd4e278a7cddd38a662f4f"));
await account.tags.update(TagId("993186"), { color: "blue1" });

console.log(call.startTime);
```

Most ids are strings that start with a prefix, such as `CAL` for calls and `COM` for companies. Older records and webhook payloads send some of these ids as plain numbers. For this reason, the string id constructors also accept a number and store it as a string. `CallId(766970532)` and `CallId("766970532")` are equal.

Tags, integrations, integration filters, notifications, and outbound caller ids have integer ids everywhere. Their types, `TagId`, `IntegrationId`, `IntegrationFilterId`, `NotificationId`, and `CallerIdId`, wrap numbers, and their constructors also accept a string of digits, such as a route parameter.

The constructors throw a `TypeError` for an empty string, a string with spaces around it, a negative number, a fraction, and a number above `Number.MAX_SAFE_INTEGER`. The integer id constructors also throw for a string that is not all digits, such as `"12a"`. The constructors do not check prefixes.

## Keep session and source trackers apart

Session trackers and source trackers share every URL but accept different settings. `SessionTrackerId` and `SourceTrackerId` are both a `TrackerId` that also records the tracker type. `trackers.updateSession` accepts only a `SessionTrackerId`, so the compiler stops you from sending session settings to a source tracker. [Trackers](trackers.md) shows how a tracker you read from the API gives you the right id.
