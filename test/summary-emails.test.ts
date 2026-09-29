import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CompanyId, SummaryEmailId, UserId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

const sections = { summary_statistics: true, top_sources: true, top_keywords: true, call_log: true };
const bob = { id: "USR8154748ae6bd4e278a7cddd38a662f4f", name: "Bob Smith", email: "bob.smith@example.com" };

test("list uses the path without .json and repeats frequency as an array parameter", async () => {
  const fetch = fakeFetch({
    json: {
      page: 1,
      per_page: 100,
      total_pages: 1,
      total_records: 1,
      summary_emails: [
        {
          id: "CSS8154748ae6bd4e278a7cddd38a662f4f",
          scope: { id: "COM8154748ae6bd4e278a7cddd38a662f4f", type: "Company", name: "C1" },
          frequency: ["daily", "weekly"],
          config: sections,
          user: bob,
        },
      ],
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const page = await account.summaryEmails.list({
    frequency: ["daily", "weekly"],
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
  });

  assert.deepEqual(
    [fetch.requests[0]?.path, fetch.requests[0]?.query],
    [
      "/v3/a/ACC1/summary_emails",
      { "frequency[]": ["daily", "weekly"], company_id: "COM8154748ae6bd4e278a7cddd38a662f4f" },
    ],
  );
  assert.deepEqual(page.items, [
    {
      id: "CSS8154748ae6bd4e278a7cddd38a662f4f",
      scope: { type: "Company", id: "COM8154748ae6bd4e278a7cddd38a662f4f", name: "C1" },
      frequency: ["daily", "weekly"],
      sections: { summaryStatistics: true, topSources: true, topKeywords: true, callLog: true },
      leadStatus: null,
      recipient: { type: "user", userId: "USR8154748ae6bd4e278a7cddd38a662f4f", name: "Bob Smith", email: "bob.smith@example.com" },
    },
  ]);
});

test("create sends sections as config and the lead filter as filters", async () => {
  const fetch = fakeFetch({
    status: 201,
    json: {
      id: "CSS8154748ae6bd4e278a7cddd38a662f4f",
      scope: { id: "COM8154748ae6bd4e278a7cddd38a662f4f", type: "Company", name: "C1" },
      frequency: ["weekly", "daily"],
      filters: { lead_status: "Not a Lead" },
      config: sections,
      user: bob,
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const created = await account.summaryEmails.create({
    recipient: { userId: UserId("USR8154748ae6bd4e278a7cddd38a662f4f") },
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
    frequency: ["weekly", "daily"],
    leadStatus: "Not a Lead",
    sections: { summaryStatistics: true, topSources: true, topKeywords: true, callLog: true },
  });

  assert.deepEqual(
    [fetch.requests[0]?.method, fetch.requests[0]?.path, fetch.requests[0]?.body],
    [
      "POST",
      "/v3/a/ACC1/summary_emails.json",
      {
        kind: "json",
        value: {
          user_id: "USR8154748ae6bd4e278a7cddd38a662f4f",
          company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
          frequency: ["weekly", "daily"],
          config: sections,
          filters: { lead_status: "Not a Lead" },
        },
      },
    ],
  );
  assert.deepEqual([created.leadStatus, created.frequency], ["Not a Lead", ["weekly", "daily"]]);
});

test("update sends only the sections it names, and get reads an account scope and an email-only recipient", async () => {
  const fetch = fakeFetch(
    {
      json: {
        id: "CSS8154748ae6bd4e278a7cddd38a662f4f",
        scope: { id: "COM8154748ae6bd4e278a7cddd38a662f4f", type: "Company", name: "C1" },
        frequency: ["monthly", "weekly"],
        filters: { lead_status: "Lead" },
        config: { ...sections, call_log: false },
        user: bob,
      },
    },
    {
      json: {
        id: "CSS8154748ae6bd4e278a7cddd38a662f4f",
        scope: { id: "ACC8154748ae6bd4e278a7cddd38a662f4f", type: "Account", name: "A1" },
        frequency: "daily",
        config: sections,
        user: null,
        email: "owner@example.com",
      },
    },
  );
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const updated = await account.summaryEmails.update(SummaryEmailId("CSS8154748ae6bd4e278a7cddd38a662f4f"), {
    frequency: ["monthly", "weekly"],
    sections: { callLog: false },
  });
  const fetched = await account.summaryEmails.get(SummaryEmailId("CSS8154748ae6bd4e278a7cddd38a662f4f"));

  assert.deepEqual(
    [fetch.requests[0]?.method, fetch.requests[0]?.path, fetch.requests[0]?.body],
    [
      "PUT",
      "/v3/a/ACC1/summary_emails/CSS8154748ae6bd4e278a7cddd38a662f4f.json",
      { kind: "json", value: { frequency: ["monthly", "weekly"], config: { call_log: false } } },
    ],
  );
  assert.deepEqual([updated.sections.callLog, updated.leadStatus], [false, "Lead"]);
  assert.deepEqual(
    [fetched.scope, fetched.frequency, fetched.recipient],
    [{ type: "Account", id: "ACC8154748ae6bd4e278a7cddd38a662f4f", name: "A1" }, ["daily"], { type: "email", email: "owner@example.com" }],
  );
});
