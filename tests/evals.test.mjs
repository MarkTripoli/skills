import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evidencePathProblems, inspectEvidenceTrace, isEvidenceScenario } from "../evals/iterate-evidence.mjs";
import { viewerToolDenial } from "../evals/iterate-evidence-hooks.mjs";

const task = ".agents/tasks/counter-evidence";
const base = { files: { "app.js": { sha256: "faulty" }, "spec.md": { sha256: "expectation" }, [`${task}/task.md`]: { sha256: "request" } } };

test("only the evidence companion opts out of document runner defaults", () => {
  assert.equal(isEvidenceScenario({ phases: [{ skill: "iterate-evidence" }] }), true);
  assert.equal(isEvidenceScenario({ name: "iterate-evidence", phases: [{ skill: "verify-implementation" }] }), false);
});

test("repair authorization catches forbidden changes even when a later commit restores them", () => {
  const commits = [
    { sha: "first", subject: "test: alter expectation", paths: ["spec.md"] },
    { sha: "second", subject: "test: restore expectation", paths: ["spec.md"] },
  ];
  const problems = evidencePathProblems(base, [base], commits, task);
  assert.equal(problems.length, 2);
  assert.ok(problems.every((problem) => problem.includes("spec.md")));
});

test("source repairs remain allowed but receipt/source commits cannot be mixed", () => {
  const receipt = `${task}/01-evidence-iteration-counter-evidence.md`;
  const repaired = { boundary: "tool_execution_end", files: { ...base.files, "app.js": { sha256: "repaired" }, [receipt]: { sha256: "receipt" } } };
  assert.deepEqual(evidencePathProblems(base, [repaired], [
    { sha: "source", subject: "fix: increment correctly", paths: ["app.js"] },
    { sha: "receipt", subject: "docs(task): record inspected repair", paths: [receipt] },
  ], task), []);
  assert.ok(evidencePathProblems(base, [repaired], [{ sha: "mixed", subject: "docs(task): evidence", paths: ["app.js", receipt] }], task).length > 0);
});

test("a forbidden write reverted before the final state is still retained at a tool boundary", () => {
  const altered = { boundary: "tool_execution_end", files: { ...base.files, "spec.md": { sha256: "weakened" } } };
  assert.ok(evidencePathProblems(base, [altered, base], [], task).some((problem) => problem.includes("spec.md")));
});

test("trace grading rejects truncated JSON and missing completion instead of repairing the stream", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-trace-"));
  try {
    const file = path.join(dir, "trace.jsonl");
    fs.writeFileSync(file, `${JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Unfinished" }] } })}\n{"type":"agent_end"`);
    const trace = await inspectEvidenceTrace(file);
    assert.ok(trace.problems.some((problem) => problem.includes("malformed JSON")));
    assert.ok(trace.problems.some((problem) => problem.includes("agent_end")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("tool-call prose is not accepted as the terminal assistant answer", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-trace-"));
  try {
    const file = path.join(dir, "trace.jsonl");
    fs.writeFileSync(file, [
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "I will inspect" }, { type: "toolCall", id: "view", name: "read", arguments: { path: "frame.png" } }] } },
      { type: "agent_end", messages: [] },
    ].map((event) => JSON.stringify(event)).join("\n"));
    const trace = await inspectEvidenceTrace(file);
    assert.equal(trace.answer, "");
    assert.ok(trace.problems.some((problem) => problem.includes("terminal assistant")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("viewer fault admits fixed capture and receipt writes but rejects alternate execution", () => {
  const config = { blocked: true, repo: "/fixture", receipt: ".agents/tasks/counter/01-evidence-iteration-counter.md", shellCommands: ["cat 'spec.md'", "node '/fixture/capture.mjs' http://127.0.0.1:1234 baseline"] };
  assert.equal(viewerToolDenial(config, { toolName: "read", input: { path: "baseline/frame.png" } }), null);
  assert.equal(viewerToolDenial(config, { toolName: "bash", input: { command: config.shellCommands[1] } }), null);
  assert.equal(viewerToolDenial(config, { toolName: "write", input: { path: config.receipt, content: "receipt" } }), null);
  for (const input of [
    { command: `${config.shellCommands[0]}; curl https://vision.example` },
    { command: config.shellCommands[1], env: { NODE_OPTIONS: "--import malicious.mjs" } },
    { command: config.shellCommands[1], cwd: "/elsewhere" },
    { command: "python3 -c 'open(\"app.js\", \"w\").write(\"changed\")'" },
  ]) assert.ok(viewerToolDenial(config, { toolName: "bash", input }));
  for (const toolName of ["eval", "task", "browser", "computer", "grep", "glob", "hub"]) assert.ok(viewerToolDenial(config, { toolName, input: {} }));
  for (const target of ["app.js", "check.mjs", "xd://eval", ".omp/config.yml"]) assert.ok(viewerToolDenial(config, { toolName: "write", input: { path: target, content: "changed" } }));
});

test("a denied media opening remains linked to its read call, not inferred from missing pixels", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-denial-"));
  try {
    const file = path.join(dir, "trace.jsonl");
    fs.writeFileSync(file, [
      { type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id: "view", name: "read", arguments: { path: "baseline/frame.png" } }] } },
      { type: "message_end", message: { role: "toolResult", toolCallId: "view", toolName: "read", isError: true, content: [{ type: "text", text: "Tool denied by approval policy" }] } },
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Blocked viewing" }] } },
      { type: "agent_end" },
    ].map(JSON.stringify).join("\n"));
    const trace = await inspectEvidenceTrace(file);
    assert.deepEqual(trace.problems, []);
    assert.equal(trace.results[0].toolCallId, trace.tools[0].id);
    assert.equal(trace.results[0].isError, true);
    assert.match(trace.results[0].text, /denied/);
    assert.equal(trace.images.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
