# SMS threads

An SMS thread is the texting history between one customer and a company, with the notes, tags, value, and lead qualification your team adds to it. It covers the same texts as [Text messages](text-messages.md). Use threads when you manage the conversation as a record and text messages when you read or send texts.

## List threads

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const page = await account.smsThreads.list({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  dateRange: "last_30_days",
  search: "Quote",
});

for (const thread of page.items) {
  console.log(thread.formattedCustomerName, thread.lastMessageAt, thread.tags, thread.leadQualification);
}
```

`search` matches one term against the customer's phone number, the customer's name, and tag names. CallRail leaves `lastMessageAt` and the formatted names and numbers out of a list unless they are requested, and the client always requests them, so a thread from `list` has the same fields as a thread from `get`.

## Get a thread and its messages

```ts
import { SmsThreadId } from "callrail";
import { account } from "./callrail.js";

const { thread, messages } = await account.smsThreads.get(SmsThreadId("KkMhr"), { perPage: 100, withMessageErrors: true });

console.log(thread.customerPhoneNumber, thread.notes);
for await (const message of messages) {
  if (message.status === "failed") console.log("Not delivered", message.content, message.error);
  else console.log(message.createdAt, message.direction, message.content);
}
```

A page holds at most 100 messages. `messageType` is `sms` or `mms`, lowercased. `message.error` stays `null` unless you pass `withMessageErrors: true`. With it, CallRail adds error details to each message that failed. The docs do not describe their shape, so the type is `JsonValue`.

## Update a thread

```ts
import { SmsThreadId } from "callrail";
import { account } from "./callrail.js";

const thread = await account.smsThreads.update(SmsThreadId("KkMhr"), {
  notes: "Wants a quote for two rooms.",
  tags: { replace: ["Quote requested"] },
  value: 1200,
  leadQualification: "good_lead",
});

console.log(thread.tags, thread.value, thread.leadQualification);
```

Keys you leave out stay as they are, and `null` clears `notes`, `value`, and `leadQualification`. `tags` takes `{ add: [...] }` to keep the existing tags or `{ replace: [...] }` to set the exact list, as [Tags](tags.md) explains. `value` is in dollars, and the client sends it as a two-decimal string. `leadQualification` accepts `good_lead`, `not_a_lead`, or `null`.
