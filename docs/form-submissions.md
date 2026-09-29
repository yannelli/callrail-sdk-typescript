# Form submissions

A form submission is one web form that a visitor filled in on a site that runs CallRail's tracking script, or one that you send to CallRail yourself. CallRail attributes it to a marketing source, links it to a lead, and scores it like a call.

## List form submissions

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const page = await account.formSubmissions.list({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  dateRange: "last_30_days",
  leadStatus: "not_scored",
  sort: { by: "submittedAt", order: "desc" },
  fields: ["formName", "leadStatus", "tags"],
});

for (const submission of page.items) {
  console.log(submission.submittedAt, submission.formName, submission.customerEmail, submission.formData);
}
```

`calls.list` and this list share most filters. `leadStatus` is `good_lead`, `not_a_lead`, or `not_scored`, and `tags` matches submissions that carry any of the names. `personLead: true` returns only submissions that are linked to a lead. Sort by `submittedAt` or `formUrl`.

`formData` holds the submitted fields, keyed by the form's own field names. `personId` is `null` when CallRail could not link the submission to a lead. `fields` can add `companyName`, `leadStatus`, `value`, `note`, `tags`, `utmSource`, `utmMedium`, `utmCampaign`, `formName`, `timelineUrl`, and `milestones`.

## Send a form submission

Use `formSubmissions.create` for forms that the tracking script cannot capture, such as a form your server handles. CallRail reads phone numbers out of the values to find or create the lead.

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const submission = await account.formSubmissions.create({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  formUrl: "https://example.com/contact",
  formData: { name: "Linda Belcher", phone: "404-555-6789", message: "Do you cater parties?" },
  referrer: "google_paid",
  referringUrl: "https://www.google.com/",
  landingPageUrl: "https://example.com/?utm_source=google&utm_medium=cpc",
});

console.log(submission.id, submission.personId);
```

CallRail attributes the submission from one of two sources. Pass `sessionId`, the visitor's session id from the tracking script, or pass all three of `referrer`, `referringUrl`, and `landingPageUrl`. You may pass both, and the type rejects a submission with neither.

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

export async function forward(sessionId: string, fields: Record<string, string>): Promise<void> {
  await account.formSubmissions.create({
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
    formUrl: "https://example.com/quote",
    formData: fields,
    sessionId,
  });
}
```

`create` resolves the submission before CallRail attributes it, so the result holds only the fields you sent plus `id`, `personId`, `submittedAt`, and `firstForm`. List the submission later to read its source and lead status.

## Update a form submission

```ts
import { FormSubmissionId } from "callrail";
import { account } from "./callrail.js";

const submission = await account.formSubmissions.update(FormSubmissionId("FOR8154748ae6bd4e278a7cddd38a662f4f"), {
  note: "Booked a tasting for Friday.",
  tags: { add: ["Catering"] },
  value: 300,
  leadStatus: "good_lead",
});

console.log(submission.id);
```

Keys you leave out stay as they are, and `null` clears `note`, `value`, and `leadStatus`. `tags`, `value`, and `leadStatus` work as they do for [calls](calls.md). Setting `good_lead` on a submission whose status is `previously_marked_good_lead` returns a 400.

## Stop capturing a field

`formSubmissions.ignoreFields` stops CallRail from capturing the named fields, such as a credit card number, and removes them from past submissions in a background job. Pass company ids, or `"all"` for every company in the account.

```ts
import { account } from "./callrail.js";

await account.formSubmissions.ignoreFields({ companies: "all", fieldNames: ["card_number", "ssn"] });
```

The method resolves when CallRail accepts the request, before the background job finishes.

## Summarize form submissions

`formSubmissions.summary` counts submissions over a date range. Add `groupBy` to break the totals down by `source`, `keywords`, `campaign`, `referrer`, `landing_page`, or `form_name`. Across the whole account, you can also group by `company`, which cannot combine with `companyId`.

```ts
import { account } from "./callrail.js";

const summary = await account.formSubmissions.summary({
  dateRange: "this_month",
  groupBy: "form_name",
  fields: ["firstForms", "leads"],
});

for (const group of summary.groups) {
  console.log(group.key, group.totalForms, group.firstForms, group.leads);
}
```

`totalForms` is always included, and `fields` adds `firstForms` and `leads`. Narrow the count with `tags`, `leadStatus`, `formUrl`, or `customFormIds`.
