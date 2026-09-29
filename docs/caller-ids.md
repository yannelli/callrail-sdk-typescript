# Outbound caller ids

When you place an outbound call through CallRail, the customer sees either one of your tracking numbers or another number you own, such as a cell phone. CallRail shows another number only after you prove you own it. An outbound caller id is that number and its verification. [Place an outbound call](calls.md#place-an-outbound-call) shows how to use it.

## List caller ids

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const page = await account.callerIds.list({ companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f") });

for (const callerId of page.items) {
  console.log(callerId.id, callerId.name, callerId.phoneNumber, callerId.verified);
}
```

CallRail requires `companyId`, so the type does too. `phoneNumber` is in E.164 format. `verified` stays `false` until someone completes the verification call.

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

Creating a caller id starts the verification. After `create` succeeds, CallRail calls the number, and whoever answers enters `validationCode` on the phone's keypad. Show your user the code as soon as `create` returns. If nobody answers, call `create` again to start over.

## Check whether a number is verified

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

Read the caller id again after the verification call to see whether it succeeded.

## Delete a caller id

```ts
import { CallerIdId } from "callrail";
import { account } from "./callrail.js";

await account.callerIds.delete(CallerIdId(15));
```

`delete` removes the record. Using the number again takes a new `create` and a new verification call.

## Handle a missing company id

CallRail's field tables list `company_id` on every caller id, but its examples leave it out. The client follows the tables, so `companyId` is always set on a caller id you read. If CallRail sends one without it, the request fails with a `CallRailError` whose problem is `{ kind: "unexpected_response", reason: "decode", path: "$.company_id" }`, plus the status. [Errors and rate limits](errors-and-rate-limits.md) covers handling it.
