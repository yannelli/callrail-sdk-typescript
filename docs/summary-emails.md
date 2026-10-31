# Summary emails

A summary email is a regular report of recent calls, sent to a user or to an email address. It goes out daily, weekly, monthly, or at any mix of those. Daily emails arrive every morning, weekly emails every Monday, and monthly emails on the first of the month. Each subscription covers one company, or every company the user can see.

Only administrators can manage summary emails for other users. A key that belongs to anyone else sees and changes only its owner's subscriptions.

## List summary emails

```ts
import { CompanyId } from "@yannelli/callrail";
import { account } from "./callrail.js";

const page = await account.summaryEmails.list({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  frequency: ["weekly", "monthly"],
});

for (const email of page.items) {
  const to = email.recipient.type === "user" ? email.recipient.name : email.recipient.email;
  console.log(to, email.scope.name, email.frequency, email.sections);
}
```

Without `companyId`, the list holds the subscriptions that cover the whole account. `frequency` keeps the subscriptions sent at the frequencies you list. `userId` narrows the list to one user, and `email` narrows it to one email-only recipient. CallRail's list table swaps the descriptions of `user_id` and `email`, and the client sends each one by its name.

CallRail documents the list route without the `.json` suffix that every other summary email route has, and the client calls it that way.

## Create a summary email

```ts
import { CompanyId, UserId } from "@yannelli/callrail";
import { account } from "./callrail.js";

const forBob = await account.summaryEmails.create({
  recipient: { userId: UserId("USR8154748ae6bd4e278a7cddd38a662f4f") },
  frequency: ["daily", "weekly"],
  sections: { summaryStatistics: true, topSources: true, topKeywords: false, callLog: true },
  leadStatus: "Lead",
});

const forAccounting = await account.summaryEmails.create({
  recipient: { email: "accounting@bobsburgers.example" },
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  frequency: ["monthly"],
  sections: { summaryStatistics: true },
});

console.log(forBob.scope, forAccounting.scope);
```

- A user recipient without `companyId` gets one email that covers every company they can see. Add `companyId` to cover one company.
- An email-only recipient must name a company, so the type needs `companyId` for this recipient.
- `frequency` lists one or more of `daily`, `weekly`, and `monthly`.
- `sections` picks the parts of the report. The keys are `summaryStatistics`, `topSources`, `topKeywords`, and `callLog`, and you pass at least one.
- `leadStatus` filters the report by lead status. It takes CallRail's labels as written, which are `Lead`, `Not a Lead`, `Not Scored`, and `All`.

## Get a summary email

```ts
import { SummaryEmailId } from "@yannelli/callrail";
import { account } from "./callrail.js";

const email = await account.summaryEmails.get(SummaryEmailId("CSS8154748ae6bd4e278a7cddd38a662f4f"));

if (email.scope.type === "Company") {
  console.log("Covers the company", email.scope.name);
} else {
  console.log("Covers every company in", email.scope.name);
}

console.log(email.frequency, email.leadStatus);
```

`scope` names the company or the account that the email covers. Checking `scope.type` narrows `scope.id` to a `CompanyId` or an `AccountId`. `recipient` is `{ type: "user", userId, name, email }` or `{ type: "email", email }`. CallRail's single-record tables type `frequency` as a string while its examples send an array, so the client always gives you an array.

## Update a summary email

```ts
import { SummaryEmailId } from "@yannelli/callrail";
import { account } from "./callrail.js";

const email = await account.summaryEmails.update(SummaryEmailId("CSS8154748ae6bd4e278a7cddd38a662f4f"), {
  sections: { summaryStatistics: true, topSources: true, topKeywords: true, callLog: false },
  frequency: ["weekly"],
});

console.log(email.frequency);
```

CallRail needs `sections` in each update, so the type needs it too. `frequency` replaces the subscribed set, so `["weekly"]` stops the daily and monthly emails. Leave it out to keep the current frequencies. `leadStatus` changes the lead status filter of the report. The recipient and the scope cannot change. To move a subscription, delete it and create a new one.

## Delete a summary email

```ts
import { SummaryEmailId } from "@yannelli/callrail";
import { account } from "./callrail.js";

await account.summaryEmails.delete(SummaryEmailId("CSS8154748ae6bd4e278a7cddd38a662f4f"));
```

When you delete a subscription, CallRail sends no more emails for it. CallRail answers with a `forbidden` problem when the user who owns the API key cannot access the subscription.
