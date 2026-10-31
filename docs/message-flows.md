# Message flows

A message flow decides what happens when a tracking number receives a text. It can reply at set hours, tag the conversation, forward the text, or send no reply. You build flows here and attach one to a tracker in [Trackers](trackers.md#turn-on-texting). A tracker that only needs one automatic reply does not need a flow.

CallRail runs a flow only on a local number in the United States or Canada that is registered for 10DLC and has texting turned on. Accounts with Lead Center turned on cannot use flows. A lead receives the reply from a given step at most once in 24 hours.

## List message flows

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const page = await account.messageFlows.list({ companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f") });

for (const flow of page.items) {
  console.log(flow.id, flow.name, flow.updatedAt, flow.trackerIds);
}
```

`companyId` limits the list to one company. `trackerIds` lists the trackers that use each flow. A summary has no steps, so call `get` when you need them.

## Get a message flow

```ts
import { MessageFlowId } from "callrail";
import { account } from "./callrail.js";

const flow = await account.messageFlows.get(MessageFlowId("MFL1e9075f25b1949928b0db7323d775064"));

for (const step of flow.steps) {
  switch (step.type) {
    case "schedule":
      console.log(step.id, "picks one of", step.branches.length, "branches by the time");
      break;
    case "sms_response":
      console.log(step.id, "replies", step.message);
      break;
    case "tag":
      console.log(step.id, "applies tags", step.tagIds);
      break;
    case "forward_message":
      console.log(step.id, "forwards the text to", step.destinationNumber);
      break;
    case "no_response":
      console.log(step.id, "sends nothing");
      break;
    case "other":
      console.log(step.id, "is a", step.wireType, "step", step.raw);
      break;
  }
}
```

CallRail stores steps as a map keyed by step id, next to the id of the start step. The client gives you a list with the start step first. A step type this package does not know arrives as `other`, with CallRail's type name in `wireType` and the step's JSON in `raw`.

## Create a message flow

This flow replies outside business hours and tags every conversation.

```ts
import { CompanyId, TagId } from "callrail";
import { account } from "./callrail.js";

const flow = await account.messageFlows.create({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  name: "After-hours reply",
  steps: [
    {
      type: "schedule",
      id: "schedule-01",
      branches: [
        {
          times: [
            { day: "weekdays", startTime: "1700", endTime: "2359" },
            { day: "weekdays", startTime: "0000", endTime: "0800" },
            { day: "weekends", startTime: "0000", endTime: "2359" },
          ],
          nextStepId: "response-01",
        },
        { times: [{ day: "weekdays", startTime: "0800", endTime: "1700" }], nextStepId: "tag-01" },
      ],
      nextStepId: "response-01",
    },
    {
      type: "sms_response",
      id: "response-01",
      message: "Thanks for texting Bob's Burgers. We are closed right now and will reply when we open at 8 AM.",
      firstText: false,
      nextStepId: "tag-01",
    },
    { type: "tag", id: "tag-01", tagIds: [TagId(993186)], nextStepId: null },
  ],
});

console.log(flow.id, flow.steps.map((step) => step.id));
```

The first step in `steps` is the start step. Each step's `nextStepId` names the step that runs after it, and `null` ends the flow. You select the step ids. CallRail recommends the step type plus a number, such as `response-01`. CallRail replaces them with generated ids when it saves the flow, so the flow you get back has different ids.

CallRail's wire format names the start step two times. One is `initial_step_id`. The other is an `initial_step` flag, which is `true` on that step and `false` on the other steps. The client sets both from the sequence of the list, so they always agree.

Before it sends a request, the client throws a `TypeError` in these conditions:

- Two steps have the same id.
- A `nextStepId` names a step that is not in the list.

CallRail also needs a unique name for the flow.

Each step type does one thing.

- `schedule` sends the text down the branch whose `times` include the moment the text arrives. Each step needs a `nextStepId`, also a schedule, but CallRail does not document when a schedule uses its own `nextStepId` instead of a branch's. CallRail's example sets it to the first branch's step, and so does this one.
- `sms_response` replies with `message`, which can be up to 1550 characters. A reply of more than 160 characters can arrive as more than one text. `firstText: true` replies only to a person who sends a text to the business for the first time. If the reply is the first text that a lead gets from you, CallRail adds opt-out instructions. It does not add them if the message has STOP, CANCEL, UNSUBSCRIBE, QUIT, or END.
- `tag` applies the tags in `tagIds` to the conversation. The list cannot be empty.
- `forward_message` forwards the text to `destinationNumber`, an E.164 number that can receive texts. HIPAA and white-label accounts cannot use it.
- `no_response` sends nothing. Use it for a branch that sends no reply.

A schedule window is a `day` plus a `startTime` and an `endTime` in 24-hour `HHMM`. The type rejects times such as `"2400"` or `"8:00"`. The start must come before the end, so a window cannot cross midnight. Split it in two, the way the weekday evening and early morning windows above do. Windows cannot overlap within a branch or across branches. `day` is `any_day`, `weekdays`, `weekends`, or a day of the week such as `monday`.

## Update a message flow

`name` renames the flow. `steps` replaces every step, so send the whole list. You can put a step from `get` back into `steps`, but not an `other` step. This package cannot write a step type that it does not know. TypeScript rejects an `other` step in `steps`, so your code must decide what to do with one. This example throws.

```ts
import { MessageFlowId, type MessageFlowStep, type MessageFlowStepInput, type NonEmpty } from "callrail";
import { account } from "./callrail.js";

function withNewReply(step: MessageFlowStep): MessageFlowStepInput {
  if (step.type === "other") {
    throw new Error(`Step ${step.id} is a ${step.wireType} step, which this client cannot send back.`);
  }
  if (step.type === "sms_response") {
    return { ...step, message: "Thanks for texting Bob's Burgers. We reply within one business day." };
  }
  return step;
}

const id = MessageFlowId("MFL1e9075f25b1949928b0db7323d775064");
const flow = await account.messageFlows.get(id);
const [initial, ...rest] = flow.steps;
const steps: NonEmpty<MessageFlowStepInput> = [withNewReply(initial), ...rest.map(withNewReply)];

const updated = await account.messageFlows.update(id, { name: "Business-day replies", steps });

console.log(updated.updatedAt);
```

CallRail's update example sends `POST`, while its endpoint table says `PUT`. The client sends `PUT`.

## Delete a message flow

CallRail refuses to delete a flow that a tracker still uses. Detach it from each tracker in `trackerIds` first. `messageFlow: null` removes the flow and leaves texting on.

```ts
import { MessageFlowId } from "callrail";
import { account } from "./callrail.js";

const id = MessageFlowId("MFL3e7a12c9f84e43e79a6a1b55c1c3405b");
const flow = await account.messageFlows.get(id);

for (const trackerId of flow.trackerIds) {
  const tracker = await account.trackers.get(trackerId);
  if (tracker.type === "session") {
    await account.trackers.updateSession(tracker.id, { smsEnabled: true, messageFlow: null });
  } else {
    await account.trackers.updateSource(tracker.id, { smsEnabled: true, messageFlow: null });
  }
}

await account.messageFlows.delete(id);
```
