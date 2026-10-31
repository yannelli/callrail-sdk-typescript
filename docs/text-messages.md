# Text messages

The text messages resource groups texts into conversations, one for each customer. Use it to read conversations and to send a text. [SMS threads](sms-threads.md) are a second view of the same texts, with notes, tags, value, and lead qualification.

## List conversations

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const page = await account.textMessages.list({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  dateRange: "last_7_days",
  fields: ["leadStatus", "source"],
});

for (const conversation of page.items) {
  console.log(conversation.formattedCustomerPhoneNumber, conversation.lastMessageAt, conversation.source);
  for (const message of conversation.recentMessages) {
    console.log(`  ${message.direction}: ${message.content}`);
  }
}
```

Each conversation in the list carries `recentMessages`, which holds up to two of its latest messages. `search` matches one term against the phone number and the name of the customer. `fields` can add `leadStatus` and `source`.

## Read a conversation's lead status

CallRail documents the lead status of a text conversation in two places, and the two tables disagree. The REST table lists only `previously_marked_good_lead` and `null`. The webhook tables for received and sent texts list four values, `good_lead`, `not_a_lead`, `previously_marked_good_lead`, and `null`.

The client gives `leadStatus` the type `LeadStatus | null`, which is the same type that calls use. This type covers all four documented values. It also decodes a status that neither table lists, so your code works with the live API if either table is correct. Handle each documented value.

```ts
import type { LeadStatus } from "callrail";
import { account } from "./callrail.js";

function label(status: LeadStatus | null): string {
  switch (status) {
    case "good_lead":
    case "previously_marked_good_lead":
      return "Lead";
    case "not_a_lead":
      return "Not a lead";
    case null:
      return "Not scored";
    default:
      return status;
  }
}

for await (const conversation of account.textMessages.list({ fields: ["leadStatus"] })) {
  console.log(conversation.customerPhoneNumber, label(conversation.leadStatus));
}
```

To change the lead qualification of a conversation, use `smsThreads.update`, which [SMS threads](sms-threads.md) covers.

## Get a conversation and its messages

```ts
import { ConversationId } from "callrail";
import { account } from "./callrail.js";

const { conversation, messages } = await account.textMessages.get(ConversationId("KkMhr"), { perPage: 50 });

console.log(conversation.customerName, conversation.currentTrackingNumber);
for await (const message of messages) {
  console.log(message.createdAt, message.direction, message.status, message.content);
}
```

`messages` is a page, and `for await` walks every page of them. `type` is `sms` or `mms`. CallRail's examples use both cases, and the client lowercases the value. `user` names the person who sent an outbound message. An inbound message can also have a `user`, so read `direction` to find the direction of a message.

## Send a text

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const conversation = await account.textMessages.send({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  customerPhoneNumber: "4045556789",
  trackingNumber: "7705551234",
  content: "Your order is ready for pickup.",
});

console.log(conversation.id, conversation.recentMessages.length);
```

`customerPhoneNumber` is a 10-digit US or Canadian number. `trackingNumber` is the tracking number the text comes from. You can leave it out only when a conversation with this customer already exists.

CallRail accepts a maximum of 140 characters in `content`. The client does not check the length. The first time you text a customer, CallRail adds opt-out instructions if your message has none. Identify your business in the message. Also include an opt-out keyword, such as STOP.

Each send draws from the text budget of 150 per hour and 1,000 per day. The client never retries a send, because a retry after a lost response would text the customer twice.

## Attach an image

To attach media, pass `media` with either a public URL or the file's bytes. CallRail rejects a message that has both, and the type does not let you write one.

```ts
import { readFile } from "node:fs/promises";
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const companyId = CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f");

await account.textMessages.send({
  companyId,
  customerPhoneNumber: "4045556789",
  content: "Here is this week's menu.",
  media: { url: "https://example.com/menu.png" },
});

await account.textMessages.send({
  companyId,
  customerPhoneNumber: "4045556789",
  content: "Show this coupon at the counter.",
  media: { file: await readFile("coupon.jpg"), filename: "coupon.jpg", contentType: "image/jpeg" },
});
```

With `file`, the client sends the message as `multipart/form-data`. `file` takes a `Blob` or a `Uint8Array`, and a Node.js `Buffer` is a `Uint8Array`.

## Download media

The links in `mediaUrls` expire soon after CallRail returns them. Download the media right away with `textMessages.downloadMedia`, which sends your API key and resolves a `Blob`. Store the file, not the link.

```ts
import { writeFile } from "node:fs/promises";
import { ConversationId } from "callrail";
import { account } from "./callrail.js";

const { messages } = await account.textMessages.get(ConversationId("KkMhr"));

for (const message of messages.items) {
  for (const [index, url] of message.mediaUrls.entries()) {
    const media = await account.textMessages.downloadMedia(url);
    await writeFile(`message-${message.id}-${index}`, new Uint8Array(await media.arrayBuffer()));
  }
}
```

`downloadMedia` refuses a link whose origin differs from the client's `baseUrl`, so your API key never goes to another host.
