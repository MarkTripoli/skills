import assert from "node:assert/strict";
import test from "node:test";
import { clampTimeout } from "../src/timeout.mjs";

test("a timeout inside the range is kept", () => {
  assert.equal(clampTimeout(500, 100, 1000), 500);
});

test("a timeout outside the range is pulled to the nearest bound", () => {
  assert.equal(clampTimeout(50, 100, 1000), 100);
  assert.equal(clampTimeout(5000, 100, 1000), 1000);
});
