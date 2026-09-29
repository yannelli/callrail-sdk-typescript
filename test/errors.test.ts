import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountId, CallRail, CallRailError, CompanyId, TagId, type Problem } from "../src/index.js";
import { fakeFetch, type FakeReply } from "../src/testing.js";

interface ErrorBodyCase {
  readonly body: string;
  readonly reply: FakeReply;
  readonly message: string;
  readonly problem: Problem;
}

const errorBodies: readonly ErrorBodyCase[] = [
  {
    body: "Ruby hash with =>, as documented for 403",
    reply: { status: 403, text: '{ "error" => "You do not have permission to perform the requested action" }' },
    message: "You do not have permission to perform the requested action",
    problem: { kind: "forbidden", status: 403 },
  },
  {
    body: "Ruby hash with a symbol key, as documented for disabling the last company",
    reply: { status: 400, text: "{ error: 'You must have at least one active company.' }" },
    message: "You must have at least one active company.",
    problem: { kind: "invalid_request", status: 400, fieldErrors: {} },
  },
  {
    body: "JSON error string",
    reply: { status: 403, json: { error: "You do not have permission to perform the requested action" } },
    message: "You do not have permission to perform the requested action",
    problem: { kind: "forbidden", status: 403 },
  },
  {
    body: "plain-text 401",
    reply: { status: 401, text: "HTTP Token: Access denied.\n" },
    message: "HTTP Token: Access denied.",
    problem: { kind: "unauthorized", status: 401 },
  },
  {
    body: "JSON field errors",
    reply: { status: 422, json: { errors: { name: ["has already been taken"] } } },
    message: "name has already been taken",
    problem: { kind: "invalid_request", status: 422, fieldErrors: { name: ["has already been taken"] } },
  },
  {
    body: "HTML error page",
    reply: { status: 500, text: "<html><body>We're sorry, but something went wrong.</body></html>" },
    message: "<html><body>We're sorry, but something went wrong.</body></html>",
    problem: { kind: "server_error", status: 500 },
  },
  {
    body: "empty 503",
    reply: { status: 503, text: "" },
    message: "503 Service Unavailable",
    problem: { kind: "server_error", status: 503 },
  },
];

for (const errorBody of errorBodies) {
  test(`a ${errorBody.body} becomes one message and one problem`, async () => {
    const fetch = fakeFetch(errorBody.reply);
    const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

    await assert.rejects(account.tags.delete(TagId(993186)), (error: unknown) => {
      assert.ok(error instanceof CallRailError);
      assert.equal(error.message, errorBody.message);
      assert.deepEqual(error.problem, errorBody.problem);
      assert.deepEqual(error.request, { method: "DELETE", url: "https://api.callrail.com/v3/a/ACC1/tags/993186.json" });
      return true;
    });
    assert.equal(fetch.requests.length, 1);
  });
}

test("a 429 on send names the SMS budget and is not retried", async () => {
  const fetch = fakeFetch({ status: 429, json: { error: "Rate limit exceeded" } });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  await assert.rejects(
    account.textMessages.send({
      companyId: CompanyId("COM1"),
      customerPhoneNumber: "3035550100",
      trackingNumber: "3035550199",
      content: "Your table is ready.",
    }),
    (error: unknown) => {
      assert.ok(error instanceof CallRailError);
      assert.deepEqual(error.problem, { kind: "rate_limited", status: 429, bucket: "sms_send", retryAfterMs: null });
      return true;
    },
  );
  assert.equal(fetch.requests.length, 1);
});

test("a GET retries a 503, a POST does not", async () => {
  const fetch = fakeFetch(
    { status: 503, text: "" },
    { json: { id: "ACC1", name: "Boost Marketing", outbound_recording_enabled: true, hipaa_account: false } },
    { status: 503, text: "" },
  );
  const callrail = new CallRail({ apiKey: "key-1", fetch, maxRetries: 1 });

  const account = await callrail.accounts.get(AccountId("ACC1"));
  await assert.rejects(callrail.account("ACC1").companies.create({ name: "Acme Plumbing" }), CallRailError);

  assert.deepEqual(account, { id: "ACC1", name: "Boost Marketing", outboundRecordingEnabled: true, hipaaAccount: false });
  assert.deepEqual(
    fetch.requests.map((request) => [request.method, request.path]),
    [
      ["GET", "/v3/a/ACC1.json"],
      ["GET", "/v3/a/ACC1.json"],
      ["POST", "/v3/a/ACC1/companies.json"],
    ],
  );
});
