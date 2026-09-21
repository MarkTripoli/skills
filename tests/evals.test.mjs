import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evidencePathProblems, inspectEvidenceTrace, isEvidenceScenario, viewerTemporaryProof, reviewProblems } from "../evals/iterate-evidence.mjs";
import { boundedWorkerLauncher, reservationCheckpoint, reservationGateDecision } from "../evals/worker-gate.mjs";
import { counterFlowCoverage, normalize } from "../evals/evidence-flows.mjs";
import { spawnSync } from "node:child_process";
import { viewerToolDenial } from "../evals/iterate-evidence-hooks.mjs";
import { createHash } from "node:crypto";
import primaryScenario from "../evals/scenarios/iterate-evidence.mjs";

const task = ".agents/tasks/counter-evidence";
const base = { files: { "app.js": { sha256: "faulty" }, "spec.md": { sha256: "expectation" }, [`${task}/task.md`]: { sha256: "request" } } };

test("iterate-evidence instructions require image-payload binding reads", () => {
  const skill = fs.readFileSync(new URL("../skills/delivery/iterate-evidence/SKILL.md", import.meta.url), "utf8");
  const inspection = fs.readFileSync(new URL("../skills/delivery/iterate-evidence/references/inspection_acceptance.md", import.meta.url), "utf8");
  for (const text of [skill, inspection]) {
    assert.match(text, /bare (?:image|retained PNG\/JPEG|retained video timestamp|timestamp selector)/i);
    assert.match(text, /\?q=.*text/i);
    assert.match(text, /pair(?:ed)?(?: it)? with (?:a )?separate bare/i);
  }
});

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
  // F_3R_AUTH_V8: OMP may resize frames before returning them; a different returned sha is accepted.
  assert.deepEqual(check([allocation], { ...trace, images: [{ ...trace.images[0], sha256: "omp-resized" }] }), [], "OMP-resized frame with different returned sha is accepted");
  // F_3R_AUTH_V8 regression: OMP-resized frame (allocation sha A, returned sha B != A) is still credited.
  const ompResizedSnaps = [
    { sequence: 1, boundary: "tool_execution_start", toolCallId: "view", toolName: "read", files: base.files },
    { sequence: 2, boundary: "tool_execution_end", toolCallId: "other-read", toolName: "read", files: { ...base.files, [name]: { sha256: "pixels" } } },
    { sequence: 3, boundary: "tool_execution_end", toolCallId: "view", toolName: "read", files: base.files },
  ];
  assert.deepEqual(check([allocation], { ...trace, images: [{ toolCallId: "view", sha256: "omp-resized-pixels", isError: false }] }, ompResizedSnaps), [], "OMP-resized frame credited: allocation sha pixels, returned sha omp-resized-pixels");
  assert.ok(check([allocation], { ...trace, images: [{ ...trace.images[0], isError: true }] }).length);
  assert.ok(check([{ ...allocation, command: allocation.command.map((arg) => arg === "2.2" ? "3" : arg) }]).length);
  assert.ok(check([{ ...allocation, command: allocation.command.map((arg) => arg === "/fixture/evidence/raw.webm" ? "/fixture/evidence/other.webm" : arg) }]).length);
  assert.ok(check([allocation], trace, snapshots, snapshots[1]).length);
  const writer = { sequence: 0, boundary: "tool_execution_start", toolCallId: "writer", toolName: "write", files: base.files };
  assert.ok(check([allocation], trace, [writer, ...snapshots]).length);
  const unrelated = snapshots.map((snapshot) => snapshot.sequence === 2 ? { ...snapshot, files: { ...snapshot.files, "omp-video-frame-unknown/frame.png": { sha256: "pixels" } } } : snapshot);
  assert.ok(check([allocation], trace, unrelated).some((problem) => problem.includes("unknown")));
  const proven = viewerTemporaryProof([allocation], trace, snapshots, base, base);
  assert.ok(evidencePathProblems(base, snapshots, [{ sha: "bad", subject: "chore: retain viewer output", paths: [name] }], task, proven).some((problem) => problem.includes("committed")));
});
test("concurrent in-flight read calls do not invalidate each other's viewer temp files", () => {
  const nameA = "omp-video-frame-abc123/frame.png";
  const nameB = "omp-video-frame-xyz789/frame.png";
  const stack = "Error: viewer process\n    at observer (hooks.mjs:1:1)\n    at reader (/$bunfs/root/omp-darwin-arm64:100:22)";
  const prefix = ["/usr/bin/ffmpeg", "-hide_banner", "-loglevel", "error", "-y"];
  const alloc = (output, callId, seek) => ({
    output, cwd: "/fixture", code: 0, sha256: `px-${callId}`, stack, calls: [{ id: callId, name: "read" }],
    command: [...prefix, "-ss", seek, "-i", "/fixture/evidence/raw.webm", "-frames:v", "1", output],
  });
  const allocA = alloc(nameA, "viewA", "2.2");
  const allocB = alloc(nameB, "viewB", "3.5");
  const trace = {
    tools: [
      { id: "viewA", name: "read", arguments: { path: "evidence/raw.webm:2.2s" } },
      { id: "viewB", name: "read", arguments: { path: "evidence/raw.webm:3.5s" } },
    ],
    images: [
      { toolCallId: "viewA", sha256: "px-viewA", isError: false },
      { toolCallId: "viewB", sha256: "px-viewB", isError: false },
    ],
  };
  // viewA: seq 1 start, seq 4 end (nameA absent = cleaned up at own end).
  // viewB: seq 2 start (concurrent with viewA), seq 6 end (nameB absent = cleaned up).
  // seq 3: viewer_process_end for nameA's ffmpeg (nameA present, within viewA's window).
  // seq 5: viewer_process_end for nameB's ffmpeg (nameA still present — cleanup delayed,
  //         but seq 5 > seq 4 = viewA's end; toolCallId is null → allowed).
  // viewB's own tool_execution_end (seq 6) has nameB absent.
  const snapshots = [
    { sequence: 1, boundary: "tool_execution_start", toolCallId: "viewA", toolName: "read", files: base.files },
    { sequence: 2, boundary: "tool_execution_start", toolCallId: "viewB", toolName: "read", files: base.files },
    { sequence: 3, boundary: "viewer_process_end", files: { ...base.files, [nameA]: { sha256: "px-viewA" } } },
    { sequence: 4, boundary: "tool_execution_end", toolCallId: "viewA", toolName: "read", files: base.files },
    { sequence: 5, boundary: "viewer_process_end", files: { ...base.files, [nameA]: { sha256: "px-viewA" }, [nameB]: { sha256: "px-viewB" } } },
    { sequence: 6, boundary: "tool_execution_end", toolCallId: "viewB", toolName: "read", files: base.files },
  ];
  const check = (allocs = [allocA, allocB], states = snapshots) =>
    evidencePathProblems(base, states, [], task, viewerTemporaryProof(allocs, trace, states, base, base));
  // Both temp files credited: nameA appears in viewB's concurrent snapshot (seq 5), still authorized.
  assert.deepEqual(check(), [], "nameA in concurrent viewB snapshot is authorized");
  // nameA in a non-concurrent read's snapshot (started after viewA ended) is rejected.
  const nonConcurrent = [
    ...snapshots.slice(0, 4),
    { sequence: 5, boundary: "tool_execution_end", toolCallId: "viewB", toolName: "read", files: base.files },
    { sequence: 6, boundary: "tool_execution_start", toolCallId: "viewC", toolName: "read", files: base.files },
    { sequence: 7, boundary: "tool_execution_end", toolCallId: "viewC", toolName: "read", files: { ...base.files, [nameA]: { sha256: "px-viewA" } } },
  ];
  assert.ok(check([allocA, allocB], nonConcurrent).some((p) => p.includes(nameA)), "non-concurrent appearance past owner end is rejected");
});

