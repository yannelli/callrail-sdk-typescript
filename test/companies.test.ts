import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CompanyId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

test("get reads null swap flags as false and joins the cookie duration with its unit", async () => {
  const fetch = fakeFetch({
    json: {
      id: "COM8154748ae6bd4e278a7cddd38a662f4f",
      name: "Widget Shop",
      status: "active",
      time_zone: "America/New_York",
      created_at: "2016-06-06T07:06:01.000Z",
      disabled_at: null,
      dni_active: true,
      script_url: "//cdn.callrail.com/companies/183570817/5706dbe6dc972c634a65/12/swap.js",
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
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const company = await account.companies.get(CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"));

  assert.deepEqual(company, {
    id: "COM8154748ae6bd4e278a7cddd38a662f4f",
    name: "Widget Shop",
    status: "active",
    timeZone: "America/New_York",
    createdAt: "2016-06-06T07:06:01.000Z",
    disabledAt: null,
    dniActive: true,
    scriptUrl: "//cdn.callrail.com/companies/183570817/5706dbe6dc972c634a65/12/swap.js",
    callscoreEnabled: false,
    leadScoringEnabled: true,
    swapExcludeJquery: false,
    swapPpcOverride: false,
    swapLandingOverride: null,
    swapCookieDuration: { value: 6, unit: "months" },
    callscribeEnabled: false,
    keywordSpottingEnabled: false,
    formCapture: true,
  });
});

test("create sends the name and time zone and reads the documented response that has no form_capture", async () => {
  const fetch = fakeFetch({
    status: 201,
    json: {
      id: "COM8154748ae6bd4e278a7cddd38a662f4f",
      name: "Widget Shop",
      status: "active",
      time_zone: "America/New_York",
      created_at: "2017-01-26T22:58:04.184Z",
      disabled_at: null,
      dni_active: null,
      script_url: "//cdn.callrail.com/companies/279054151/a74c824140d67442debd/12/swap.js",
      callscribe_enabled: false,
      lead_scoring_enabled: false,
      swap_exclude_jquery: null,
      swap_ppc_override: null,
      swap_landing_override: null,
      swap_cookie_duration: 6,
      swap_cookie_duration_unit: "months",
      callscore_enabled: false,
      keyword_spotting_enabled: false,
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const company = await account.companies.create({ name: "Widget Shop", timeZone: "America/New_York" });

  assert.deepEqual(fetch.requests[0]?.body, { kind: "json", value: { name: "Widget Shop", time_zone: "America/New_York" } });
  assert.deepEqual([company.formCapture, company.dniActive, company.swapCookieDuration], [false, null, { value: 6, unit: "months" }]);
});

test("update splits the cookie duration into two keys and bulkUpdate spells every company as all", async () => {
  const fetch = fakeFetch(
    {
      json: {
        id: "COM1",
        name: "Widget Shop",
        status: "active",
        time_zone: "America/Denver",
        created_at: "2016-06-06T07:06:01.000Z",
        disabled_at: null,
        dni_active: true,
        script_url: null,
        callscore_enabled: false,
        lead_scoring_enabled: true,
        swap_exclude_jquery: null,
        swap_ppc_override: true,
        swap_landing_override: null,
        swap_cookie_duration: 30,
        swap_cookie_duration_unit: "days",
        callscribe_enabled: false,
        keyword_spotting_enabled: false,
        form_capture: true,
      },
    },
    { json: { updated_records: 2 } },
  );
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const company = await account.companies.update(CompanyId("COM1"), {
    swapCookieDuration: { value: 30, unit: "days" },
    swapLandingOverride: null,
    externalFormCapture: true,
  });
  const result = await account.companies.bulkUpdate({ companies: "all", externalFormCapture: false });

  assert.deepEqual(
    fetch.requests.map((request) => [request.method, request.path, request.body]),
    [
      [
        "PUT",
        "/v3/a/ACC1/companies/COM1.json",
        {
          kind: "json",
          value: {
            swap_landing_override: null,
            swap_cookie_duration: 30,
            swap_cookie_duration_unit: "days",
            external_form_capture: true,
          },
        },
      ],
      ["POST", "/v3/a/ACC1/companies/bulk_update.json", { kind: "json", value: { company_ids: ["all"], external_form_capture: false } }],
    ],
  );
  assert.deepEqual([company.swapPpcOverride, company.swapCookieDuration], [true, { value: 30, unit: "days" }]);
  assert.deepEqual(result, { updatedRecords: 2 });
});
