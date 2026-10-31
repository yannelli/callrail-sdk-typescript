# Calls

A call is one inbound call to a tracking number, or one outbound call placed through CallRail. The record has the caller, the tracking number, the duration, and the recording. If you ask for them, it also has attribution fields, such as the marketing source and the keywords.

## List calls

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const page = await account.calls.list({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  dateRange: "last_7_days",
  answerStatus: "missed",
  fields: ["source", "formattedCustomerLocation"],
});

for (const call of page.items) {
  console.log(call.startTime, call.customerPhoneNumber, call.source, call.formattedCustomerLocation);
}
```

`calls.list` accepts these filters, each optional:

- `companyId` and `trackerId` limit the list to one company or one tracker.
- `callType` is `first_call`, `missed`, `voicemails`, `inbound`, or `outbound`.
- `answerStatus` is `answered`, `missed`, or `voicemail`.
- `direction` is `inbound` or `outbound`, and `device` is `desktop` or `mobile`.
- `leadStatus` is `good_lead`, `not_a_lead`, or `not_scored`.
- `tags` matches calls that carry any of the listed tag names.
- `search` matches one term against the business phone number, the customer's number and name, the note, and the source.

Sort by `startTime`, `duration`, `customerName`, `customerPhoneNumber`, `source`, `sourceName`, `customerCity`, `customerCountry`, `landingPageUrl`, `deviceType`, `answered`, `firstCall`, `leadStatus`, or `tags`. [Filtering and fields](filtering-and-fields.md) covers dates, sorting, and `fields`. For large exports, use relative pagination, as [Pagination](pagination.md) describes.

Every call has `id`, `answered`, `voicemail`, `direction`, `startTime`, `duration`, `customerPhoneNumber`, `trackingPhoneNumber`, `businessPhoneNumber`, `customerName`, the customer's city, state, and country, and the recording fields. `customerPhoneNumber` and `trackingPhoneNumber` are in E.164 format, such as `+13035550100`. `startTime` keeps the offset of the requested time zone, so the client leaves it as a string. `duration` is in seconds.

## Get one call

```ts
import { CallId } from "callrail";
import { account } from "./callrail.js";

const call = await account.calls.get(CallId("CAL8154748ae6bd4e278a7cddd38a662f4f"), {
  fields: ["callSummary", "conversationalTranscript", "leadStatus", "value"],
});

console.log(call.leadStatus, call.value);
for (const phrase of call.conversationalTranscript ?? []) {
  console.log(`${phrase.speaker}: ${phrase.phrase}`);
}
```

`get` accepts every field that `list` accepts, plus `conversationalTranscript` and `integrationData`. `callSummary` is a string in a list and an array of sentences from `get`, so its type is `string | readonly string[] | null`. `value` is in dollars, as a number. `personId` is `null` when CallRail reports the caller as anonymous.

## Place an outbound call

`calls.create` connects your business to a customer. CallRail rings `businessPhoneNumber` first, and when someone answers, it dials `customerPhoneNumber` and joins the two. Outbound calls work for US and Canadian numbers only.

```ts
import { OutboundCallerNumber, UserId } from "callrail";
import { account } from "./callrail.js";

const call = await account.calls.create({
  callerId: OutboundCallerNumber(7703334455),
  customerPhoneNumber: "+14045556789",
  businessPhoneNumber: "+17705551234",
  recordingEnabled: true,
  greeting: { text: "This call may be recorded." },
  agentId: UserId("USR8154748ae6bd4e278a7cddd38a662f4f"),
});

console.log(call.id, call.answered, call.duration);
```

`callerId` is the number the customer sees. It must be a tracking number in the account or an outbound caller id with `verified: true`. Write it as its 10 digits with `OutboundCallerNumber`. A `CallerIdId` does not fit there, because that id names the verification record and not the digits the customer sees. CallRail's field table gives `caller_id` as a 10-digit integer, but one of its examples sends a string. The client obeys the table and sends an integer. [Outbound caller ids](caller-ids.md) shows how to add a number.

The call is still ringing when `create` resolves, so `answered` and `voicemail` are `false`, and `duration` is `null`. Read the call again later, or receive the `post_outbound_call` webhook, to learn how it went.

`greeting` plays to the customer when they answer. Pass `{ text }` to have CallRail read the text aloud, or `{ recordingUrl }` to play an audio file, never both. `agentId` assigns the call to that user.

Each outbound call draws from the outbound call budget of 100 per hour and 2,000 per day, and the client never retries it. A retry after a lost response could ring the customer twice.

## Update a call

```ts
import { CallId } from "callrail";
import { account } from "./callrail.js";

