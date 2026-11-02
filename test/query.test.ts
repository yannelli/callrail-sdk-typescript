import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeMoney } from "../src/query.js";

test("encodeMoney rounds dollars to cents half away from zero", () => {
  const cases: [number, string][] = [
    [450, "450.00"], [19.99, "19.99"], [1.005, "1.01"], [2.675, "2.68"], [8.345, "8.35"],
    [0.1 + 0.2, "0.30"], [-1.005, "-1.01"], [-0.001, "0.00"], [1e-7, "0.00"], [1234567.895, "1234567.90"],
  ];
  for (const [value, expected] of cases) assert.equal(encodeMoney(value), expected, String(value));
});

test("encodeMoney keeps null and undefined and rejects non-finite numbers", () => {
  assert.equal(encodeMoney(null), null);
  assert.equal(encodeMoney(undefined), undefined);
  assert.throws(() => encodeMoney(Number.NaN), TypeError);
  assert.throws(() => encodeMoney(Infinity), TypeError);
});
