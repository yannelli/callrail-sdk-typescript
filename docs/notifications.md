# Notifications

A notification alerts someone about new calls, new texts, or both. Each one has a recipient, an optional scope of one company or one tracker, the calls that trigger it, and the channels it uses. The channels are email, push to the mobile app, and desktop alerts in the browser.

## List notifications

```ts
import { UserId } from "callrail";
import { account } from "./callrail.js";

const page = await account.notifications.list({ userId: UserId("USR8154748ae6bd4e278a7cddd38a662f4f"), channel: "email" });

for (const notification of page.items) {
  console.log(notification.name, notification.companyName ?? "every company", notification.callAlerts, notification.channels);
}
```

`userId` lists one user's notifications, and `email` lists the notifications of a recipient who has only an email address. The type accepts one or the other. `channel` keeps the notifications that use `email`, `push`, or `desktop`. CallRail's docs list `user_id` and `email` under a request body. A `GET` sends no body, so the client puts them in the query string, as it does for the other filters.

CallRail spreads a notification's settings across several flags. The client folds `call_enabled` and `alert_type` into `callAlerts`, and folds `send_email`, `send_push`, and `send_desktop` into the `channels` list. `smsAlerts` is `true` if texts cause alerts. `companyId` and `trackerId` are `null` when the notification covers the whole account.

## Create a notification

```ts
import { CompanyId, TrackerId, UserId } from "callrail";
import { account } from "./callrail.js";

const mine = await account.notifications.create({
  callAlerts: "missed_and_vm",
  smsAlerts: true,
  channels: ["push", "desktop"],
});

const forLinda = await account.notifications.create({
  recipient: { userId: UserId("USR8154748ae6bd4e278a7cddd38a662f4f") },
  scope: { companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f") },
  callAlerts: "first_call",
  channels: ["email"],
});

const forFrontDesk = await account.notifications.create({
  recipient: { email: "frontdesk@bobsburgers.example" },
  scope: { trackerId: TrackerId("TRK8154748ae6bd4e278a7cddd38a662f4f") },
  callAlerts: "all",
  smsAlerts: true,
  channels: ["email"],
});

console.log(mine.id, forLinda.id, forFrontDesk.id);
```

- Leave out `recipient` to notify the user who owns the API key. `{ userId }` notifies another user, and `{ email }` notifies an address with no CallRail login.
- `scope` limits the notification to one company or one tracker. Without it, the notification covers the whole account. An email-only recipient needs a scope and can use only the `email` channel, and the type enforces both.
- `callAlerts` picks which calls alert. `all` covers every call, `first_call` covers first-time callers, `missed_and_vm` covers missed calls and voicemails, and `vm_only` covers voicemails. `null` turns call alerts off.
- `smsAlerts: true` alerts on incoming texts.
- `channels` lists where alerts go, and it needs at least one channel.
- `agentId` limits alerts to calls and texts to that agent. It does not make the agent the recipient, so use `recipient` for that.

## Update a notification

```ts
import { NotificationId } from "callrail";
import { account } from "./callrail.js";

const notification = await account.notifications.update(NotificationId(127), {
  callAlerts: null,
  smsAlerts: true,
  channels: ["email", "push"],
});

console.log(notification.callAlerts, notification.channels);
```

Keys you leave out stay as they are. `callAlerts: null` turns call alerts off, and the client sends `call_enabled: false`. CallRail keeps the old `alert_type` on a notification with call alerts off, and the client ignores it, so `callAlerts` reads `null`.

`channels` replaces the whole set. The client always sends all three flags. It sends `true` for the channels that you list and `false` for the other channels. Thus the same update sent two times gives the same result.

The recipient cannot change. To alert someone else, delete the notification and create a new one. CallRail's update table accepts `company_id` and `tracker_id`, but its description says to re-create a notification to change its scope. The client sends `scope` when you pass it, so check `companyId` and `trackerId` in the result. The update table also leaves out `agent_id`, which the client still sends when you pass `agentId`.

## Delete a notification

```ts
import { NotificationId } from "callrail";
import { account } from "./callrail.js";

await account.notifications.delete(NotificationId(127));
```

CallRail answers with a `forbidden` problem when the user who owns the API key does not manage the notification.