const call = await account.calls.update(CallId("CAL8154748ae6bd4e278a7cddd38a662f4f"), {
  note: "Asked for a quote on a water heater.",
  tags: { add: ["Quote requested"] },
  value: 450,
  leadStatus: "good_lead",
  customerName: "Linda Belcher",
});

console.log(call.id);
```

Keys you leave out stay as they are. `null` clears `note`, `value`, `leadStatus`, and `customerName`.

- `tags: { add: [...] }` adds tags and keeps the existing ones. `tags: { replace: [...] }` sets the exact list, and `{ replace: [] }` removes every tag. A tag name that does not exist yet creates the tag. [Tags](tags.md) explains more.
- `value` is in dollars. The client sends it as the two-decimal string CallRail expects, so `450` becomes `"450.00"`.
- `leadStatus` accepts `good_lead`, `not_a_lead`, or `null`. CallRail sets `previously_marked_good_lead` itself when the caller was a good lead on an earlier call. Setting `good_lead` on such a call returns a 400.
- `spam: true` marks the call as spam. The API cannot undo it, so `spam: false` does not exist.

## Summarize call metrics

`calls.summary` counts calls over a date range. Add `groupBy` to break the totals down by `source`, `keywords`, `campaign`, `referrer`, or `landing_page`.

```ts
import { account } from "./callrail.js";

const summary = await account.calls.summary({
  dateRange: "last_month",
  groupBy: "source",
  fields: ["answeredCalls", "missedCalls", "firstTimeCallers"],
});

console.log(`${summary.total.totalCalls} calls from ${summary.startDate} to ${summary.endDate}`);
for (const group of summary.groups) {
  console.log(group.key, group.totalCalls, group.answeredCalls, group.missedCalls);
}
```

The metrics are `totalCalls`, `answeredCalls`, `missedCalls`, `firstTimeCallers`, `averageDuration`, `formattedAverageDuration`, and `leads`. `totalCalls` is always included, and `fields` adds the others. `groups` is empty and `groupedBy` is `null` when the query has no `groupBy`.

Across the whole account, you can also group by `company` or `company_id`. These groupings cannot go with `companyId`, and the type rejects the pair. The summary also accepts `device`, `minDuration`, `maxDuration` in seconds, `tags`, `trackerIds`, `direction`, `answerStatus`, `firstTimeCallers`, `leadStatus`, `agentId`, and `search`.

## Chart calls over time

`calls.timeseries` returns the same metrics as one point per interval. The interval is `hour`, `day`, `week`, `month`, or `year`, and defaults to `day`. CallRail returns at most 200 points.

```ts
import { account } from "./callrail.js";

const series = await account.calls.timeseries({
  startDate: "2026-03-01",
  endDate: "2026-03-31",
  interval: "day",
  fields: ["missedCalls", "leads"],
});

for (const point of series.points) {
  console.log(point.date, point.totalCalls, point.missedCalls, point.leads);
}
```

Each point's `date` is a day such as `2026-03-01`, or a full timestamp for hourly points. The time series accepts the same filters as the summary, except `groupBy`. `search` matches the source only.

## Play a recording

The `recording` field on a call is the address of an API endpoint, not audio. `calls.recording` asks that endpoint for a playable link.

```ts
import { CallId } from "callrail";
import { account } from "./callrail.js";

const recording = await account.calls.recording(CallId("CAL8154748ae6bd4e278a7cddd38a662f4f"));

console.log(recording.url);
```

On most accounts, the link is stable. On a HIPAA account, the link expires after about 24 hours. Request a new link each time, and do not store it.

## List the pages a caller viewed

For a call from a website visitor, `calls.pageViews` lists the pages of the visitor's session, in order. It is a paginated list. Pass `timeZone` when you want `createdAt` read in a zone other than the account default, such as `America/Los_Angeles`.

```ts
import { CallId } from "callrail";
import { account } from "./callrail.js";

for await (const view of account.calls.pageViews(CallId("CAL8154748ae6bd4e278a7cddd38a662f4f"))) {
  console.log(view.createdAt, view.pageUrl, view.referrerUrl);
}
```
