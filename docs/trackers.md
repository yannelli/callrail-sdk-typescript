# Trackers

A tracker owns one or more tracking numbers and decides where their calls ring. CallRail has two kinds.

- A source tracker is one number for one marketing source, such as a billboard, a Google Business Profile, or visitors from a paid Google search.
- A session tracker is a pool of numbers. CallRail's tracking script shows each website visitor a number from the pool, so a call can be tied to the visit, its keywords, and the pages viewed.

Both kinds share every URL, so the client splits creating and updating by kind. Each input type holds only the settings its kind accepts.

## List trackers

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const page = await account.trackers.list({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  status: "active",
  fields: ["campaignName", "swapTargets"],
});

for (const tracker of page.items) {
  console.log(tracker.type, tracker.name, tracker.trackingNumbers, tracker.campaignName);
}
```

`type` filters by kind and narrows the result type, so `type: "session"` returns only session trackers. `status` is `active` or `disabled`, `search` matches one term against the tracker name, and `sort` accepts `name`. `fields` can add `campaignName` and `swapTargets`.

## Get a tracker and update it by kind

`trackers.get` accepts any tracker id and returns either kind. Check `tracker.type`, and TypeScript narrows the tracker, including its id. A session tracker's id is a `SessionTrackerId`, which is what `trackers.updateSession` requires.

```ts
import { TrackerId } from "callrail";
import { account } from "./callrail.js";

const tracker = await account.trackers.get(TrackerId("TRK8154748ae6bd4e278a7cddd38a662f4f"));

if (tracker.type === "session") {
  await account.trackers.updateSession(tracker.id, { poolSize: 8 });
} else {
  await account.trackers.updateSource(tracker.id, { campaignName: "Spring billboards" });
}
```

The tracker type is a closed union of `session` and `source`, so a `switch` on `tracker.type` covers every case. If CallRail adds a third kind, reading one fails with an `unexpected_response` problem until this package supports it.

## Create a source tracker

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const tracker = await account.trackers.createSource({
  name: "Billboard on I-85",
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  callFlow: {
    type: "basic",
    destinationNumber: "+17705551234",
    recordingEnabled: true,
    greeting: { text: "Thanks for calling Bob's Burgers." },
  },
  trackingNumber: { kind: "local", near: "+17705551234" },
  source: { type: "offline" },
  whisperMessage: "Call from [source]",
  campaignName: "Spring billboards",
});

console.log(tracker.id, tracker.trackingNumbers);
```

`source` says which callers the number is for. Use `{ type: "offline" }` for print, radio, and billboards, where the number never appears on your website. The other kinds are `all`, `direct`, `google_ad_extension`, `mobile_ad_extension`, `google_my_business`, `{ type: "landing_url", landing }`, `{ type: "landing_params", landing }`, `{ type: "web_referrer", referrer }`, and `{ type: "search", searchEngine, searchType }`.

`whisperMessage` plays to the person who answers, before the caller is connected. The caller never hears it. CallRail speaks the caller's detected source in place of `[source]`, although its table for creating a session tracker says it speaks the tracker name. `campaignName` is attached to every call to the number, and you can filter the call log and reports by it. Only source trackers have one.

## Request tracking numbers

`trackingNumber` on a source tracker and `poolNumbers` on a session tracker say which numbers CallRail should provision.

- `{ kind: "local", near }` asks for a number in the same area code as `near`, usually your business number. If that area code has none, CallRail falls back to nearby area codes. Add `areaCode` to forbid the fallback.
- `{ kind: "area_code", areaCode }` asks for any number in that area code.
- `{ kind: "toll_free" }` asks for a toll-free number. Add `areaCode`, such as `"888"`, to pick the prefix.

If CallRail has no number that satisfies a required area code, it creates no tracker and returns an error.

## Create a session tracker

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const tracker = await account.trackers.createSession({
  name: "Website visitors",
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  callFlow: { type: "basic", destinationNumber: "+17705551234", recordingEnabled: true },
  poolSize: 6,
  poolNumbers: { kind: "area_code", areaCode: "770" },
  source: { google: ["paid", "organic"], bing: ["paid"], direct: true },
  swapTargets: ["770-555-1234"],
});

