import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CompanyId, UserId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

const widgetShops = [
  { id: "COM8154748ae6bd4e278a7cddd38a662f4f", name: "Widget Shop 2" },
  { id: "COM8154748ae6bd4e278a7cddd38a662e4e", name: "Widget Shop" },
];

test("list sends the filters and sort, and reads accepted as null when the record leaves it out", async () => {
  const fetch = fakeFetch({
    json: {
      page: 1,
      per_page: 100,
      total_pages: 1,
      total_records: 2,
      users: [
        {
          email: "kevin@example.com",
          id: "USR8154748ae6bd4e278a7cddd38a662f4f",
          created_at: "2011-04-06T16:38:27.505-04:00",
          role: "admin",
          first_name: "Kevin",
          last_name: "Mann",
          name: "Kevin Mann",
          companies: [{ id: "COM8154748ae6bd4e278a7cddd38a662f4f", name: "Widget Shop" }],
        },
        {
          email: "andy@example.com",
          id: "USR8154748ae6bd4e278a7cddd38a662e4e",
          created_at: "2011-06-09T14:12:57.842-04:00",
          role: "notification",
          first_name: "Andy",
          last_name: "Powell",
          name: "Andy Powell",
          accepted: false,
          companies: [],
        },
      ],
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const page = await account.users.list({
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
    search: "example.com",
    sort: { by: "email", order: "asc" },
  });

  assert.deepEqual(
    [fetch.requests[0]?.path, fetch.requests[0]?.query],
    [
      "/v3/a/ACC1/users.json",
      { company_id: "COM8154748ae6bd4e278a7cddd38a662f4f", search: "example.com", sort: "email", order: "asc" },
    ],
  );
  assert.deepEqual(page.items, [
    {
      id: "USR8154748ae6bd4e278a7cddd38a662f4f",
      email: "kevin@example.com",
      firstName: "Kevin",
      lastName: "Mann",
      name: "Kevin Mann",
      role: "admin",
      createdAt: "2011-04-06T16:38:27.505-04:00",
      accepted: null,
      companies: [{ id: "COM8154748ae6bd4e278a7cddd38a662f4f", name: "Widget Shop" }],
    },
    {
      id: "USR8154748ae6bd4e278a7cddd38a662e4e",
      email: "andy@example.com",
      firstName: "Andy",
      lastName: "Powell",
      name: "Andy Powell",
      role: "notification",
      createdAt: "2011-06-09T14:12:57.842-04:00",
      accepted: false,
      companies: [],
    },
  ]);
});

test("create sends a reporting user with the companies it may see", async () => {
  const fetch = fakeFetch({
    status: 201,
    json: {
      email: "bob@example.com",
      id: "USR8154748ae6bd4e278a7cddd38a662f4f",
      created_at: "2017-01-13T13:01:17.320-05:00",
      role: "reporting",
      first_name: "Bob",
      last_name: "Belcher",
      name: "Bob Belcher",
      companies: widgetShops,
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const created = await account.users.create({
    firstName: "Bob",
    lastName: "Belcher",
    email: "bob@example.com",
    role: "reporting",
    companies: [CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"), CompanyId("COM8154748ae6bd4e278a7cddd38a662e4e")],
  });

  assert.deepEqual(
    [fetch.requests[0]?.method, fetch.requests[0]?.path, fetch.requests[0]?.body],
    [
      "POST",
      "/v3/a/ACC1/users.json",
      {
        kind: "json",
        value: {
          first_name: "Bob",
          last_name: "Belcher",
          email: "bob@example.com",
          role: "reporting",
          companies: ["COM8154748ae6bd4e278a7cddd38a662f4f", "COM8154748ae6bd4e278a7cddd38a662e4e"],
        },
      },
    ],
  );
  assert.deepEqual([created.name, created.role, created.companies], ["Bob Belcher", "reporting", widgetShops]);
});

test("update sends a new email together with the current password", async () => {
  const fetch = fakeFetch({
    json: {
      email: "gene@example.com",
      id: "USR8154748ae6bd4e278a7cddd38a662f4f",
      created_at: "2017-01-13T13:01:17.320-05:00",
      role: "reporting",
      first_name: "Gene",
      last_name: "Belcher",
      name: "Gene Belcher",
      companies: widgetShops,
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const updated = await account.users.update(UserId("USR8154748ae6bd4e278a7cddd38a662f4f"), {
    firstName: "Gene",
    email: "gene@example.com",
    currentPassword: "password1234",
  });

  assert.deepEqual(
    [fetch.requests[0]?.method, fetch.requests[0]?.path, fetch.requests[0]?.body],
    [
      "PUT",
      "/v3/a/ACC1/users/USR8154748ae6bd4e278a7cddd38a662f4f.json",
      { kind: "json", value: { first_name: "Gene", email: "gene@example.com", current_password: "password1234" } },
    ],
  );
  assert.deepEqual([updated.name, updated.email], ["Gene Belcher", "gene@example.com"]);
});
