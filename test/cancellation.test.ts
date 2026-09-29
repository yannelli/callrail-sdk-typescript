import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountId, CallRail, CallRailError, CompanyId, type JsonValue } from "../src/index.js";
import { fakeFetch, type FakeFetch } from "../src/testing.js";

function companyPage(page: number, totalPages: number): JsonValue {
  return {
    page,
    per_page: 1,
    total_pages: totalPages,
    total_records: totalPages,
    companies: [
      {
        id: `COM${page}`,
        name: "Widget Shop",
        status: "active",
        time_zone: "America/New_York",
        created_at: "2016-06-06T07:06:01.000Z",
        disabled_at: null,
        dni_active: true,
        script_url: null,
        callscore_enabled: false,
        lead_scoring_enabled: true,
        swap_exclude_jquery: null,
        swap_ppc_override: null,
        swap_landing_override: null,
        swap_cookie_duration: 6,
        swap_cookie_duration_unit: "months",
        callscribe_enabled: false,
        keyword_spotting_enabled: false,
        form_capture: true,
      },
    ],
  };
}

function hangOnce(fake: FakeFetch): { readonly fetch: (url: string, init: RequestInit) => Promise<Response>; readonly calls: () => number } {
  let calls = 0;
  const fetch = (url: string, init: RequestInit): Promise<Response> => {
    calls += 1;
    if (calls > 1) return fake(url, init);
    return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
  };
  return { fetch, calls: () => calls };
}

test("an already aborted signal rejects with its reason and sends nothing", async () => {
  const fetch = fakeFetch();
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(account.companies.get(CompanyId("COM1"), { signal: controller.signal }), { name: "AbortError" });
  assert.equal(fetch.requests.length, 0);
});

test("aborting while iterating stops the walk with your reason before the next page is fetched", async () => {
  const fetch = fakeFetch({ json: companyPage(1, 3) });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");
  const controller = new AbortController();
  const reason = new Error("the user closed the report");

  const seen: string[] = [];
  await assert.rejects(async () => {
    for await (const company of account.companies.list({ perPage: 1, signal: controller.signal })) {
      seen.push(company.id);
      controller.abort(reason);
    }
  }, reason);

  assert.deepEqual(seen, ["COM1"]);
  assert.equal(fetch.requests.length, 1);
});

test("next() on an offset page and on a relative page uses the signal from the first call", async () => {
  const fetch = fakeFetch(
    { json: companyPage(1, 2) },
    { json: { calls: [], next_page: "https://api.callrail.com/v3/a/ACC1/calls.json?offset=1", has_next_page: true } },
  );
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");
  const controller = new AbortController();

  const companies = await account.companies.list({ perPage: 1, signal: controller.signal });
  const calls = await account.calls.list({ pagination: "relative", signal: controller.signal });
  controller.abort();

  await assert.rejects(companies.next(), { name: "AbortError" });
  await assert.rejects(calls.next(), { name: "AbortError" });
  assert.equal(fetch.requests.length, 2);
});

test("a GET that times out is retried, and a POST that times out is not", async () => {
  const getFake = fakeFetch({ json: { id: "ACC1", name: "Boost Marketing", outbound_recording_enabled: true, hipaa_account: false } });
  const get = hangOnce(getFake);
  const post = hangOnce(fakeFetch());

  const account = await new CallRail({ apiKey: "key-1", fetch: get.fetch, timeoutMs: 20, maxRetries: 1 }).accounts.get(
    AccountId("ACC1"),
  );
  const create = new CallRail({ apiKey: "key-1", fetch: post.fetch, timeoutMs: 20, maxRetries: 1 })
    .account("ACC1")
    .companies.create({ name: "Acme Plumbing" });

  assert.deepEqual(account, { id: "ACC1", name: "Boost Marketing", outboundRecordingEnabled: true, hipaaAccount: false });
  assert.equal(get.calls(), 2);
  await assert.rejects(create, (error: unknown) => {
    assert.ok(error instanceof CallRailError);
    assert.deepEqual(error.problem, { kind: "timeout", timeoutMs: 20 });
    return true;
  });
  assert.equal(post.calls(), 1);
});
