# Leads

A lead is a person who called, texted, chatted, or filled in a form. CallRail links every interaction from the same person to one lead, and the lead's timeline lists them in order. Records elsewhere call the same id a person id, such as `call.personId`.

## List leads

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const page = await account.leads.list({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  sort: { by: "createdAt", order: "desc" },
});

for (const lead of page.items) {
  console.log(lead.id, lead.name, lead.phone, lead.email, lead.createdAt);
}
```

Leads return every field unless you narrow them. Pass `fields` to keep only the fields you name, and the client adds `id`. The result type narrows too, so code that reads a field you did not name does not compile.

```ts
import { account } from "./callrail.js";

for await (const lead of account.leads.list({ fields: ["email"], sort: { by: "email" } })) {
  if (lead.email) console.log(lead.id, lead.email);
}
```

The fields are `name`, `phone`, `email`, `createdAt`, `companyId`, and `companyName`. `phone` is in E.164 format. Sort by `createdAt`, `name`, or `email`. Without `sort`, CallRail returns the newest leads first.

## Read a lead's timeline

`leads.timeline` returns a summary of the lead and the first page of its events.

```ts
import { PersonId } from "callrail";
import { account } from "./callrail.js";

const { lead, events } = await account.leads.timeline(PersonId("PER8154748ae6bd4e278a7cddd38a662f4f"));

console.log(`${lead.customerName} has ${lead.totalInteractions} interactions, first from ${lead.firstTouch?.source}`);
for await (const event of events) {
  switch (event.type) {
    case "call":
      console.log(event.eventDate, "Call", event.direction, event.duration);
      break;
    case "form_submission":
      console.log(event.eventDate, "Form", event.formName, event.formFields);
      break;
    case "sms":
      console.log(event.eventDate, "Text", event.messageContent);
      break;
    case "chat":
      console.log(event.eventDate, "Chat", event.chatSubject);
      break;
    case "milestone":
      console.log(event.eventDate, "Milestone", event.milestoneType);
      break;
    case "other":
      console.log(event.eventDate, "Unknown event", event.wireType, event.raw);
      break;
  }
}
```

Each event has an `id`, an `eventDate`, and a `type`. If the client does not know the type of an event, the event arrives as `other`. Then `wireType` holds the type name from CallRail, and `raw` holds the JSON of the event. Thus a new kind of event never breaks your loop.

The summary holds four touchpoints, each with a source and a medium. They are `firstTouch`, `lastTouch`, `leadCreation` for the time the person became a lead, and `leadQualification` for the time the lead qualified. CallRail names the lead's creation time `lead_creation_time`. The client reads it into `lead.leadCreation.createdAt`, like the other touchpoints.

The summary also holds the tags of the lead, the `convertAssist` answers, the attribution fields, and `clickId`. `clickId` maps click ids, such as `gclid` and `fbclid`, to their values. Timeline tags have string ids, such as `TAG123`, but tag records have integer ids. Thus the `id` of a timeline tag is a plain `string`.
