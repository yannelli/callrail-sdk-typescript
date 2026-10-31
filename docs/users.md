# Users

A user is a person who can sign in to your CallRail account. Each user has one of three roles.

- An `admin` sees every company and every setting, including billing, and can add companies, users, and tracking numbers.
- A `manager` sees only the companies they are assigned. They can manage numbers, forms, and integrations there, and do everything a reporting user can.
- A `reporting` user sees only their companies. They can read calls, texts, and reports, listen to recordings, add notes, and tag and score calls. They cannot change numbers or settings.

Only administrators can create users, delete users, or change which companies another user can see.

## List users

```ts
import { CompanyId } from "@yannelli/callrail";
import { account } from "./callrail.js";

const page = await account.users.list({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  search: "belcher",
  sort: { by: "createdAt", order: "desc" },
});

for (const user of page.items) {
  console.log(user.name, user.email, user.role, user.accepted, user.companies.map((company) => company.name));
}
```

`companyId` limits the list to the users of one company. `search` matches one term against first name, last name, and email. `sort` accepts `email` and `createdAt`. `accepted` is `true` if the user accepted the invitation. Only the list table documents it, so a user from a different method can have `accepted: null`.

## Get a user

```ts
import { UserId } from "@yannelli/callrail";
import { account } from "./callrail.js";

const user = await account.users.get(UserId("USR8154748ae6bd4e278a7cddd38a662f4f"));

console.log(user.name, user.role, user.createdAt);
```

`role` is an open string. CallRail's create and update tables mention a `notification` role, but they do not describe it. Thus the client reads a user with a role that this package does not list without an error.

## Create a user

```ts
import { CompanyId } from "@yannelli/callrail";
import { account } from "./callrail.js";

const manager = await account.users.create({
  firstName: "Linda",
  lastName: "Belcher",
  email: "linda@bobsburgers.example",
  role: "manager",
  companies: [CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f")],
});

const admin = await account.users.create({
  firstName: "Bob",
  lastName: "Belcher",
  email: "bob@bobsburgers.example",
  role: "admin",
});

console.log(manager.id, admin.id);
```

CallRail emails the new user a link to set a password. Only an administrator's API key can create users. A `manager` or `reporting` user needs at least one company in `companies`. An `admin` already sees every company, so the type does not accept `companies` for one.

CallRail's create and update response tables type `first_name` as a number, while its list and get tables type it as a string. The client reads a string.

## Update a user

```ts
import { CompanyId, UserId } from "@yannelli/callrail";
import { account } from "./callrail.js";

const user = await account.users.update(UserId("USR8154748ae6bd4e278a7cddd38a662f4f"), {
  companies: [CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f")],
});

console.log(user.companies);
```

`companies` replaces the user's list, so a company you leave out loses the user. Only an administrator can change it, and only for managers and reporting users. CallRail updates only users who accepted their invitation.

Names and email can change only for the user who owns the API key. CallRail answers a change to anyone else's name or email with an error. A change of email also needs the current password of that user, so the type accepts `email` only together with `currentPassword`.

```ts
import type { UserId } from "@yannelli/callrail";
import { account } from "./callrail.js";

export async function changeMyEmail(me: UserId, email: string, currentPassword: string) {
  return account.users.update(me, { email, currentPassword });
}
```

A password itself can only be reset or changed in the CallRail app.

## Delete a user

```ts
import { UserId } from "@yannelli/callrail";
import { account } from "./callrail.js";

await account.users.delete(UserId("USR8154748ae6bd4e278a7cddd38a662f4f"));
```

Only an administrator's API key can delete users.