test("bare video ownership requires the complete same-read thumbnail-to-sheet graph", () => {
  const stack = "Error: viewer process\n    at observer (hooks.mjs:1:1)\n    at reader (/$bunfs/root/omp-darwin-arm64:100:22)";
  const prefix = ["/usr/bin/ffmpeg", "-hide_banner", "-loglevel", "error", "-y"];
  // Deliberately no runtime filename prefix: names alone confer no authority.
  const names = Array.from({ length: 6 }, (_, index) => `preview-work/thumb-${index}.png`);
  const sheet = "preview-work/sheet.png";
  const at = (milliseconds) => new Date(Date.UTC(2026, 8, 20) + milliseconds).toISOString();
  const allocations = names.map((output, index) => ({
    output, cwd: "/fixture", command: [...prefix, "-ss", String(index + 0.5), "-i", "/fixture/evidence/raw.webm", "-frames:v", "1", "-vf", "scale=320:-1", output],
    code: 0, sha256: `pixels-${index}`, stack, calls: [{ id: "preview", name: "read" }], pid: 100 + index, at: at(10),
  }));
  allocations.push({
    output: sheet, cwd: "/fixture",
    command: [...prefix, ...names.flatMap((name) => ["-i", name]), "-filter_complex", "[0:v][1:v][2:v][3:v][4:v][5:v]concat=n=6:v=1:a=0,tile=3x2", "-frames:v", "1", sheet],
    code: 0, sha256: "sheet-pixels", stack, calls: [{ id: "preview", name: "read" }], pid: 200, at: at(80),
  });
  const trace = {
    tools: [{ id: "preview", name: "read", arguments: { path: "evidence/raw.webm" } }],
    images: [{ toolCallId: "preview", sha256: "sheet-pixels", isError: false }],
  };
  const snapshots = [{ sequence: 1, boundary: "tool_execution_start", toolCallId: "preview", toolName: "read", at: at(0), files: base.files }];
  let state = { ...base.files };
  for (const [index, allocation] of allocations.entries()) {
    state = { ...state, [allocation.output]: { sha256: allocation.sha256 } };
    snapshots.push({ sequence: index + 2, boundary: "viewer_process_end", at: at(index === 6 ? 90 : 20 + index * 10), files: state, input: { viewerProcess: allocation } });
  }
  snapshots.push({ sequence: 9, boundary: "tool_execution_end", toolCallId: "preview", toolName: "read", at: at(100), files: base.files });
  const fixture = { allocations, trace, snapshots, final: base };
  const check = (value = fixture) => evidencePathProblems(base, value.snapshots, [], task,
    viewerTemporaryProof(value.allocations, value.trace, value.snapshots, base, value.final));
  assert.deepEqual(check(), []);
  // The native reader tiles only materialized thumbs when a seek has no frame.
  const subset = structuredClone(fixture);
  subset.allocations.splice(0, 1);
  subset.snapshots.splice(1, 1);
  for (const snapshot of subset.snapshots) delete snapshot.files[names[0]];
  subset.allocations.at(-1).command = [...prefix, ...names.slice(1).flatMap((name) => ["-i", name]),
    "-filter_complex", "[0:v][1:v][2:v][3:v][4:v]concat=n=5:v=1:a=0,tile=3x2", "-frames:v", "1", sheet];
  assert.deepEqual(check(subset), []);
  const controls = [
    ["missing thumbnail producer", (value) => value.allocations.splice(0, 1)],
    ["wrong source video", (value) => { value.allocations[0].command[8] = "/fixture/evidence/other.webm"; }],
    ["wrong scale", (value) => { value.allocations[0].command[12] = "scale=640:-1"; }],
    ["different read", (value) => { value.allocations[0].calls = [{ id: "other", name: "read" }]; }],
    ["non-runtime producer", (value) => { value.allocations[0].stack = "at arbitraryWrite"; }],
    ["producer failure", (value) => { value.allocations[0].code = 1; }],
    ["thumbnail output mismatch", (value) => { value.allocations[0].command[13] = "preview-work/other.png"; }],
    ["producer hash mismatch", (value) => { value.allocations[0].sha256 = "wrong"; }],
    ["failed read result", (value) => { value.trace.images[0].isError = true; }],
    ["wrong sheet input", (value) => { value.allocations[6].command[6] = "preview-work/unknown.png"; }],
    ["duplicate sheet input", (value) => { value.allocations[6].command[8] = names[0]; }],
    ["broken concat graph", (value) => { value.allocations[6].command[18] = "[0:v]concat=n=6:v=1:a=0,tile=3x2"; }],
    ["wrong sheet output", (value) => { value.allocations[6].command[21] = "preview-work/other-sheet.png"; }],
    ["successful thumbnail omitted from sheet", (value) => {
      value.allocations[6].command = [...prefix, ...names.slice(1).flatMap((name) => ["-i", name]),
        "-filter_complex", "[0:v][1:v][2:v][3:v][4:v]concat=n=5:v=1:a=0,tile=3x2", "-frames:v", "1", sheet];
    }],
    ["missing completion binding", (value) => { value.snapshots[1].input = {}; }],
    ["consumed after read", (value) => { value.snapshots[8].sequence = 7; }],
    ["producer completed after sheet start", (value) => { value.snapshots[1].at = at(85); }],
    ["allocation before read", (value) => { value.allocations[0].at = at(-1); }],
    ["intermediate disappears before consumption", (value) => { delete value.snapshots[7].files[names[0]]; }],
    ["intermediate changed during consumption", (value) => { value.snapshots[7].files[names[0]] = { sha256: "changed" }; }],
    ["persistent sheet", (value) => { value.final = { files: { ...base.files, [sheet]: { sha256: "sheet-pixels" } } }; }],
    ["overlapping writer", (value) => { value.snapshots.unshift({ sequence: 0, boundary: "tool_execution_start", toolCallId: "writer", toolName: "write", files: base.files }); }],
  ];
  for (const [label, mutate] of controls) {
    const value = structuredClone(fixture);
    mutate(value);
    assert.ok(check(value).length > 0, label);
  }
  const unknown = structuredClone(fixture);
  unknown.snapshots[7].files["omp-video-sheet-unknown/sheet.png"] = { sha256: "sheet-pixels" };
  assert.ok(check(unknown).some((problem) => problem.includes("omp-video-sheet-unknown/sheet.png")));
  // F_3R_AUTH_V8: OMP-resized sheet (returned sha differs from sheet allocation sha) is accepted.
  const resizedSheet = structuredClone(fixture);
  resizedSheet.trace.images[0].sha256 = "omp-resized-sheet-pixels";
  assert.deepEqual(check(resizedSheet), [], "OMP-resized sheet with different returned sha is accepted");
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
    const reservationText = "---\nstatus: in-progress\nstop_reason: none\nconsumed_rounds: 1\nlimit: 3\n---\n### Round 1\n- Reservation persisted at: this boundary before mutation.\n- Consumed count / authorized limit: 1 / 3.\n- Attempted finding IDs: IE-001.\n- Current step: repair pending.";
    const reserve = (text) => {
      const sha = hash(text);
      put(`blobs/${sha}`, text);
      return { path: "snapshots/reserved.json", sequence: 3, state: { files: { ...original.files, [`${task}/01-evidence-iteration-counter.md`]: { sha256: sha } } } };
    };
    snapshots.splice(2, 0, reserve(reservationText));
    const review = { reviewer: "test reviewer", inspectedAt: "2026-09-20T00:00:00Z", observations, reservation: { snapshot: "snapshots/reserved.json", findingId: "IE-001", round: 1, notes: "Persisted before mutation" }, final };
    const check = () => reviewProblems(dir, review, trace, snapshots, original, repaired, task);
    assert.deepEqual(check(), []);
    const pendingStates = [
      "- Current step: repair. Change only the evidenced handler.\n- Last completed step / next incomplete step: reservation / repair.",
      "- Last completed step / next incomplete step: reservation / repair.",
      "- Current step / last completed step / next incomplete step: repair / reservation / repair.",
      "- Current step: diagnose and repair. Last completed: baseline pixel inspection and reservation. Next incomplete: repair.",
      "- Current step: diagnosis and repair pending.\n- Last completed step: reservation.\n- Next incomplete step: pending repair.",
      "| Step | State | Evidence |\n| --- | --- | --- |\n| Repair | pending | Existing finding |",
      // Active-round structural forms: "reserved" prefix with three labeled lines; combined forms require
      // next incomplete step to name repair (new structural rule anchors on parts[2]).
      "- Current step: reserved repair.\n- Last completed step: baseline inspection.\n- Next incomplete step: pending repair.",
      "- Last completed step / next incomplete step: baseline inspection / repair.",
      // Delivery section forms: "baseline inspection complete" matches the baseline prefix.
      "- Current step / last completed step / next incomplete step: Repair / baseline inspection complete / Repair.",
      // Semicolon/colon-separated single line: split pattern extracts labeled sub-lines, which
      // resolve via the individual "last completed step" and "next incomplete step" handlers.
      // The combined-key handler skips (no push) when parts.length===1; sub-lines handle it.
      "- Current step / last completed step / next incomplete step: reservation complete; last completed: reservation; next incomplete: Repair",
      // Three explicit labeled lines (canonical form from template).
      "- Current step: repair pending\n- Last completed step: reservation\n- Next incomplete step: repair",
      // F5 regression: 'reservation' as current step is a valid pending-repair state
      "- Current step: reservation\n- Last completed step: baseline inspection\n- Next incomplete step: repair",
      "- Current step / last completed step / next incomplete step: reservation / baseline inspection / repair",
      // F_PRIM regressions: structural rule — any reservation/reserved/pending prose as current step
      // when next incomplete step names repair; combined slash line parsed by position.
      "- Current step / last completed step / next incomplete step: reservation persisted / reservation / repair",
      "- Current step: reserved\n- Last completed step: baseline inspection\n- Next incomplete step: repair",
      "- Current step: reservation persisted\n- Last completed step: reservation\n- Next incomplete step: repair",
      // F_NEW_PRIM regressions: last-completed-step may carry parentheticals or prose; only
      // an explicit repair-completed/done/resolved/finalized declaration is rejected.
      "- Current step: repair pending.\n- Last completed step: reservation (consumed_rounds set to 1, round 1 record persisted).\n- Next incomplete step: repair.",
      "- Current step: repair pending.\n- Last completed step: baseline inspection and reservation written to disk.\n- Next incomplete step: repair.",
      // R11 regressions: next-incomplete-step may carry parenthetical content including semicolons;
      // any mention of repair or diagnos* qualifies, regardless of surrounding annotations.
      "- Current step: repair pending.\n- Last completed step: reservation.\n- Next incomplete step: repair (app.js value += 2; check.mjs exact count).",
      "- Current step / last completed step / next incomplete step: repair pending / reservation / repair (app.js; check.mjs).",
      "- Current step: diagnose.\n- Last completed step: baseline inspection.\n- Next incomplete step: diagnose and repair (handler.js fix).",
      "| Step | State | Evidence |\n| --- | --- | --- |\n| Repair the handler | interrupted | Paused |",
      // R12 normalize regressions: parenthetical/bracketed annotations in step fields are stripped.
      "- Current step: repair pending (handler value only).\n- Last completed step: reservation.\n- Next incomplete step: repair [app.js handler].",
      "- Current step: repair pending.\n- Last completed step: reservation [confirmed].\n- Next incomplete step: repair (app.js only).",
      "- Current step / last completed step / next incomplete step: repair pending (active) / reservation (round 1) / repair.",
    ];
    for (const state of pendingStates) {
      snapshots[2] = reserve(reservationText.replace("- Current step: repair pending.", state));
      assert.deepEqual(check(), [], state);
    }
    // R12 normalize regressions: annotated consumed count and Delivery section status fields.
    const annotatedConsumption = reservationText.replace("- Consumed count / authorized limit: 1 / 3.", "- Consumed count / authorized limit: 1 / 3 (authorized at round start).");
    snapshots[2] = reserve(annotatedConsumption);
    assert.deepEqual(check(), [], "annotated consumed count '1 / 3 (...)' passes with normalize");
    const annotatedDelivery = reservationText + "\n\n## Delivery and known limits\n- Status: in-progress (active round).\n- Current step: repair pending.\n- Stop reason: none.";
    snapshots[2] = reserve(annotatedDelivery);
    assert.deepEqual(check(), [], "annotated status 'in-progress (active round)' in Delivery section passes with normalize");
    snapshots[2] = reserve(reservationText);
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
    // F4 regression: initial frame filename must contain 'initial'
    {
      const origFrame = observations[0].frame;
      const origFrameSha256 = observations[0].frameSha256;
      const origToolArg = trace.tools[0].arguments.path;
      const badFrame = `${path.dirname(origFrame)}/01-test-start.png`;
      put(badFrame, "baseline initial pixels");
      observations[0].frame = badFrame;
      observations[0].frameSha256 = hash("baseline initial pixels");
      trace.tools[0].arguments.path = badFrame.slice("task/".length);
      assert.ok(check().some((p) => p.toLowerCase().includes("initial")), "F4: non-initial frame filename must fail");
      observations[0].frame = origFrame;
      observations[0].frameSha256 = origFrameSha256;
      trace.tools[0].arguments.path = origToolArg;
    }
    // F4 regression: initial frame must be before first click's videoTime when capture.actions is present
    {
      const baselineCapture = JSON.parse(fs.readFileSync(path.join(dir, "task/evidence/baseline/capture.json"), "utf8"));
      const actions = [{ flow: "initial", videoTime: 1.0 }, { flow: "increment", videoTime: 2.0 }, { flow: "reset", videoTime: 3.0 }];
      put("task/evidence/baseline/capture.json", JSON.stringify({ ...baselineCapture, actions }));
      assert.deepEqual(check(), [], "initial frame before first click passes");
      observations[0].timestamp = 2.5;
      assert.ok(check().some((p) => p.includes("initial") || p.includes("first click")), "F4: frame at/after first click must fail");
      observations[0].timestamp = 0.5;
      put("task/evidence/baseline/capture.json", JSON.stringify(baselineCapture));
    }
    // F_CONT regressions: video+timestamp frame identity form (both forms are equivalent)
    {
      const savedObs1 = { ...observations[1] }; // baseline-increment (PNG form)
      const savedTool1 = { ...trace.tools[1] };
      const videoPath = observations[1].media; // "task/evidence/baseline/raw.webm"
      // Video+timestamp form: frame = video path, frameSha256 = OMP-returned image hash from trace.
      trace.tools[1] = { id: "2", arguments: { path: videoPath.slice("task/".length) + ":2.0s" } };
      const videoObs1 = { ...savedObs1, frame: videoPath, frameSha256: trace.images[1].sha256, timestamp: 2.0 };
      observations[1] = videoObs1;
      assert.deepEqual(check(), [], "F_CONT: video+timestamp form must pass");
      // Mismatched frameSha256: wrong hash for video form must fail.
      observations[1] = { ...videoObs1, frameSha256: "deadbeef0000" };
      assert.ok(check().some((p) => p.includes("OMP") || p.includes("hash")), "F_CONT: video frame with wrong frameSha256 must fail");
      // Restore correct video obs1 before inner sub-blocks.
      observations[1] = videoObs1;
      // Initial frame via video form: timestamp before first click passes; at/after first click fails.
      // During this sub-block, obs[1] uses PNG form so its action window does not interfere.
      {
        const bCapture = JSON.parse(fs.readFileSync(path.join(dir, "task/evidence/baseline/capture.json"), "utf8"));
        const actionsV = [{ flow: "initial", videoTime: 1.0 }, { flow: "increment", videoTime: 2.5 }];
        put("task/evidence/baseline/capture.json", JSON.stringify({ ...bCapture, actions: actionsV }));
        const videoInit = observations[0].media;
        const savedObs0 = { ...observations[0] };
        const savedTool0 = { ...trace.tools[0] };
        // Use PNG form for obs[1] AND restore its tool so the PNG path link check passes.
        observations[1] = savedObs1;
        trace.tools[1] = savedTool1;
        trace.tools[0] = { id: "1", arguments: { path: videoInit.slice("task/".length) + ":0.5s" } };
        observations[0] = { ...savedObs0, frame: videoInit, frameSha256: trace.images[0].sha256, timestamp: 0.5 };
        assert.deepEqual(check(), [], "F_CONT: video initial frame before first click passes");
        observations[0] = { ...savedObs0, frame: videoInit, frameSha256: trace.images[0].sha256, timestamp: 3.0 };
        assert.ok(check().some((p) => p.includes("initial") || p.includes("first click") || p.includes("timestamp")), "F_CONT: video initial frame at/after first click must fail");
        observations[0] = savedObs0;
        trace.tools[0] = savedTool0;
        trace.tools[1] = { id: "2", arguments: { path: videoPath.slice("task/".length) + ":2.0s" } };
        observations[1] = videoObs1; // restore video form for next sub-block
        put("task/evidence/baseline/capture.json", JSON.stringify(bCapture));
      }
      // Non-initial video frame: timestamp before action window must fail; at/after passes.
      {
        const bCapture2 = JSON.parse(fs.readFileSync(path.join(dir, "task/evidence/baseline/capture.json"), "utf8"));
        const actionsV2 = [{ flow: "initial", videoTime: 1.0 }, { flow: "increment", videoTime: 2.5 }];
        put("task/evidence/baseline/capture.json", JSON.stringify({ ...bCapture2, actions: actionsV2 }));
        observations[1] = { ...videoObs1, timestamp: 0.5 };
        assert.ok(check().some((p) => p.includes("timestamp") || p.includes("action")), "F_CONT: video non-initial before action window must fail");
        observations[1] = { ...videoObs1, timestamp: 3.0 };
        assert.deepEqual(check(), [], "F_CONT: video non-initial at/after action window passes");
        put("task/evidence/baseline/capture.json", JSON.stringify(bCapture2));
      }
      // Restore
      observations[1] = savedObs1;
      trace.tools[1] = savedTool1;
    }
    // F_LD_FRAME_V8 regression: PNG frame outside the recording session directory is accepted;
    // media must remain in the session; binding is by call-argument path and hash.
    {
      const outOfSessionFrame = `task/evidence/extracted/baseline-increment.png`;
      const savedObs2 = { ...observations[1] };
      const savedTool2 = { ...trace.tools[1] };
      const frameSha2 = put(outOfSessionFrame, "baseline increment pixels");
      trace.tools[1] = { id: "2", arguments: { path: outOfSessionFrame.slice("task/".length) } };
      trace.images[1] = { line: 2, toolCallId: "2", sha256: frameSha2 };
      observations[1] = { ...savedObs2, frame: outOfSessionFrame, frameSha256: frameSha2 };
      assert.deepEqual(check(), [], "F_LD_FRAME_V8: PNG frame outside session dir accepted; media still in session");
      // Media outside session still fails.
      const savedMedia = observations[1].media;
      observations[1] = { ...observations[1], media: outOfSessionFrame, mediaSha256: frameSha2 };
      assert.ok(check().some((p) => p.includes("session")), "media outside session dir is rejected");
      observations[1] = savedObs2;
      trace.tools[1] = savedTool2;
      trace.images[1] = { line: 2, toolCallId: "2", sha256: savedObs2.frameSha256 };
    }
    for (const invalid of [
      reservationText.replace("consumed_rounds: 1", "consumed_rounds: 0"),
      reservationText.replace("status: in-progress", "status: passed"),
      reservationText.replace("limit: 3", "limit: 4"),
      reservationText.replace("repair pending", "repair completed"),
      reservationText.replace("stop_reason: none", "stop_reason: success"),
      reservationText.replace("### Round 1", "### Round 2"),
      reservationText.replace("IE-001", "IE-002"),
      reservationText.replace("1 / 3.", "0 / 3."),
      reservationText.replace("- Current step: repair pending.", "Historical note: repair pending."),
      reservationText.replace("### Round 1", "### Round 1 historical reservation"),
      `${reservationText}\n### Round 1 repair completed\n- Last completed step / next incomplete step: repair / checks.`,
      `${reservationText}\n- Last completed step / next incomplete step: repair / checks.`,
      `${reservationText}\n| Step | State | Evidence |\n| --- | --- | --- |\n| Repair | completed | Done |`,
      `${reservationText}\n## Delivery and known limits\n- Current step / last completed step / next incomplete step: checks / repair / checks.`,
      `${reservationText}\n- Current step: repair. Last completed: repair. Next incomplete: checks.`,
      reservationText.replace("repair pending", "diagnose and repair completed"),
      `${reservationText}\n- Attempted finding IDs: IE-002.`,
      // F5 regression: 'reservation' as current step rejected when next incomplete step is not repair
      reservationText.replace("- Current step: repair pending.", "- Current step: reservation\n- Last completed step: baseline inspection\n- Next incomplete step: checks"),
      reservationText.replace("- Current step: repair pending.", "- Current step / last completed step / next incomplete step: reservation / baseline inspection / checks"),
      // F_PRIM regressions: "repair completed" in any field is a conflict even when next=repair
      reservationText.replace("- Current step: repair pending.", "- Current step: repair completed.\n- Last completed step: reservation.\n- Next incomplete step: repair."),
      reservationText.replace("- Current step: repair pending.", "- Current step / last completed step / next incomplete step: repair completed / reservation / repair."),
      `${reservationText}\n| Step | State | Evidence |\n| --- | --- | --- |\n| Repair | done | Confirmed |`,
      `${reservationText}\n## Delivery and known limits\n- Current step: repair resolved. Last completed: reservation.`,
      // F_NEW_PRIM: last-completed-step explicitly declaring repair completed/done is rejected
      reservationText.replace("- Current step: repair pending.", "- Current step: repair pending.\n- Last completed step: repair completed.\n- Next incomplete step: repair."),
      reservationText.replace("- Current step: repair pending.", "- Current step: repair pending.\n- Last completed step: repair done and verified.\n- Next incomplete step: repair."),
      // R11: next-incomplete-step without any repair or diagnos* mention is rejected
      reservationText.replace("- Current step: repair pending.", "- Current step: repair pending.\n- Last completed step: reservation.\n- Next incomplete step: capture the baseline recording."),
      // R11: terminal repair declaration in table State column is rejected
      `${reservationText}\n| Step | State | Evidence |\n| --- | --- | --- |\n| Repair the handler | finalized | Done |`,
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

test("normalize strips parenthetical, bracketed, quoted, and mixed label forms", () => {
  assert.strictEqual(normalize("increment (Add one from zero)"), "increment", "parenthetical stripped");
  assert.strictEqual(normalize("reset (Reset from nonzero)"), "reset", "parenthetical stripped");
  assert.strictEqual(normalize("increment [primary flow]"), "increment", "brackets stripped");
  assert.strictEqual(normalize("'increment'"), "increment", "surrounding quotes stripped");
  assert.strictEqual(normalize("`Add one`"), "add one", "surrounding backticks stripped");
  assert.strictEqual(normalize("increment."), "increment", "trailing period stripped");
  assert.strictEqual(normalize("  Increment  "), "increment", "whitespace collapsed and lowercased");
  assert.strictEqual(normalize("repair pending (app.js value += 2)."), "repair pending", "multi-punctuation trailing stripped");
  assert.strictEqual(normalize("1 / 3 (authorized at round start)."), "1 / 3", "annotated count stripped");
  assert.strictEqual(normalize("in-progress (active round)."), "in-progress", "annotated status stripped");
});

test("counterFlowCoverage resolves parenthetical, quoted, and mixed label forms (F_COVERAGE_PARSE_V8)", () => {
  const make = (charter, coverage) => `\n### Targets and regression charter\n\n${charter}\n\n## Final coverage\n\n${coverage}\n`;
  const charRow = (id, action) => `| ${id} | target | zero | ${action} | expected: 1 | spec.md | yes |`;
  const covRow = (id, result) => `| ${id} | target | rev | evidence | checks | ${result} | reason |`;

  // Bare forms (baseline)
  assert.ok(counterFlowCoverage(make(charRow("F-INC", "Add one"), covRow("increment", "failed") + "\n" + covRow("reset", "passed")), { increment: "failed", reset: "passed" }).increment);

  // F_COVERAGE_PARSE_V8: parenthetical in cells[0] of coverage table
  const parentheticalCoverage = covRow("increment (Add one from zero)", "failed") + "\n" + covRow("reset (Reset from nonzero)", "passed");
  const r1 = counterFlowCoverage(make(charRow("F-INC", "Add one"), parentheticalCoverage), { increment: "failed", reset: "passed" });
  assert.ok(r1.increment, "increment (Add one from zero) resolves to increment");
  assert.ok(r1.reset, "reset (Reset from nonzero) resolves to reset");

  // Quoted flow name in charter action column
  const quotedAction = charRow("F-INC", "'Add one'");
  const r2 = counterFlowCoverage(make(quotedAction, covRow("F-INC", "failed") + "\n" + covRow("reset", "passed")), { increment: "failed", reset: "passed" });
  assert.ok(r2.increment, "quoted 'Add one' action resolves to increment");

  // Annotated result column: 'failed (coverage missing)' normalizes to 'failed'
  const annotatedResult = covRow("increment", "failed (coverage missing)") + "\n" + covRow("reset", "passed");
  const r3 = counterFlowCoverage(make(charRow("F-INC", "Add one"), annotatedResult), { increment: "failed", reset: "passed" });
  assert.ok(r3.increment, "annotated result 'failed (coverage missing)' recognized as failed");

  // Bracketed annotation in charter row id
  const bracketedId = charRow("F-INC [primary]", "Add one");
  const r4 = counterFlowCoverage(make(bracketedId, covRow("F-INC", "failed") + "\n" + covRow("reset", "passed")), { increment: "failed", reset: "passed" });
  assert.ok(r4.increment, "bracketed ID annotation F-INC [primary] still maps to F-INC");

  // Mixed: parenthetical in charter id AND coverage id AND result column
  const mixedCharter = charRow("F-INC (flow 1)", "Add one");
  const mixedCoverage = covRow("F-INC (flow 1)", "failed (see findings)") + "\n" + covRow("reset (from nonzero)", "passed");
  const r5 = counterFlowCoverage(make(mixedCharter, mixedCoverage), { increment: "failed", reset: "passed" });
  assert.ok(r5.increment, "mixed: parenthetical charter id and annotated result pass");
  assert.ok(r5.reset, "mixed: parenthetical coverage reset passes");
});

// A saved reservation, in the shape the installed template produces.
function receiptText(overrides = {}) {
  const fields = { type: "evidence-iteration", status: "in-progress", stop_reason: "none", consumed_rounds: "1", limit: "1", ...overrides };
  return `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n")}\n---\n\n## Round 1\n\n- Attempted finding IDs: IE-001.\n- Reservation persisted before any edit: yes.\n`;
}

const delegated = { round: 1, limit: 1, findingId: "IE-001" };
const delegatedReceipt = "01-evidence-iteration-counter-no-progress.md";

test("a terminal receipt is not a reservation for the delegated worker (F_NP_RESERVATION_V9)", () => {
  assert.deepEqual(reservationCheckpoint(receiptText(), delegated.round, delegated.limit, delegated.findingId), []);
  const decision = (text) => reservationGateDecision([{ receipt: delegatedReceipt, text }], delegated);
  assert.equal(decision(receiptText()).approved.receipt, delegatedReceipt);
  // The V9 shape: the subject wrote the final failed receipt, consumed_rounds already at 1.
  assert.ok(decision(receiptText({ status: "failed" })).candidates[0].problems.includes("status is failed, not in-progress"));
  for (const invalid of [
    receiptText({ status: "failed" }),
    receiptText({ status: "passed" }),
    receiptText({ stop_reason: "no-progress" }),
    receiptText({ consumed_rounds: "0" }),
    receiptText({ limit: "3" }),
    receiptText().replace("## Round 1", "## Round 1 checks completed"),
    receiptText().replace("- Attempted finding IDs: IE-001.", "- Attempted finding IDs: IE-002."),
    receiptText().replace("## Round 1\n\n", ""),
    receiptText().replace("Reservation persisted before any edit: yes.", "Pre-round unresolved set: IE-001."),
  ]) assert.equal(decision(invalid).approved, null, invalid);
});

test("the disclosed worker command starts the real worker only after a saved checkpoint", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-delegation-"));
  try {
    const taskDir = path.join(dir, ".agents", "tasks", "counter-no-progress");
    const out = path.join(dir, "worker");
    fs.mkdirSync(taskDir, { recursive: true });
    fs.mkdirSync(out, { recursive: true });
    const receipt = path.join(taskDir, delegatedReceipt);
    const proof = path.join(dir, "worker-ran.txt");
    const launcher = path.join(dir, "bounded-worker.mjs");
    fs.writeFileSync(launcher, boundedWorkerLauncher({
      module: new URL("../evals/worker-gate.mjs", import.meta.url).href,
      taskDir,
      out,
      worker: [process.execPath, "-e", `require("node:fs").writeFileSync(${JSON.stringify(proof)}, "edited")`],
      repo: dir,
      ...delegated,
    }));
    const run = () => spawnSync(process.execPath, [launcher], { cwd: dir, encoding: "utf8" });
    const attempts = () => fs.readFileSync(path.join(out, "delegation.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));

    // Nothing saved yet: refused, no worker, and no reservation invented on the subject's behalf.
    let result = run();
    assert.equal(result.status, 3);
    assert.ok(!fs.existsSync(proof));
    assert.match(result.stderr, /no NN-evidence-iteration-\*\.md receipt saved/);
    assert.equal(attempts().at(-1).allowed, false);

    // V9's one-write terminal receipt: consumed_rounds is right, the checkpoint still is not.
    fs.writeFileSync(receipt, receiptText({ status: "failed", stop_reason: "no-progress" }));
    result = run();
    assert.equal(result.status, 3);
    assert.ok(!fs.existsSync(proof), "no worker runs against a terminal receipt");
    assert.match(result.stderr, /status is failed, not in-progress/);
    assert.equal(attempts().at(-1).receipt, null);

    // The saved in-progress reservation admits the real worker and binds the approved bytes.
    const reservation = receiptText();
    fs.writeFileSync(receipt, reservation);
    result = run();
    assert.equal(result.status, 0);
    assert.equal(fs.readFileSync(proof, "utf8"), "edited");
    const approved = attempts().at(-1);
    assert.equal(approved.allowed, true);
    assert.equal(approved.receipt, delegatedReceipt);
    assert.equal(approved.reservationSha256, createHash("sha256").update(Buffer.from(reservation)).digest("hex"));
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, "execution.json"), "utf8")).code, 0);

    // One worker action only: the existing guard survives the gate.
    result = run();
    assert.notEqual(result.status, 3);
    assert.match(result.stderr, /One worker action only/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
