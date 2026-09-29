import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CallRailError } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";
import { operations } from "./operations.js";

test("the catalog has 73 methods over 71 distinct HTTP operations", () => {
  assert.equal(operations.length, 73);
  assert.equal(new Set(operations.map((operation) => `${operation.method} ${operation.path}`)).size, 71);
});

for (const operation of operations) {
  test(`${operation.name} sends ${operation.method} ${operation.path}`, async () => {
    const fetch = fakeFetch({ status: 404, json: { error: "Not found" } });
    const callrail = new CallRail({ apiKey: "key-1", fetch });

    await assert.rejects(operation.send(callrail.account("ACC1"), callrail), (error: unknown) => {
      assert.ok(error instanceof CallRailError);
      assert.deepEqual(error.problem, { kind: "not_found", status: 404 });
      assert.equal(error.message, "Not found");
      return true;
    });
    assert.deepEqual(
      fetch.requests.map((request) => [request.method, request.path, request.headers["authorization"]]),
      [[operation.method, operation.path, 'Token token="key-1"']],
    );
  });
}
