# Testing

`@yannelli/callrail/testing` exports `fakeFetch`, a scripted `fetch` for your tests. Pass it to the client as the `fetch` option. It answers requests with the replies you scripted, in order, and records every request as plain data. Your test then asserts the exact request your code sent and what your code did with the answer, with no network and no API key.

## Test code that calls CallRail

This test covers `ensureTag`, which returns a company's tag by name and creates the tag when it is missing.

```ts
// tags.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CompanyId, type AccountClient, type Tag } from "@yannelli/callrail";
import { fakeFetch } from "@yannelli/callrail/testing";

async function ensureTag(account: AccountClient, companyId: CompanyId, name: string): Promise<Tag> {
  for await (const tag of account.tags.list({ companyId })) {
    if (tag.name === name) return tag;
  }
  return account.tags.create({ name, companyId });
}

test("ensureTag creates the tag when the company does not have it", async () => {
  const fetch = fakeFetch(
    { json: { page: 1, per_page: 100, total_pages: 1, total_records: 0, tags: [] } },
    {
      status: 201,
      json: {
        id: 993186,
        name: "Quote requested",
        tag_level: "company",
        color: "gray1",
        background_color: "green2",
        company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
        status: "enabled",
        created_at: "2026-09-29T10:15:00.000-04:00",
      },
    },
  );
  const account = new CallRail({ apiKey: "test-key", fetch }).account("ACC8154748ae6bd4e278a7cddd38a662f4f");

  const tag = await ensureTag(account, CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"), "Quote requested");

  assert.equal(tag.id, 993186);
  assert.deepEqual(
    fetch.requests.map(({ method, path, query, body }) => ({ method, path, query, body })),
    [
      {
        method: "GET",
        path: "/v3/a/ACC8154748ae6bd4e278a7cddd38a662f4f/tags.json",
        query: { company_id: "COM8154748ae6bd4e278a7cddd38a662f4f" },
        body: { kind: "none" },
      },
      {
        method: "POST",
        path: "/v3/a/ACC8154748ae6bd4e278a7cddd38a662f4f/tags.json",
        query: {},
        body: { kind: "json", value: { name: "Quote requested", company_id: "COM8154748ae6bd4e278a7cddd38a662f4f" } },
      },
    ],
  );
});
```

Run it with `node --test`, as you run your other tests.

## Script the replies

`fakeFetch(...replies)` answers the first request with the first reply, the second request with the second reply, and so on.

- `{ json }` sends a JSON body with a JSON content type.
- `{ text }` sends a body as written, such as an HTML error page or the empty body of a 204.
- `status` sets the status and defaults to 200. `headers` adds response headers, such as `retry-after`.
- `{ networkError: "..." }` makes the request fail as a lost connection does.

If a request comes after the last reply, it fails. The error message gives its method and URL. Replies never match by URL, because a match by URL would hide an incorrect URL.

## Read the recorded requests

`fetch.requests` holds one record per request, in order.

- `method` is the HTTP method, and `url` is the exact URL fetched.
- `path` is the pathname only, such as `/v3/a/ACC8154748ae6bd4e278a7cddd38a662f4f/calls.json`.
- `query` holds the decoded query values. A repeated key collects into an array. A key that ends in `[]`, such as `tags[]`, is always an array, also when it has one value.
- `headers` has lowercased names, so the API key is in `headers.authorization`.
- `body` is `{ kind: "none" }`, `{ kind: "json", value }`, or `{ kind: "multipart", fields }`. A file in a multipart body records its `filename`, `type`, and `size`.

## Test a failure

Script the error response, and assert what your code does with it.

```ts
// notify.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CallRailError, CompanyId, type AccountClient } from "@yannelli/callrail";
import { fakeFetch } from "@yannelli/callrail/testing";

async function notifyCustomer(account: AccountClient, customerPhoneNumber: string): Promise<"sent" | "retry_later"> {
  try {
    await account.textMessages.send({
      companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
      customerPhoneNumber,
      trackingNumber: "4045551234",
      content: "Your order is ready for pickup.",
    });
    return "sent";
  } catch (error) {
    if (error instanceof CallRailError && error.problem.kind === "rate_limited") return "retry_later";
    throw error;
  }
}

test("notifyCustomer asks to retry later when the texting budget is spent", async () => {
  const fetch = fakeFetch({ status: 429, json: { error: "Rate limit exceeded" } });
  const account = new CallRail({ apiKey: "test-key", fetch }).account("ACC8154748ae6bd4e278a7cddd38a662f4f");

  assert.equal(await notifyCustomer(account, "7705550100"), "retry_later");
  assert.equal(fetch.requests.length, 1);
});
```

The client retries a `GET` after a network error, a timeout, or a 500, 502, 503, or 504, with a short random delay between tries. When a test scripts one of those for a `GET`, pass `maxRetries: 0` to the client. Then one reply is enough, and the test does not wait for the retries.

## Test a webhook handler

`signWebhook(body, signingKey)` returns the signature CallRail would send for a body, so a test can build a signed request for any payload. Sign the exact string or bytes that you send as the body.

```ts
// sms-webhook.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { readWebhook, signWebhook, WebhookError } from "@yannelli/callrail/webhooks";

const signingKey = "072e77e426f92738a72fe23c4d1953b4";

async function handleText(request: Request): Promise<Response> {
  try {
    const { message } = readWebhook("sms_received", {
      body: new Uint8Array(await request.arrayBuffer()),
      signature: request.headers.get("Signature"),
      signingKey,
    });
    return Response.json({ from: message.sourceNumber, text: message.content });
  } catch (error) {
    if (error instanceof WebhookError) return new Response(null, { status: 401 });
    throw error;
  }
}

const body = JSON.stringify({
  id: 879204976,
  resource_id: "SCI0c14896tw1b64fb970ab62aaf4fbefd9",
  source_number: "770-555-5555",
  destination_number: "770-123-4567",
  content: "Do you have a table for four?",
  message_type: "sms",
  media_urls: [],
  timestamp: "2026-09-29T15:57:18.826-04:00",
  lead_status: null,
  conversation_id: "crpLH",
  company_resource_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
  person_resource_id: "PER8154748ae6bd4e278a7cddd38a662f4f",
});

test("a signed text reaches the handler", async () => {
  const request = new Request("https://bobsburgers.example/webhooks/callrail/sms_received", {
    method: "POST",
    headers: { Signature: signWebhook(body, signingKey) },
    body,
  });

  const response = await handleText(request);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { from: "770-555-5555", text: "Do you have a table for four?" });
});

test("an unsigned text is refused", async () => {
  const request = new Request("https://bobsburgers.example/webhooks/callrail/sms_received", { method: "POST", body });

  const response = await handleText(request);

  assert.equal(response.status, 401);
});
```
