import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const runner = new URL("../evals/run.mjs", import.meta.url);

test("comparison leaves acceptance incomplete and spend unknown without matched recorded provenance", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-comparison-"));
  try {
    const solo = path.join(dir, "solo");
    const delivery = path.join(dir, "delivery");
    fs.mkdirSync(solo);
    fs.mkdirSync(delivery);
    fs.writeFileSync(path.join(solo, "comparison-run.json"), JSON.stringify({ ok: true, model: "model-a", fixtureRevision: "seed-1", wallTimeSeconds: 12 }));
    fs.writeFileSync(path.join(delivery, "comparison-run.json"), JSON.stringify({ ok: false, model: "model-b", fixtureRevision: "seed-1", wallTimeSeconds: 17 }));
    const result = spawnSync(process.execPath, [runner.pathname, "--compare", solo, delivery], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const comparison = JSON.parse(result.stdout);
    assert.equal(comparison.solo.acceptance, "passed");
    assert.equal(comparison.delivery.acceptance, "failed");
    assert.equal(comparison.fixtureMatched, true);
    assert.equal(comparison.spendComparable, false);
    assert.equal(comparison.spendAdvantage, "unknown");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
