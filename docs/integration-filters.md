# Integration filters

An integration filter limits which calls an [integration](integrations.md) receives. Its rules add up, so a filter for first-time calls longer than 30 seconds passes only calls that match both. Each integration has at most one filter. A company can also have a default filter, which covers every integration without a filter of its own.

CallRail's routes call filters `integration_triggers`. The client uses the product name.

## List filters

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const page = await account.integrationFilters.list({ companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f") });

for (const filter of page.items) {
  console.log(filter.id, filter.integration?.type, filter.callType, filter.minDuration, filter.trackerIds);
}
```

CallRail requires `companyId`, so the type does too. Each filter carries a short `integration` with the integration's `id` and `type`. The default filter has `integrationId: null`, and its integration type reads `All (Default Integration Trigger)`. A rule set to `null` is not in use, so a `callType` of `null` passes every type of call.

## Create a filter

```ts
import { CompanyId, IntegrationId, TrackerId } from "callrail";
import { account } from "./callrail.js";

const filter = await account.integrationFilters.create({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  integrationId: IntegrationId(4321),
  trackerIds: [TrackerId("TRK8154748ae6bd4e278a7cddd38a662f4f")],
  callType: "first_call",
  minDuration: 30,
  leadStatus: "good_lead",
});

console.log(filter.id, filter.integrationId);
```

- `trackerIds` passes only calls to those trackers.
- `callType` is `first_call`, `vm` for voicemails, `missed_and_vm` for missed calls and voicemails, or `null` for every call.
- `minDuration` and `maxDuration` are in seconds.
- `leadStatus` is `good_lead` or `not_a_lead`.

The integration must exist and be active. CallRail answers with a 400 when the integration already has a filter, and with an error when its type cannot be filtered.

CallRail's tables type `lead_status` as an integer while listing `good_lead` and `not_a_lead` as its values. The client sends the string it is given, and reads whichever CallRail returns, so `filter.leadStatus` is `string | number | null`.

## Get a filter

```ts
import { IntegrationFilterId } from "callrail";
import { account } from "./callrail.js";

const filter = await account.integrationFilters.get(IntegrationFilterId(88));

console.log(filter.integration, filter.callType, filter.leadStatus);
```

## Update a filter

```ts
import { IntegrationFilterId } from "callrail";
import { account } from "./callrail.js";

const filter = await account.integrationFilters.update(IntegrationFilterId(88), {
  callType: null,
  maxDuration: 600,
});

console.log(filter.callType, filter.maxDuration);
```

Keys you leave out stay as they are, and `null` turns a rule off. The integration a filter belongs to cannot change. CallRail's update table types `min_duration` and `max_duration` as strings, while its other tables type them as integers. The client sends numbers.

## Delete a filter

```ts
import { IntegrationFilterId } from "callrail";
import { account } from "./callrail.js";

await account.integrationFilters.delete(IntegrationFilterId(88));
```

The integration keeps running without its own filter. CallRail's overview says the company's default filter, when there is one, covers integrations that have no filter of their own.
