import assert from "node:assert/strict";
import test from "node:test";
import { backoffDelay } from "../src/retry.mjs";

test("the delay doubles from the base", () => {
  assert.equal(backoffDelay(0, 100, 10_000), 100);
  assert.equal(backoffDelay(3, 100, 10_000), 800);
});

test("the delay never exceeds the maximum", () => {
  assert.equal(backoffDelay(10, 100, 10_000), 10_000);
});
