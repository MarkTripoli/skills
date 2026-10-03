// iterate-tdd rewrites `### Execution DAG` on every revision. This runs the DAG parser the live
// full-with-sources eval uses against a sample TDD, so a stale or `subgraph`-using DAG fails offline.
import assert from "node:assert/strict";
import test from "node:test";

const SAMPLE = (dag) => `### Design Questions\n\n#### Where does the token secret go?\n\nA 429 carries Retry-After. Recommendation: A.\n\nUse src/channels/acme-status.mjs.\n\n### Execution DAG\n\n\`\`\`mermaid\n${dag}\n\`\`\`\n\n## Human Review\n`;
const GOOD = `flowchart TD
  prd["create-prd: done"] --> tdd["create-tdd<br/>gate: plan"]
  tdd --> plan["create-plan<br/>gate: plan"]
  plan --> base["baseline: /record-evidence --baseline<br/>unattended"]
  base --> impl["implement-plan<br/>unattended"] --> verify["verify-implementation<br/>unattended"]
  verify --> review["review loop<br/>unattended"] --> evidence["record-evidence<br/>unattended"]
  evidence --> inspect["iterate-evidence<br/>unattended"] --> pr["describe-pr<br/>unattended"]`;

test("the DAG parser accepts a sample TDD's Execution DAG and rejects a subgraph revision", async () => {
  const { default: scenario } = await import("../evals/scenarios/full-with-sources.mjs");
  const phase = scenario.phases.find((p) => p.skill === "create-design-discussion");
  const dagProblems = (dag) => [phase.check({ artifact: { text: SAMPLE(dag) } })].flat(Infinity).filter((line) => line && /Execution DAG/.test(line));
  assert.deepEqual(dagProblems(GOOD), []);
  assert.ok(dagProblems(GOOD.replace("flowchart TD\n", 'flowchart TD\n  subgraph s ["gated"]\n').replace("  evidence -->", "  end\n  evidence -->")).length > 0);
});
