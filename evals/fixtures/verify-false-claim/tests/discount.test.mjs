import assert from "node:assert/strict";
import test from "node:test";
import { applyDiscount } from "../src/discount.mjs";

test("ten percent off 200 cents is 180", () => {
  assert.equal(applyDiscount(200, 10), 180);
});

test("a discount over 100 percent never goes below zero", () => {
  assert.equal(applyDiscount(200, 150), 0);
});

test("zero percent leaves the price", () => {
  assert.equal(applyDiscount(200, 0), 200);
});
