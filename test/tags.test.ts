import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CompanyId, TagId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

test("list scopes to a company, filters by status, and sorts by name", async () => {
  const fetch = fakeFetch({
    json: {
      page: 1,
      per_page: 100,
      total_pages: 1,
      total_records: 2,
      tags: [
        {
          id: 993186,
          name: "Conversion",
          tag_level: "company",
          color: "gray1",
          background_color: "green2",
          company_id: "COM37221d54e80c4216898d2f857fc69fa0",
          status: "enabled",
          created_at: "2017-07-24T11:13:47.366-04:00",
        },
        {
          id: 1932597,
          name: "Sales",
          tag_level: "company",
          color: "gray1",
          background_color: "blue2",
          company_id: "COM37221d54e80c4216898d2f857fc69fa0",
          status: "enabled",
          created_at: "2019-04-05T13:38:36.258-04:00",
        },
      ],
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const page = await account.tags.list({
    companyId: CompanyId("COM37221d54e80c4216898d2f857fc69fa0"),
    status: "enabled",
    sort: { by: "name", order: "asc" },
  });

  assert.deepEqual(
    [fetch.requests[0]?.path, fetch.requests[0]?.query],
    ["/v3/a/ACC1/tags.json", { company_id: "COM37221d54e80c4216898d2f857fc69fa0", status: "enabled", sort: "name", order: "asc" }],
  );
  assert.deepEqual(page.items, [
    {
      id: 993186,
      name: "Conversion",
      tagLevel: "company",
      color: "gray1",
      backgroundColor: "green2",
      companyId: "COM37221d54e80c4216898d2f857fc69fa0",
      status: "enabled",
      createdAt: "2017-07-24T11:13:47.366-04:00",
    },
    {
      id: 1932597,
      name: "Sales",
      tagLevel: "company",
      color: "gray1",
      backgroundColor: "blue2",
      companyId: "COM37221d54e80c4216898d2f857fc69fa0",
      status: "enabled",
      createdAt: "2019-04-05T13:38:36.258-04:00",
    },
  ]);
});

test("create reads the documented string id as a number, and update sends disabled as a boolean", async () => {
  const wireTag = {
    id: "1234569",
    name: "Existing Customer",
    tag_level: "company",
    color: "gray1",
    background_color: "gray1",
    company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
    status: "enabled",
    created_at: "2014-06-06T12:11:02.964-04:00",
  };
  const fetch = fakeFetch({ status: 201, json: wireTag }, { json: { ...wireTag, status: "disabled" } });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const created = await account.tags.create({
    name: "Existing Customer",
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
    color: "gray1",
  });
  const updated = await account.tags.update(created.id, { disabled: true });

  assert.deepEqual(
    fetch.requests.map((request) => [request.method, request.path, request.body]),
    [
      [
        "POST",
        "/v3/a/ACC1/tags.json",
        { kind: "json", value: { name: "Existing Customer", company_id: "COM8154748ae6bd4e278a7cddd38a662f4f", color: "gray1" } },
      ],
      ["PUT", "/v3/a/ACC1/tags/1234569.json", { kind: "json", value: { disabled: true } }],
    ],
  );
  assert.deepEqual([created.id, created.status, updated.status], [TagId(1234569), "enabled", "disabled"]);
});
