import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CompanyId, IntegrationId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

test("list reads Webhooks config as URLs keyed by event and every OAuth type as other with its raw config", async () => {
  const fetch = fakeFetch({
    json: {
      page: 1,
      per_page: 100,
      total_pages: 1,
      total_records: 3,
      integrations: [
        { id: 5, config: { api_key: "12345" }, state: "disabled", type: "GoogleAnalytics" },
        { id: 10, config: { api_key: "12345" }, state: "active", type: "Slack" },
        { id: 4, config: { pre_call_webhook: ["http://example.com/webhook.php"] }, state: "active", type: "Webhooks" },
      ],
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const page = await account.integrations.list({ companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f") });

  assert.equal(fetch.requests[0]?.path, "/v3/a/ACC1/integrations.json");
  assert.deepEqual(fetch.requests[0]?.query, { company_id: "COM8154748ae6bd4e278a7cddd38a662f4f" });
  assert.deepEqual(page.items, [
    { id: 5, type: "other", wireType: "GoogleAnalytics", state: "disabled", config: { api_key: "12345" } },
    { id: 10, type: "other", wireType: "Slack", state: "active", config: { api_key: "12345" } },
    { id: 4, type: "Webhooks", state: "active", webhooks: { pre_call: ["http://example.com/webhook.php"] } },
  ]);
});

test("create sends each URL list under its webhook config key and returns the signing key", async () => {
  const fetch = fakeFetch({
    status: 201,
    json: {
      id: 4,
      type: "Webhooks",
      state: "active",
      config: { pre_call_webhook: ["http://example.com/webhook.php"] },
      signing_key: "5f3d3ebe065cd800b8c154347437e958",
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const created = await account.integrations.create({
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
    type: "Webhooks",
    webhooks: { pre_call: ["http://example.com/webhook.php"], post_call: ["https://example.com/post-call"] },
  });

  assert.deepEqual(
    [fetch.requests[0]?.method, fetch.requests[0]?.path, fetch.requests[0]?.body],
    [
      "POST",
      "/v3/a/ACC1/integrations.json",
      {
        kind: "json",
        value: {
          type: "Webhooks",
          company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
          config: {
            pre_call_webhook: ["http://example.com/webhook.php"],
            post_call_webhook: ["https://example.com/post-call"],
          },
        },
      },
    ],
  );
  assert.deepEqual(created, {
    id: 4,
    type: "Webhooks",
    state: "active",
    webhooks: { pre_call: ["http://example.com/webhook.php"] },
    signingKey: "5f3d3ebe065cd800b8c154347437e958",
  });
});

test("update replaces the cookie list and disable is a DELETE that resolves on 204", async () => {
  const fetch = fakeFetch(
    { json: { id: 7, type: "Custom", state: "active", config: { grab_cookies: ["_ga", "mycookie31"] } } },
    { status: 204 },
  );
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const updated = await account.integrations.update(IntegrationId(7), {
    state: "active",
    grabCookies: ["_ga", "mycookie31"],
  });
  await account.integrations.disable(IntegrationId(7));

  assert.deepEqual(
    fetch.requests.map((request) => [request.method, request.path, request.body]),
    [
      [
        "PUT",
        "/v3/a/ACC1/integrations/7.json",
        { kind: "json", value: { state: "active", config: { grab_cookies: ["_ga", "mycookie31"] } } },
      ],
      ["DELETE", "/v3/a/ACC1/integrations/7.json", { kind: "none" }],
    ],
  );
  assert.deepEqual(updated, { id: 7, type: "Custom", state: "active", grabCookies: ["_ga", "mycookie31"] });
});
