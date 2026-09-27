import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { metricsForOutput } from "../evals/metrics.mjs";
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

test("spend advantage requires matching model and passing runs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-comparison-spend-"));
  try {
    const solo = path.join(dir, "solo");
    const delivery = path.join(dir, "delivery");
    fs.mkdirSync(solo);
    fs.mkdirSync(delivery);
    const metrics = { wall_ms: 12000, cost: { total: 2 }, cost_basis: "provider_reported_usd",
      cost_source: "omp.turn_end.message.usage.cost", coverage: { complete: true, models: ["openai/model-a"] } };
    const record = { ok: true, model: "model-a", fixtureRevision: "seed-1", wallTimeSeconds: 12, metrics };
    fs.writeFileSync(path.join(solo, "comparison-run.json"), JSON.stringify(record));
    const compare = () => JSON.parse(spawnSync(process.execPath, [runner.pathname, "--compare", solo, delivery], { encoding: "utf8" }).stdout);
    fs.writeFileSync(path.join(delivery, "comparison-run.json"), JSON.stringify({ ...record, model: "model-b", metrics: { ...metrics, cost: { total: 3 } } }));
    assert.equal(compare().spendAdvantage, "unknown");
    fs.writeFileSync(path.join(delivery, "comparison-run.json"), JSON.stringify({ ...record, metrics: { ...metrics, cost: { total: 3 } } }));
    assert.equal(compare().spendAdvantage, "solo");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("real OMP turn_end usage is counted once and terminal agent_end supplies the answer", () => {
  const output = [
    JSON.stringify({ type: "turn_end", message: { provider: "openai", model: "model-a",
      usage: { input: 2, output: 3, cacheRead: 0, cacheWrite: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } }),
    JSON.stringify({ type: "message_end", message: { usage: { input: 2, output: 3, cost: { total: 0 } } } }),
    JSON.stringify({ type: "agent_end", isTerminal: true, messages: [
      { role: "user", content: [{ type: "text", text: "input" }] },
      { role: "assistant", content: [{ type: "text", text: "final answer" }] },
    ] }),
  ].join("\n");
  const metrics = metricsForOutput(output, 17);
  assert.deepEqual(metrics.tokens, { input: 2, output: 3, cacheRead: 0, cacheWrite: 0 });
  assert.equal(metrics.cost.total, 0);
  assert.equal(metrics.coverage.complete, true);
  assert.deepEqual(metrics.coverage.models, ["openai/model-a"]);
  assert.equal(metrics.answer, "final answer");
});

test("partial or unfinished turns never produce a comparable token or cost total", () => {
  const partial = [
    JSON.stringify({ type: "turn_end", message: { provider: "openai", model: "model-a",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0.01 } } } }),
    JSON.stringify({ type: "turn_end", message: { provider: "openai", model: "model-a", usage: { input: 4 } } }),
    JSON.stringify({ type: "agent_end", isTerminal: true, messages: [] }),
  ].join("\n");
  const metrics = metricsForOutput(partial, 9);
  assert.equal(metrics.tokens, null);
  assert.equal(metrics.cost, null);
  assert.equal(metrics.coverage.complete, false);
  assert.equal(metrics.coverage.turns, 2);
  assert.equal(metricsForOutput(partial.split("\n")[0], 9).coverage.complete, false);
});
