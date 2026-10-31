# Outbound caller ids

When you place an outbound call through CallRail, the customer sees one of your tracking numbers. The customer can also see a different number that you own, such as a cell phone. CallRail shows a different number only after you prove that you own it. An outbound caller id is that number and its verification record. [Place an outbound call](calls.md#place-an-outbound-call) shows how to use it.

## List caller ids

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const page = await account.callerIds.list({ companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f") });

for (const callerId of page.items) {
  console.log(callerId.id, callerId.name, callerId.phoneNumber, callerId.verified);
}
```

CallRail needs `companyId`, so the type needs it too. CallRail documents `phoneNumber` in E.164 format, but its examples also show digits without a `+`, such as `19042223344`. The client does not change the value. `verified` stays `false` until a person completes the verification call.

## Verify a number

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const callerId = await account.callerIds.create({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  phoneNumber: "+14047704070",
  name: "Bob's cell",
});

console.log(`Answer the call to ${callerId.phoneNumber} and enter ${callerId.validationCode} on the keypad.`);
```

A new caller id starts the verification. After `create` succeeds, CallRail calls the number. The person who answers enters `validationCode` on the keypad of the phone. Show your user the code as soon as `create` returns. If nobody answers, call `create` again to start over.

## Read the verification status

```ts
import { CallerIdId } from "callrail";
import { account } from "./callrail.js";

const callerId = await account.callerIds.get(CallerIdId(15));

if (callerId.verified) {
  console.log(`${callerId.name} can appear on outbound calls.`);
} else {
  console.log(`${callerId.name} still needs its verification call.`);
}
```

Read the caller id again after the verification call to see if it succeeded.

## Delete a caller id

```ts
import { CallerIdId } from "callrail";
import { account } from "./callrail.js";

await account.callerIds.delete(CallerIdId(15));
```

`delete` removes the record. To use the number again, call `create` again and complete a new verification call.

## Handle a missing company id

CallRail's field tables list `company_id` on every caller id, but its examples leave it out. The client obeys the tables, so `companyId` is always set on a caller id that you read. If CallRail sends a caller id without it, the request fails with a `CallRailError`. For `get` and `create`, the problem is `{ kind: "unexpected_response", reason: "decode", path: "$.company_id" }`, with the status. For `list`, the path also has the index of the caller id, such as `$.caller_ids[0].company_id`. [Errors and rate limits](errors-and-rate-limits.md) tells you how to handle the error.
