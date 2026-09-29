# Integrations

An integration connects a company to another service. Through the API you can create and change two types of integration.

- `Webhooks` posts CallRail events to your URLs. [Webhooks](webhooks.md) covers receiving them.
- `Custom` captures cookies from website visitors and attaches their values to calls.

Every other type, such as `GoogleAnalytics` or `Slack`, needs a login to the other service, so you set it up in the CallRail app. Those integrations arrive here read-only as `{ type: "other", wireType, config }`. A company has at most one integration of each type.

## List integrations

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const page = await account.integrations.list({ companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f") });

for (const integration of page.items) {
  switch (integration.type) {
    case "Webhooks":
      console.log(integration.id, integration.state, integration.webhooks.post_call);
      break;
    case "Custom":
      console.log(integration.id, integration.state, integration.grabCookies);
      break;
    case "other":
      console.log(integration.id, integration.state, integration.wireType, integration.config);
      break;
  }
}
```

CallRail requires `companyId`, so the type does too. `state` is usually `active` or `disabled`. CallRail's tables also list `pending` and `failed`, so `state` is an open string.

## Get an integration and its signing key

```ts
import { IntegrationId } from "callrail";
import { account } from "./callrail.js";

const integration = await account.integrations.get(IntegrationId(4321), { fields: ["signingKey"] });

console.log(integration.type, integration.signingKey);
```

`fields: ["signingKey"]` adds the company's webhook signing key, and `list` accepts the same option. CallRail includes the key only on a `Webhooks` integration, so it is `null` on the others. [Webhooks](webhooks.md#receive-a-webhook) uses it to check that a request came from CallRail.

## Create an integration

```ts
import { CompanyId } from "callrail";
import { account } from "./callrail.js";

const webhooks = await account.integrations.create({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  type: "Webhooks",
  webhooks: {
    post_call: ["https://bobsburgers.example/callrail/post_call"],
    sms_received: ["https://bobsburgers.example/callrail/sms_received"],
  },
});

console.log(webhooks.id, webhooks.signingKey);

const cookies = await account.integrations.create({
  companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  type: "Custom",
  grabCookies: ["_ga", "promo_code"],
});

console.log(cookies.id, cookies.state);
```

`webhooks` maps each event to a list of URLs. The keys are the same event names that `readWebhook` takes, so the URL you register for `post_call` is the route whose handler reads a `post_call` webhook. CallRail documents no config key for `convert_assist_complete`, so the type leaves it out, and you register that URL in the CallRail app.

The response to `create` always carries `signingKey`. Store it with your webhook settings.

`grabCookies` lists the names of the cookies to capture, and it cannot be empty. CallRail reads them from website visitors and returns their values on calls to session trackers, in the `custom` field that `fields: ["custom"]` requests.

## Update an integration

```ts
import { IntegrationId } from "callrail";
import { account } from "./callrail.js";

const integration = await account.integrations.update(IntegrationId(4321), {
  state: "active",
  webhooks: {
    post_call: ["https://bobsburgers.example/callrail/post_call"],
    updated_call: ["https://bobsburgers.example/callrail/updated_call"],
  },
});

console.log(integration.state);
```

`state` turns the integration on or off. The client sends `webhooks` or `grabCookies` as the integration's whole `config`, so include every event you want to keep. CallRail does not document whether it merges a partial config. An integration has only one of the two, and the type accepts one or the other.

## Disable an integration

```ts
import { IntegrationId } from "callrail";
import { account } from "./callrail.js";

await account.integrations.disable(IntegrationId(4321));
```

`disable` is CallRail's `DELETE` for integrations. CallRail describes it as disabling the integration.
