# Tags

A tag is a label your team puts on calls, form submissions, and text conversations to sort them. A tag belongs to one company, or to the account, where every company can use it. Only account administrators can create and edit account-level tags.

This chapter manages the tag records. You put tags on an interaction through that interaction's own `update` method, as [Apply tags to a call, form, or thread](#apply-tags-to-a-call-form-or-thread) shows.

## List tags

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const page = await account.tags.list({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  status: "enabled",
  sort: { by: "name" },
});

for (const tag of page.items) {
  console.log(tag.id, tag.name, tag.tagLevel, tag.color);
}
```

`companyId` returns the tags that belong to one company, and `tagLevel: "account"` returns the account-level tags. CallRail rejects the two together, and so does the type. `status` is `enabled` or `disabled`, and `sort` accepts `name`. `companyId` on an account-level tag is `null`.

## Create a tag

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const quote = await account.tags.create({
  name: "Quote requested",
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  color: "green2",
});

const vip = await account.tags.create({ name: "VIP", level: "account", color: "purple1" });

console.log(quote.id, vip.id);
```

A tag without `level` is a company tag and needs `companyId`. `level: "account"` creates a tag that every company can use, and it takes no `companyId`. `color` is one of the 24 names in CallRail's palette, such as `blue1` or `green4`. Each name sets both the text color and the background color. A tag you read can carry a color outside the palette, so `tag.color` is an open string.

## Rename, recolor, or disable a tag

```ts
import { TagId } from "callrail";
import { account } from "./callrail.js";

const renamed = await account.tags.update(TagId(993186), { name: "Quote sent", color: "blue2" });
const disabled = await account.tags.update(renamed.id, { disabled: true });

console.log(disabled.name, disabled.status);
```

A new name replaces the old one everywhere the tag is applied. `disabled: true` stops anyone from applying the tag to new calls, forms, or texts, and leaves it on the ones that already have it. `disabled: false` makes the tag available again. The tag's `status` reads `enabled` or `disabled`.

CallRail's field table types `disabled` as a string, but the description in the same row says the value is `true` or `false`. The client follows the description and sends a JSON boolean.

## Delete a tag

```ts
import { TagId } from "callrail";
import { account } from "./callrail.js";

await account.tags.delete(TagId(993186));
```

Deleting a tag removes it from every call flow and from every interaction it was on. Disable the tag instead when you want to keep it on past interactions.

## Apply tags to a call, form, or thread

Calls, form submissions, and SMS threads take tags by name in their `update` methods. `tags` is a `TagChange`, which either adds names or replaces the whole list.

```ts
import { CallId, FormSubmissionId, SmsThreadId } from "callrail";
import { account } from "./callrail.js";

await account.calls.update(CallId("CAL8154748ae6bd4e278a7cddd38a662f4f"), { tags: { add: ["Quote requested"] } });
await account.formSubmissions.update(FormSubmissionId("FOR8154748ae6bd4e278a7cddd38a662f4f"), { tags: { replace: ["Spam"] } });
await account.smsThreads.update(SmsThreadId("KkMhr"), { tags: { replace: [] } });
```

- `{ add: [...] }` keeps the existing tags and adds these names. The list cannot be empty, because adding nothing would change nothing.
- `{ replace: [...] }` sets the exact list and removes every other tag. `{ replace: [] }` removes them all.

On calls and form submissions, a name that matches no tag in the company creates a new tag.

CallRail spells the choice as `tags` plus an `append_tags` flag. The flag only changes what `tags` means, so the client has no separate `appendTags` option. It sends `append_tags: true` for `add` and `append_tags: false` for `replace`.
