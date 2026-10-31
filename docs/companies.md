# Companies

A company is one business inside an account. An agency account usually holds one company per client. Trackers, calls, texts, and form submissions each belong to a company, and many list methods accept a `companyId` filter.

## List companies

```ts
import { account } from "./callrail.js";

const page = await account.companies.list({ status: "active", sort: { by: "name" }, fields: ["verifiedCallerIds"] });

for (const company of page.items) {
  console.log(company.id, company.name, company.timeZone, company.verifiedCallerIds?.length ?? 0);
}
```

`status` is `active` or `disabled`. `search` matches one term against the company name. `fields` can add `verifiedCallerIds`, which lists the outbound caller ids of the company that completed the verification call.

## Get one company

```ts
import { CompanyId } from "@yannelli/callrail";
import { account } from "./callrail.js";

const company = await account.companies.get(CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"));

console.log(company.name, company.status, company.scriptUrl, company.swapCookieDuration);
```

`scriptUrl` is the tracking script to install on the company's website. `swapCookieDuration` joins CallRail's `swap_cookie_duration` and `swap_cookie_duration_unit` into one `{ value, unit }` object. It is `null` when one of the two is missing, because one has no meaning without the other.

CallRail sends `null` for `swapPpcOverride` until the override is first set, and always sends `null` for the deprecated `swapExcludeJquery`. The client reads both as `false`.

## Create a company

```ts
import { account } from "./callrail.js";

const company = await account.companies.create({ name: "Bob's Burgers", timeZone: "America/New_York" });

console.log(company.id, company.scriptUrl);
```

Without `timeZone`, the company uses the account's time zone. CallRail's example response for this endpoint has no `form_capture` field, so the client reads a missing `formCapture` as `false`.

## Update a company

```ts
import { CompanyId } from "@yannelli/callrail";
import { account } from "./callrail.js";

const company = await account.companies.update(CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"), {
  name: "Bob's Burgers and Fries",
  callscoreEnabled: true,
  callscribeEnabled: true,
  swapCookieDuration: { value: 30, unit: "days" },
  swapLandingOverride: null,
  externalFormCapture: true,
});

console.log(company.name, company.swapCookieDuration);
```

Keys you leave out stay as they are. `callscribeEnabled` turns on transcripts and call highlights. `swapLandingOverride` names a landing page parameter that overrides a visitor's original source, and `null` clears it. `externalFormCapture` turns CallRail's external form capture feature on or off. `keywordSpottingEnabled` is still part of the record and the update input, but CallRail documents it as deprecated with no effect.

## Update many companies at once

`companies.bulkUpdate` turns external form capture on or off for a list of companies, or for every company in the account with `"all"`. It resolves `{ updatedRecords }`, the number of companies that CallRail updated.

```ts
import { account } from "./callrail.js";

const { updatedRecords } = await account.companies.bulkUpdate({ companies: "all", externalFormCapture: true });

console.log(`${updatedRecords} companies updated`);
```

## Disable a company

`companies.disable` is CallRail's `DELETE`. It deactivates the company, disables its tracking numbers, and turns off its tracking script. The record stays, with `status` set to `disabled`.

```ts
import { CompanyId } from "@yannelli/callrail";
import { account } from "./callrail.js";

await account.companies.disable(CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"));
```

An account must keep at least one active company, so CallRail refuses to disable the last one. The error message says `You must have at least one active company.`