console.log(tracker.id, tracker.trackingNumbers.length);
```

`poolSize` is the number of tracking numbers in the pool, from 4 to 50. `createSession` checks the range and throws a `TypeError` before it sends anything.

`source` is `"all"` for every visitor, or rules that pick visitors. `google`, `bing`, and `yahoo` take `paid`, `organic`, or both. `landing` and `referrer` take strings that CallRail looks for in the landing page URL and the referring page. `direct: true` includes visitors who arrived directly, and `inverted: true` shows the pool to the visitors who match none of the rules. One of CallRail's update examples sends `local` for Bing, but its field table lists only `paid` and `organic`, so the type accepts only those two.

`swapTargets` lists the phone numbers on your website that the tracking script replaces with a tracking number. The script finds every format of each number. Without `swapTargets`, it replaces the call flow's destination number.

## Choose a call flow

A basic call flow rings one number. Pass `greeting` with `{ text }` to have CallRail read a greeting, or with `{ recordingUrl }` to play an audio file. CallRail downloads the file once and keeps its own copy.

An advanced call flow, such as a menu or a schedule, is built in the CallRail app. Attach one by the id that follows `call-flow/` in the app's address bar.

```ts
import { SourceTrackerId } from "callrail";
import { account } from "./callrail.js";

const tracker = await account.trackers.updateSource(SourceTrackerId("TRK8154748ae6bd4e278a7cddd38a662f4f"), {
  callFlow: { type: "advanced", uuid: "4e5f7a8b-1c2d-4e3f-9a0b-1c2d3e4f5a6b" },
});

if (tracker.callFlow.type === "advanced") {
  for (const step of tracker.callFlow.steps) {
    console.log(step.type, step.id);
  }
}
```

A basic flow reads back in the shape you wrote it. An advanced flow reads back as its steps. The client knows the `dial`, `voicemail`, and `menu` steps, and any other step arrives as `other` with its JSON in `raw`.

## Turn on texting

A tracker can receive texts when `smsEnabled` is `true`. `smsSupported` on a tracker says whether its numbers can text at all. With texting on, `messageFlow` either sends an automatic reply to each incoming text or runs a [message flow](message-flows.md).

```ts
import { MessageFlowId, SessionTrackerId } from "callrail";
import { account } from "./callrail.js";

const autoReply = await account.trackers.updateSession(SessionTrackerId("TRK8154748ae6bd4e278a7cddd38a662f4f"), {
  smsEnabled: true,
  messageFlow: { type: "auto-reply", message: "Thanks for texting Bob's Burgers. We reply during business hours." },
});

const withFlow = await account.trackers.updateSession(autoReply.id, {
  smsEnabled: true,
  messageFlow: { type: "advanced", id: MessageFlowId("MFL1e9075f25b1949928b0db7323d775064") },
});

console.log(withFlow.messageFlow);
```

`messageFlow: null` removes the reply or flow and leaves texting on. The type accepts `messageFlow` only next to `smsEnabled: true`, because a flow needs texting on.

CallRail's request tables describe `message_flow` as an object, and its response tables describe it as an array. The client sends an object. When it reads a tracker, it accepts an object, a one-item array, `null`, or no field, and always gives you one assignment or `null`.

## Update a tracker

Use `updateSession` for session trackers and `updateSource` for source trackers. Keys you leave out stay as they are.

```ts
import { SourceTrackerId } from "callrail";
import { account } from "./callrail.js";

const tracker = await account.trackers.updateSource(SourceTrackerId("TRK8154748ae6bd4e278a7cddd38a662f4f"), {
  name: "Billboard on I-75",
  whisperMessage: null,
  source: { type: "search", searchEngine: "google", searchType: "paid" },
  replaceTrackingNumber: "+17705550000",
});

console.log(tracker.name, tracker.trackingNumbers);
```

`whisperMessage: null` removes the whisper. CallRail expects an empty string for that, and the client sends one for you. `replaceTrackingNumber` exchanges one of the tracker's numbers for a new one.

In an update, CallRail only lets `poolSize` grow, so the pool never drops a number that is live on your site. New numbers may take a while to arrive. `updateSession` sends the size without checking it.

## Disable a tracker

`trackers.disable` is CallRail's `DELETE`. It takes any tracker id.

```ts
import { TrackerId } from "callrail";
import { account } from "./callrail.js";

await account.trackers.disable(TrackerId("TRK8154748ae6bd4e278a7cddd38a662f4f"));
```

CallRail refuses to disable the tracker whose number places outbound calls for form submissions, and returns a 400. Choose a different outbound number for form submissions first.
