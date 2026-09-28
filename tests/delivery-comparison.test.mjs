import assert from "node:assert/strict";
import test from "node:test";
import { metricsForOutput } from "../evals/metrics.mjs";

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
  assert.equal(metrics.cost_basis, "model_rate_estimate_usd");
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
