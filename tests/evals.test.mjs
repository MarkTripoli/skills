import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evidencePathProblems, inspectEvidenceTrace, isEvidenceScenario, viewerTemporaryProof, reviewProblems } from "../evals/iterate-evidence.mjs";
import { viewerToolDenial } from "../evals/iterate-evidence-hooks.mjs";
import { createHash } from "node:crypto";
import primaryScenario from "../evals/scenarios/iterate-evidence.mjs";

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

test("viewer ownership requires internal allocation, matching pixels and bounded read lifetime", () => {
  const name = "omp-video-frame-abc123/frame.png";
  const allocation = { output: name, cwd: "/fixture", command: ["/usr/bin/ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "2.2", "-i", "/fixture/evidence/raw.webm", "-frames:v", "1", name], code: 0, sha256: "pixels", stack: "Error: viewer process\n    at observer (hooks.mjs:1:1)\n    at reader (/$bunfs/root/omp-darwin-arm64:100:22)", calls: [{ id: "view", name: "read" }] };
  const trace = { tools: [{ id: "view", name: "read", arguments: { path: "evidence/raw.webm:2.2s" } }], images: [{ toolCallId: "view", sha256: "pixels", isError: false }] };
  const snapshots = [
    { sequence: 1, boundary: "tool_execution_start", toolCallId: "view", toolName: "read", files: base.files },
    { sequence: 2, boundary: "tool_execution_end", toolCallId: "other-read", toolName: "read", files: { ...base.files, [name]: { sha256: "pixels" } } },
    { sequence: 3, boundary: "tool_execution_end", toolCallId: "view", toolName: "read", files: base.files },
  ];
  const check = (allocations = [allocation], selectedTrace = trace, states = snapshots, final = base) =>
    evidencePathProblems(base, states, [], task, viewerTemporaryProof(allocations, selectedTrace, states, base, final));
  assert.deepEqual(check(), []);
  assert.ok(check([]).some((problem) => problem.includes(name)));
  assert.ok(check([{ ...allocation, stack: "at arbitraryWrite" }]).length);
  assert.ok(check([{ ...allocation, calls: [{ id: "writer", name: "bash" }] }]).length);
  assert.ok(check([allocation], { ...trace, images: [{ ...trace.images[0], sha256: "different" }] }).length);
  assert.ok(check([allocation], { ...trace, images: [{ ...trace.images[0], isError: true }] }).length);
  assert.ok(check([allocation], trace, snapshots, snapshots[1]).length);
  const writer = { sequence: 0, boundary: "tool_execution_start", toolCallId: "writer", toolName: "write", files: base.files };
  assert.ok(check([allocation], trace, [writer, ...snapshots]).length);
  const unrelated = snapshots.map((snapshot) => snapshot.sequence === 2 ? { ...snapshot, files: { ...snapshot.files, "omp-video-frame-unknown/frame.png": { sha256: "pixels" } } } : snapshot);
  assert.ok(check([allocation], trace, unrelated).some((problem) => problem.includes("unknown")));
  const proven = viewerTemporaryProof([allocation], trace, snapshots, base, base);
  assert.ok(evidencePathProblems(base, snapshots, [{ sha: "bad", subject: "chore: retain viewer output", paths: [name] }], task, proven).some((problem) => problem.includes("committed")));
});

test("primary inspection rejects image substitution and unconsumed or completed reservations", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-primary-"));
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const put = (relative, bytes) => {
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return hash(bytes);
  };
  try {
    const original = { files: { "app.js": { sha256: hash("faulty") }, "check.mjs": { sha256: "weak" } } };
    const repaired = { files: { "app.js": { sha256: hash("fixed") }, "check.mjs": { sha256: "strong" } } };
    const receiptText = "---\ntype: evidence-iteration\n---\nFinal";
    const receipt = "task/01-evidence-iteration-counter.md";
    const final = { receipt, receiptSha256: put(receipt, receiptText), requiredCoveragePassed: true, findingsResolved: true, unchangedExpectations: true, historyPreserved: true, mutationToolsReviewed: true, notes: "Reviewed histories" };
    const trace = { tools: [], images: [] };
    const snapshots = [];
    const observations = [];
    let line = 0;
    for (const phase of ["baseline", "repaired"]) {
      const session = `task/evidence/${phase}`;
      const source = phase === "baseline" ? "faulty" : "fixed";
      const media = `${session}/raw.webm`;
      const mediaSha256 = put(media, `${phase} video`);
      put(`${session}/served-app.js`, source);
      put(`${session}/manifest.json`, "{}");
      put(`${session}/capture.json`, JSON.stringify({ video: "raw.webm", videoSha256: mediaSha256, servedScript: "served-app.js", servedSha256: hash(source), startedAt: phase === "baseline" ? 1 : 10, finishedAt: phase === "baseline" ? 5 : 15 }));
      for (const [flow, observedCount, timestamp] of [["initial", 0, 0.5], ["increment", phase === "baseline" ? 2 : 1, 2], ...(phase === "repaired" ? [["reset", 0, 4]] : [])]) {
        line += 1;
        const frame = `${session}/${flow}.png`;
        const frameSha256 = put(frame, `${phase} ${flow} pixels`);
        trace.tools.push({ id: String(line), arguments: { path: frame.slice("task/".length) } });
        trace.images.push({ line, toolCallId: String(line), sha256: frameSha256 });
        snapshots.push({ sequence: phase === "baseline" ? line : line + 10, boundary: "tool_execution_end", toolCallId: String(line), state: phase === "baseline" ? original : repaired });
        observations.push({ flow: `${phase}-${flow}`, capture: `${session}/capture.json`, media, mediaSha256, frame, frameSha256, timestamp, observedCount, subjectTraceLine: line, notes: "Opened recorded pixels" });
      }
    }
    const reservationText = "---\nstatus: in-progress\nconsumed_rounds: 1\nlimit: 3\n---\n### Round 1\nReservation persisted; IE-001; repair pending.";
    const reserve = (text) => {
      const sha = hash(text);
      put(`blobs/${sha}`, text);
      return { path: "snapshots/reserved.json", sequence: 3, state: { files: { ...original.files, [`${task}/01-evidence-iteration-counter.md`]: { sha256: sha } } } };
    };
    snapshots.splice(2, 0, reserve(reservationText));
    const review = { reviewer: "test reviewer", inspectedAt: "2026-09-20T00:00:00Z", observations, reservation: { snapshot: "snapshots/reserved.json", findingId: "IE-001", round: 1, notes: "Persisted before mutation" }, final };
    const check = () => reviewProblems(dir, review, trace, snapshots, original, repaired, task);
    assert.deepEqual(check(), []);
    const increment = observations[1];
    const originalSample = { ...increment };
    increment.media = "task/evidence/baseline/evidence.mp4";
    increment.mediaSha256 = put(increment.media, "rendered baseline");
    increment.timestamp = 6;
    const manifest = { source: "external", video: `${task}/evidence/baseline/evidence.mp4`, render: { layout: "overlay" }, raw: { duration: 5 }, timing: { card_seconds: 4, tail_hold: 0 } };
    put("task/evidence/baseline/manifest.json", JSON.stringify(manifest));
    assert.deepEqual(check(), []);
    observations[0].timestamp = 2.5;
    assert.ok(check().some((problem) => problem.includes("initial zero must precede")));
    observations[0].timestamp = 0.5;
    manifest.timing.tail_hold = 1;
    put("task/evidence/baseline/manifest.json", JSON.stringify(manifest));
    assert.ok(check().some((problem) => problem.includes("unheld")));
    Object.assign(increment, originalSample);
    put("task/evidence/baseline/manifest.json", "{}");
    trace.images[1].sha256 = "substituted";
    assert.ok(check().some((problem) => problem.includes("subject image")));
    trace.images[1].sha256 = observations[1].frameSha256;
    for (const invalid of [
      reservationText.replace("consumed_rounds: 1", "consumed_rounds: 0"),
      reservationText.replace("status: in-progress", "status: passed"),
      reservationText.replace("limit: 3", "limit: 4"),
      reservationText.replace("repair pending", "repair completed"),
    ]) {
      snapshots[2] = reserve(invalid);
      assert.ok(check().some((problem) => problem.includes("consumed round")));
    }
    snapshots[2] = reserve(reservationText);
    review.observations = observations.filter((item) => item.flow !== "repaired-initial");
    assert.ok(check().some((problem) => problem.includes("repaired-initial")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("primary scenario rejects an altered default allowance", () => {
  const artifact = { fm: { type: "evidence-iteration", limit: "3" } };
  assert.deepEqual(primaryScenario.phases[0].check({ artifact }), []);
  artifact.fm.limit = "4";
  assert.ok(primaryScenario.phases[0].check({ artifact }).length);
});
