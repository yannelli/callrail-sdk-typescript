import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CompanyId, IntegrationFilterId, IntegrationId, TrackerId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

test("list reads the company default filter, whose integration id is null, and keeps an integer lead_status as sent", async () => {
  const fetch = fakeFetch({
    json: {
      page: 1,
      per_page: 100,
      total_pages: 1,
      total_records: 3,
      integration_criteria: [
        {
          id: 2,
          company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
          integration_id: null,
          tracker_ids: [],
          call_type: null,
          min_duration: null,
          max_duration: null,
          lead_status: 1,
          integration: { id: null, type: "All (Default Integration Trigger)" },
        },
        {
          id: 34,
          company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
          integration_id: 247,
          tracker_ids: ["TRK8154748ae6bd4e278a7cddd38a662f4f"],
          call_type: "first_call",
          min_duration: 3,
          max_duration: null,
          lead_status: null,
          integration: { id: 247, type: "Webhooks" },
        },
      ],
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const page = await account.integrationFilters.list({ companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f") });

  assert.deepEqual(
    [fetch.requests[0]?.path, fetch.requests[0]?.query],
    ["/v3/a/ACC1/integration_triggers.json", { company_id: "COM8154748ae6bd4e278a7cddd38a662f4f" }],
  );
  assert.deepEqual(page.items, [
    {
      id: 2,
      companyId: "COM8154748ae6bd4e278a7cddd38a662f4f",
      integrationId: null,
      trackerIds: [],
      callType: null,
      minDuration: null,
      maxDuration: null,
      leadStatus: 1,
      integration: { id: null, type: "All (Default Integration Trigger)" },
    },
    {
      id: 34,
      companyId: "COM8154748ae6bd4e278a7cddd38a662f4f",
      integrationId: 247,
      trackerIds: ["TRK8154748ae6bd4e278a7cddd38a662f4f"],
      callType: "first_call",
      minDuration: 3,
      maxDuration: null,
      leadStatus: null,
      integration: { id: 247, type: "Webhooks" },
    },
  ]);
});

test("create sends the documented body, update clears a bound with null, and delete resolves on 204", async () => {
  const wireFilter = {
    id: 34,
    company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
    integration_id: 219,
    tracker_ids: ["TRK8154748ae6bd4e278a7cddd38a662d5d"],
    call_type: "first_call",
    min_duration: 3,
    max_duration: null,
    lead_status: null,
    integration: { id: 219, type: "Webhooks" },
  };
  const fetch = fakeFetch(
    { status: 201, json: wireFilter },
    { json: { ...wireFilter, call_type: "vm", min_duration: 10 } },
    { status: 204 },
  );
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const created = await account.integrationFilters.create({
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
    integrationId: IntegrationId(219),
    trackerIds: [TrackerId("TRK8154748ae6bd4e278a7cddd38a662d5d")],
    callType: null,
    minDuration: 1,
    maxDuration: 11,
  });
  const updated = await account.integrationFilters.update(IntegrationFilterId(34), {
    callType: "vm",
    minDuration: 10,
    maxDuration: null,
  });
  await account.integrationFilters.delete(IntegrationFilterId(34));

  assert.deepEqual(
    fetch.requests.map((request) => [request.method, request.path, request.body]),
    [
      [
        "POST",
        "/v3/a/ACC1/integration_triggers.json",
        {
          kind: "json",
          value: {
            company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
            integration_id: 219,
            tracker_ids: ["TRK8154748ae6bd4e278a7cddd38a662d5d"],
            call_type: null,
            min_duration: 1,
            max_duration: 11,
          },
        },
      ],
      ["PUT", "/v3/a/ACC1/integration_triggers/34.json", { kind: "json", value: { call_type: "vm", min_duration: 10, max_duration: null } }],
      ["DELETE", "/v3/a/ACC1/integration_triggers/34.json", { kind: "none" }],
    ],
  );
  assert.deepEqual([created.id, created.integrationId, created.callType], [34, 219, "first_call"]);
  assert.deepEqual([updated.callType, updated.minDuration, updated.maxDuration], ["vm", 10, null]);
});
