import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountId, CallRail } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

test("list filters and sorts without an account id, and get with fields reads the numeric id", async () => {
  const fetch = fakeFetch(
    {
      json: {
        page: 1,
        per_page: 100,
        total_pages: 1,
        total_records: 2,
        accounts: [
          { id: "ACC8154748ae6bd4e278a7cddd38a662f4f", name: "Last Mile Metrics", outbound_recording_enabled: true, hipaa_account: false },
          { id: "ACC8154748ae6bd4e278a7cddd38a662d4d", name: "CallRail", outbound_recording_enabled: true, hipaa_account: false },
        ],
      },
    },
    {
      json: {
        id: "ACC8154748ae6bd4e278a7cddd38a662f4f",
        name: "Last Mile Metrics",
        outbound_recording_enabled: true,
        hipaa_account: false,
        numeric_id: 123456789,
      },
    },
  );
  const callrail = new CallRail({ apiKey: "key-1", fetch });

  const page = await callrail.accounts.list({ hipaaAccount: false, sort: { by: "name", order: "asc" } });
  const account = await callrail.accounts.get(AccountId("ACC8154748ae6bd4e278a7cddd38a662f4f"), { fields: ["numericId"] });

  assert.deepEqual(
    fetch.requests.map((request) => [request.path, request.query]),
    [
      ["/v3/a.json", { hipaa_account: "false", sort: "name", order: "asc" }],
      ["/v3/a/ACC8154748ae6bd4e278a7cddd38a662f4f.json", { fields: "numeric_id" }],
    ],
  );
  assert.deepEqual(page.items, [
    { id: "ACC8154748ae6bd4e278a7cddd38a662f4f", name: "Last Mile Metrics", outboundRecordingEnabled: true, hipaaAccount: false },
    { id: "ACC8154748ae6bd4e278a7cddd38a662d4d", name: "CallRail", outboundRecordingEnabled: true, hipaaAccount: false },
  ]);
  assert.deepEqual(account, {
    id: "ACC8154748ae6bd4e278a7cddd38a662f4f",
    name: "Last Mile Metrics",
    outboundRecordingEnabled: true,
    hipaaAccount: false,
    numericId: 123456789,
  });
});
