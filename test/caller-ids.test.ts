import assert from "node:assert/strict";
import { test } from "node:test";
import { CallerIdId, CallRail, CallRailError, CompanyId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

test("create sends the company as a string id and returns the code to enter on the verification call", async () => {
  const fetch = fakeFetch({
    status: 201,
    json: {
      id: 15,
      phone_number: "19042223344",
      name: "Bob's Cell",
      company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
      verified: false,
      created_at: "2017-01-18T11:43:30.188-05:00",
      validation_code: "688107",
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const created = await account.callerIds.create({
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
    phoneNumber: "+14047704070",
    name: "Widget Shop",
  });

  assert.deepEqual(
    [fetch.requests[0]?.method, fetch.requests[0]?.path, fetch.requests[0]?.body],
    [
      "POST",
      "/v3/a/ACC1/caller_ids.json",
      {
        kind: "json",
        value: { company_id: "COM8154748ae6bd4e278a7cddd38a662f4f", phone_number: "+14047704070", name: "Widget Shop" },
      },
    ],
  );
  assert.deepEqual(created, {
    id: 15,
    phoneNumber: "19042223344",
    name: "Bob's Cell",
    companyId: "COM8154748ae6bd4e278a7cddd38a662f4f",
    verified: false,
    createdAt: "2017-01-18T11:43:30.188-05:00",
    validationCode: "688107",
  });
});

test("a caller id without the company_id the response table promises fails with the path that is missing", async () => {
  const fetch = fakeFetch({
    json: {
      id: 10,
      phone_number: "+17704445555",
      name: "Bob's Cell",
      verified: true,
      created_at: "2015-04-17T11:02:36.461-04:00",
      validation_code: "332377",
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  await assert.rejects(account.callerIds.get(CallerIdId(10)), (error: unknown) => {
    assert.ok(error instanceof CallRailError);
    assert.deepEqual(error.problem, { kind: "unexpected_response", status: 200, reason: "decode", path: "$.company_id" });
    return true;
  });
  assert.equal(fetch.requests[0]?.path, "/v3/a/ACC1/caller_ids/10.json");
});
