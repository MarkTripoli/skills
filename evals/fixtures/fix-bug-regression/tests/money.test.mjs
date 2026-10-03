import assert from "node:assert/strict";
import test from "node:test";
import { formatCents } from "../src/money.mjs";

test("formats cents that fill both decimals", () => {
  assert.equal(formatCents(250), "2.50");
});

test("pads single-digit cents", () => {
  assert.equal(formatCents(105), "1.05");
});
