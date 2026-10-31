# Filtering and fields

List methods share one vocabulary for dates, sorting, and search. Some resources also let you select the optional fields in the response, and the result type agrees with your selection. This chapter covers the shared parts. Each resource chapter lists the filters that resource accepts.

## Filter by date

The lists of calls, text messages, SMS threads, and form submissions accept a date filter, and so do `calls.summary`, `calls.timeseries`, and `formSubmissions.summary`. Use a named range, or a start date and an end date.

```ts
import { account } from "./callrail.js";

const today = await account.calls.list({ dateRange: "today" });
const march = await account.calls.list({ startDate: "2026-03-01", endDate: "2026-03-31", timeZone: "America/Denver" });

console.log(today.totalRecords, march.totalRecords);
```

The named ranges are `recent`, `today`, `yesterday`, `last_7_days`, `last_30_days`, `this_month`, `last_month`, `this_year`, `last_year`, and `all_time`.

`startDate` and `endDate` go together, and neither goes with `dateRange`. The type rejects any other mix at compile time. Both dates are ISO 8601 strings, and both ends are inclusive. Write a date, such as `2026-03-01`, or a date and time with an offset, such as `2026-03-01T09:00:00-07:00`. The client does not accept `Date` objects, because the day that a bare date names depends on the time zone.

`timeZone` sets the zone for date boundaries and for the timestamps in the response. Pass an IANA zone name, such as `America/Denver`, or `user` for the default time zone of the user who owns the API key. Without it, CallRail uses the account's time zone.

CallRail keeps records for 25 months. A filter that reaches further back returns an error.

## Sort results

`sort` takes a field and an optional direction. Write the field in camelCase, and the client sends CallRail's snake_case name.

```ts
import { account } from "./callrail.js";

const longest = await account.calls.list({ dateRange: "this_month", sort: { by: "duration", order: "desc" }, perPage: 10 });

for (const call of longest.items) {
  console.log(call.duration, call.customerName);
}
```

Each resource accepts its own sort fields, and the type of `by` lists them. An `order` without a `by` does not compile.

## Search

Calls, text messages, SMS threads, companies, trackers, and users accept `search`. It is one term, and CallRail matches it against a few fields of that resource, such as the customer name and phone number. Each resource chapter names the fields its search covers.

```ts
import { account } from "./callrail.js";

const page = await account.calls.list({ search: "Belcher", dateRange: "last_30_days" });

console.log(`${page.totalRecords} calls match`);
```

## Filter by tag

The lists of calls and form submissions accept `tags`, a list of tag names, and so do `calls.summary`, `calls.timeseries`, and `formSubmissions.summary`. A record matches if it has one or more of the names.

```ts
import { account } from "./callrail.js";

const flagged = await account.calls.list({ tags: ["VIP", "Callback"], dateRange: "last_7_days" });

console.log(`${flagged.totalRecords} calls carry VIP or Callback`);
```

## Choose optional fields

CallRail returns a base set of fields for each record and adds others only when you ask. List the extra fields in `fields`, and the result type gains exactly those properties.

```ts
import { account } from "./callrail.js";

const page = await account.calls.list({ fields: ["source", "tags", "leadStatus"] });

for (const call of page.items) {
  console.log(call.customerName, call.source, call.tags, call.leadStatus);
}
```

A requested field has the type `T | null`, because CallRail sends `null` for data a record does not have. A field you did not request is missing from the object and from its type. In the loop above, `call.note` gives a compile error, because the query did not ask for `note`.

These methods accept `fields`:

| Method | Fields you can add |
| --- | --- |
| `accounts.list`, `accounts.get` | `numericId` |
| `calls.list`, `calls.get` | Any key of `CallExtras`, such as `source`, `tags`, `note`, `milestones`, or `callSummary` |
| `companies.list`, `companies.get` | `verifiedCallerIds` |
| `formSubmissions.list` | Any key of `FormSubmissionExtras`, such as `leadStatus`, `value`, `tags`, or `milestones` |
| `integrations.list`, `integrations.get` | `signingKey` |
| `textMessages.list`, `textMessages.get` | `leadStatus`, `source` |
| `trackers.list`, `trackers.get` | `campaignName`, `swapTargets` |

`calls.get` also accepts `conversationalTranscript` and `integrationData`, which CallRail returns for one call at a time only.

## Narrow a lead to the fields you need

Leads work the other way. `leads.list` returns every field by default, and `fields` narrows each lead to the fields you name. The client always adds `id`.

```ts
import { account } from "./callrail.js";

const page = await account.leads.list({ fields: ["name", "phone"] });

for (const lead of page.items) {
  console.log(lead.id, lead.name, lead.phone);
}
```

## Pick summary metrics

`calls.summary`, `calls.timeseries`, and `formSubmissions.summary` use `fields` to choose metrics. The total count, `totalCalls` or `totalForms`, is always included.

```ts
import { account } from "./callrail.js";

const summary = await account.calls.summary({ dateRange: "last_month", fields: ["missedCalls", "leads"] });

console.log(summary.total.totalCalls, summary.total.missedCalls, summary.total.leads);
```
