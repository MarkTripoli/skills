import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { dirtyProblems, expectedInstalledSkills, evidencePathProblems, inspectEvidenceTrace, isEvidenceScenario, viewerTemporaryProof, reviewProblems } from "../evals/iterate-evidence.mjs";
import { boundedWorkerLauncher, reservationCheckpoint, reservationGateDecision } from "../evals/worker-gate.mjs";
import { counterFlowCoverage, normalize } from "../evals/evidence-flows.mjs";
import { spawnSync } from "node:child_process";
import { viewerToolDenial } from "../evals/iterate-evidence-hooks.mjs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
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

test("source repairs remain allowed but task artifact commits are forbidden", () => {
  const receipt = `${task}/01-evidence-iteration-counter-evidence.md`;
  const repaired = { boundary: "tool_execution_end", files: { ...base.files, "app.js": { sha256: "repaired" }, [receipt]: { sha256: "receipt" } } };
  assert.deepEqual(evidencePathProblems(base, [repaired], [
    { sha: "source", subject: "fix: increment correctly", paths: ["app.js"] },
  ], task), []);
  assert.ok(evidencePathProblems(base, [repaired], [{ sha: "receipt", subject: "docs: save inspected repair", paths: [receipt] }], task).some((problem) => problem.includes("must not be committed")));
  assert.ok(evidencePathProblems(base, [repaired], [{ sha: "mixed", subject: "fix: repair and save", paths: ["app.js", receipt] }], task).length > 0);
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
    const reservationText = "---\nstatus: in-progress\nstop_reason: none\nconsumed_rounds: 1\nlimit: none\n---\n### Round 1\n- Reservation persisted at: this boundary before mutation.\n- Consumed count / authorized limit: 1 / none.\n- Attempted finding IDs: IE-001.\n- Current step: repair pending.";
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
    const annotatedConsumption = reservationText.replace("- Consumed count / authorized limit: 1 / none.", "- Consumed count / authorized limit: 1 / none (authorized at round start).");
    snapshots[2] = reserve(annotatedConsumption);
    assert.deepEqual(check(), [], "annotated consumed count '1 / none (...)' passes with normalize");
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
      reservationText.replace("limit: none", "limit: 4"),
      reservationText.replace("limit: none", "limit: 3"),
      reservationText.replace("repair pending", "repair completed"),
      reservationText.replace("stop_reason: none", "stop_reason: success"),
      reservationText.replace("### Round 1", "### Round 2"),
      reservationText.replace("IE-001", "IE-002"),
      reservationText.replace("1 / none.", "0 / none."),
      reservationText.replace("1 / none.", "1 / 3."),
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

test("primary scenario rejects a receipt that records a repair limit by default", () => {
  const artifact = { fm: { type: "evidence-iteration", limit: "none" } };
  assert.deepEqual(primaryScenario.phases[0].check({ artifact }), []);
  for (const limit of ["3", "4", "0"]) {
    artifact.fm.limit = limit;
    assert.ok(primaryScenario.phases[0].check({ artifact }).length, limit);
  }
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
  assert.strictEqual(normalize("1 / none (authorized at round start)."), "1 / none", "annotated count stripped");
  assert.strictEqual(normalize("in-progress (active round)."), "in-progress", "annotated status stripped");
});

test("counterFlowCoverage keeps a row whose cell holds an escaped pipe", () => {
  const make = (charter, coverage) => `\n### Targets and regression charter\n\n${charter}\n\n## Final coverage\n\n${coverage}\n`;
  const charRow = (id, action) => `| ${id} | target | zero | ${action} | expected: 1 \\| 2 | spec.md | yes |`;
  const covRow = (id, result) => `| ${id} | target | rev | evidence a \\| b | checks | ${result} | reason |`;
  const got = counterFlowCoverage(make(charRow("F-INC", "Add one"), covRow("F-INC", "failed")), { increment: "failed", reset: "passed" });
  assert.ok(got.increment, "the escaped pipe does not shift the result column");
  assert.deepEqual(got.results, ["failed"]);
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

test("counterFlowCoverage recognizes action-labelled flow IDs without weakening conflicts (F_COVERAGE_PARSE_R16)", () => {
  const make = (charter, coverage) => `\n### Targets and regression charter\n\n${charter}\n\n## Final coverage\n\n${coverage}\n`;
  const charRow = (id, action) => `| ${id} | target | zero | ${action} | expected | spec.md | yes |`;
  const covRow = (id, result) => `| ${id} | target | rev | evidence | checks | ${result} | reason |`;

  const observed = counterFlowCoverage(make(
    `${charRow("F-INC Add one once from zero", "Add one once from zero")}\n${charRow("F-RESET Reset from nonzero", "Reset from nonzero")}`,
    `${covRow("F-INC Add one once from zero", "failed")}\n${covRow("F-RESET Reset from nonzero", "passed")}`,
  ), { increment: "failed", reset: "passed" });
  assert.ok(observed.increment, "F-INC Add one once from zero maps to increment");
  assert.ok(observed.reset, "F-RESET Reset from nonzero maps to reset");

  const equivalent = counterFlowCoverage(make(
    `${charRow("F-INC add one from zero once", "Click Add one from zero once")}\n${charRow("F-RESET reset from nonzero", "Click Reset from nonzero")}`,
    `${covRow("F-INC add one from zero once", "failed")}\n${covRow("F-RESET reset from nonzero", "passed")}`,
  ), { increment: "failed", reset: "passed" });
  assert.ok(equivalent.increment, "equivalent Add one from zero once phrasing maps to increment");
  assert.ok(equivalent.reset, "equivalent Reset from nonzero phrasing maps to reset");

  const conflict = counterFlowCoverage(make(
    charRow("F-INC Add one once from zero; Reset from nonzero", "Add one once from zero"),
    covRow("F-INC Add one once from zero", "failed"),
  ), { increment: "failed", reset: "passed" });
  assert.equal(conflict.increment, false, "mixed increment/reset semantics still fail closed");
  assert.equal(conflict.reset, false, "conflict prevents reset coverage too");
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







test("the research rate-limit check accepts abbreviated citations and still wants the pointer and the exact number", async () => {
  const { researchPhases } = await import("../evals/acme-chain.mjs");
  const research = researchPhases("create-plan").find((phase) => phase.skill === "create-research");
  const endpoint = "The incidents endpoint is /incidents (docs/external/acme-status-api.md:20).\n\nA 429 carries Retry-After.";
  const problems = (limit) => research.check({ artifact: { text: `src/channels/index.mjs registers channels.\n\n${limit}\n\n${endpoint}` } });
  const rate = (result) => (Array.isArray(result) ? result : [result]).filter(Boolean).filter((line) => /rate limit/.test(line));
  assert.deepEqual(rate(problems("| Rate limits | 60 req/min per token (docs/external/acme-status-api.md:11) |")), []);
  assert.deepEqual(rate(problems("| Rate limits | 60/min per token | docs/external/acme-status-api.md:11 |")), []);
  assert.deepEqual(rate(problems("The limit is 60 requests per minute per token, see acme-status-api.md.")), []);
  const uncited = rate(problems("The limit is 60 requests per minute per token.\n\nSee acme-status-api.md."));
  assert.equal(uncited.length, 1);
  assert.match(uncited[0], /states the 60 requests per minute rate limit/);
  assert.equal(rate(problems("The limit is 60 requests per second (docs/external/acme-status-api.md:11).")).length, 1);
  assert.equal(rate(problems("The limit is 160 requests per minute (docs/external/acme-status-api.md:11).")).length, 1);
});

// Recorded upstream DAG shapes are regression inputs, not evidence of a live run here.
const RECORDED_DAGS = [
  "flowchart TD\n  rq[\"create-research-questions: done\"] --> research[\"create-research: done\"]\n  research --> design[\"create-design-discussion: saved<br/>gate: human approval, open decisions\"]\n  design --> plan[\"create-plan<br/>gate: human approval\"]\n  plan --> baseline[\"baseline: record-evidence --baseline<br/>unattended\"]\n  baseline --> implement[\"implement-plan<br/>unattended\"]\n  implement --> verify[\"verify-implementation<br/>unattended\"]\n  verify --> review[\"review loop<br/>unattended\"]\n  review -->|repairs needed| repair[\"review fixes + verification<br/>unattended\"]\n  repair --> review\n  review -->|accepted| evidence[\"record-evidence<br/>unattended\"]\n  evidence --> iterate[\"iterate-evidence<br/>unattended\"]\n  iterate --> pr[\"describe-pr<br/>unattended\"]",
  "flowchart TD\n  rq[\"create-research-questions: done\"] --> research[\"create-research: done\"]\n  research --> design[\"create-design-discussion: saved<br/>gate: plan, human decisions and approval\"]\n  design --> plan[\"create-plan<br/>gate: plan, human approval\"]\n  plan --> baseline[\"record-evidence --baseline: unattended\"]\n  baseline --> impl[\"implement-plan: unattended\"]\n  impl --> verify[\"verify-implementation: unattended\"]\n  verify --> review[\"review loop: unattended review, repairs, rechecks\"]\n  review --> evidence[\"record-evidence: unattended\"]\n  evidence --> iteration[\"iterate-evidence: unattended\"]\n  iteration --> pr[\"describe-pr: unattended\"]",
  "flowchart TD\n  r[\"create-research: upstream replaced by accepted RFC, not run\"]\n  p[\"create-prd: upstream replaced by accepted RFC, not run; normal gate: plan\"]\n  s[\"gather-sources: done\"]\n  t[\"create-tdd: conversion saved; gate: plan, human approval\"]\n  plan[\"create-plan; gate: plan, human approval\"]\n  b[\"baseline: record-evidence --baseline; unattended\"]\n  i[\"implement-plan; unattended\"]\n  v[\"verify-implementation; unattended\"]\n  review[\"review loop; unattended\"]\n  record[\"record-evidence; unattended\"]\n  inspect[\"iterate-evidence; unattended\"]\n  pr[\"describe-pr; unattended\"]\n  r -.-> p\n  p -.-> t\n  s --> t\n  t --> plan --> b --> i --> v --> review\n  review -->|repairs and reverification| i\n  review -->|accepted| record --> inspect --> pr",
];

test("the full-with-sources design check reads the Execution DAG in the template's form only", async () => {
  const { default: scenario } = await import("../evals/scenarios/full-with-sources.mjs");
  const phase = scenario.phases.find((p) => p.skill === "create-design-discussion");
  const doc = (body) => `### Design Questions\n\n#### Where does the token secret go?\n\nA 429 carries Retry-After. Recommendation: A.\n\nUse src/channels/acme-status.mjs.\n\n### Execution DAG\n\n\`\`\`mermaid\n${body}\n\`\`\`\n\n## Human Review\n`;
  const problems = (body) => [phase.check({ artifact: { text: doc(body) } })].flat(Infinity).filter(Boolean).filter((line) => /Execution DAG/.test(line));
  const outOfForm = (body) => problems(body).filter((line) => line.includes("outside the template's form"));
  const rawProblems = (text) => [phase.check({ artifact: { text } })].flat(Infinity).filter(Boolean).filter((line) => /Execution DAG/.test(line));
  const tail = '  f --> g["iterate-evidence"] --> h["describe-pr"]';
  const chain = (capture) => `flowchart TD\n  a["create-design-discussion"] --> b["create-plan"]\n  b --> c["baseline<br/>/record-evidence --baseline"] --> d["implement-plan"] --> e["verify-implementation"]\n  e --> f["${capture}"]\n${tail}`;

  const mustPass = {
    "template form": chain("record-evidence"),
    "gate label": chain("record-evidence<br/>gate: none"),
    "unattended label": chain("record-evidence<br/>unattended"),
    "unattended colon": chain("record-evidence: unattended"),
    "upper case": chain("RECORD-EVIDENCE"),
    "graph LR": chain("record-evidence").replace("flowchart TD", "graph LR"),
    "flowchart BT": chain("record-evidence").replace("flowchart TD", "flowchart BT"),
    "blank lines": chain("record-evidence").replace("\n  b -->", "\n\n  b -->"),
    "dotted arrow": chain("record-evidence").replace("e --> f[", "e -.-> f["),
    "edge label": chain("record-evidence").replace("e --> f[", "e -->|checks pass| f["),
    "edge label and dotted arrow": chain("record-evidence").replace("e --> f[", "e -.->|later| f["),
    "bare reuse": 'flowchart TD\n  cap["record-evidence"]\n  a["create-design-discussion"] --> b["create-plan"] --> cap --> g["iterate-evidence"] --> h["describe-pr"]',
    "spaced edge label": chain("record-evidence").replace("e --> f[", "e --> |checks pass| f["),
    "arrow inside a quoted label": chain("record-evidence (after review --> fixes)"),
    "dotted arrow inside a quoted label": chain("record-evidence (after review -.-> fixes)"),
    "bare id defined earlier on the same line": 'flowchart TD\n  a["create-design-discussion"] --> cap["record-evidence"] --> cap --> g["iterate-evidence"] --> h["describe-pr"]',
    "same label twice": 'flowchart TD\n  a["create-design-discussion"] --> c["record-evidence"] --> g["iterate-evidence"] --> h["describe-pr"]\n  c["record-evidence"] --> g',
    "inline definitions": 'flowchart TD\n  a["create-design-discussion"] --> b["create-plan"] --> c["record-evidence"] --> g["iterate-evidence"] --> h["describe-pr"]',
    "baseline node beside the capture node": chain("record-evidence"),
    "label with brackets and arrow words": chain("record-evidence [unattended]"),
    "indented lines": chain("record-evidence").replaceAll("\n  ", "\n      "),
    ...Object.fromEntries(RECORDED_DAGS.map((dag, i) => [`recorded DAG ${i + 1}`, dag])),
  };
  for (const [what, body] of Object.entries(mustPass)) {
    assert.deepEqual(problems(body), [], what);
  }

  const baselineLabels = ["record-evidence<br/>--baseline", "record-evidence: --baseline", "record-evidence (--baseline)", "record-evidence<br/>(--baseline)", "record-evidence: (--baseline)", "record-evidence : ( --baseline)", "record-evidence<br/>: (<br/>--baseline)", "record-evidence (<br />: --baseline", "record-evidence `--baseline`", "record-evidence [--baseline]", "record-evidence (baseline)", "record-evidence<br/>baseline", "baseline: record-evidence", "RECORD-EVIDENCE --BASELINE", "record-evidence  --baseline", "/record-evidence --baseline", "record-evidence\\n--baseline"];
  for (const label of baselineLabels) assert.equal(problems(chain(label)).length, 1, label);
  const mustFail = {
    "no capture node": chain("record-evidence").replace('e --> f["record-evidence"]', 'e --> f["verify-again"]'),
    "no iterate-evidence": chain("record-evidence").replace("iterate-evidence", "inspect"),
    "no describe-pr": chain("record-evidence").replace("describe-pr", "publish"),
    "edge label only": chain("verify-again").replace("e --> f[", 'e -->|record-evidence| f['),
    "relabelled id": `${chain("record-evidence")}\n  f["capture (baseline)"]`,
    "relabelled id first": chain("capture (baseline)").replace("e --> f[", 'f["record-evidence"]\n  e --> f['),
    "greedy edge label": `${chain("record-evidence")}\n  e -->|x| f["baseline"] -->|y| g`,
    "relabelled away": `${chain("record-evidence")}\n  f["implement-plan"]`,
    "other label, then a record-evidence label": `${chain("implement-plan")}\n  f["record-evidence"]`,
    "baseline and record-evidence label, then a clean record-evidence label": `${chain("record-evidence --baseline")}\n  f["record-evidence"]`,
    "baseline label then record-evidence label": chain("record-evidence").replace("e --> f[", 'f["baseline"]\n  e --> f['),
    "record-evidence label then baseline label": `${chain("record-evidence")}\n  f["baseline"]`,
  };
  for (const [what, body] of Object.entries(mustFail)) assert.ok(problems(body).length >= 1, what);

  const outside = {
    "round shape": chain("record-evidence").replace('f["record-evidence"]', 'f(("record-evidence"))'),
    "rhombus": chain("record-evidence").replace('f["record-evidence"]', 'f{"record-evidence"}'),
    "asymmetric": chain("record-evidence").replace('f["record-evidence"]', 'f>"record-evidence"]'),
    "slash shape": chain("record-evidence").replace('f["record-evidence"]', 'f[/"record-evidence"/]'),
    "unquoted label": chain("record-evidence").replace('f["record-evidence"]', "f[record-evidence]"),
    "class suffix": `${chain("record-evidence")}\n  f["record-evidence"]:::done`,
    "@{ label }": chain("record-evidence").replace('f["record-evidence"]', 'f@{ shape: rect, label: "record-evidence" }'),
    "comment": `${chain("record-evidence")}\n  %% record-evidence comes later`,
    "subgraph": `${chain("record-evidence")}\n  subgraph s\n  end`,
    "style line": `${chain("record-evidence")}\n  style f fill:#eee`,
    "class line": `${chain("record-evidence")}\n  class f done`,
    "thick arrow": `${chain("record-evidence")}\n  a ==> b`,
    "ampersand": `${chain("record-evidence")}\n  a & b --> c`,
    "semicolon": `${chain("record-evidence")}\n  a --> b; b --> c`,
    "multi-line label": chain("record-evidence").replace('f["record-evidence"]', 'f["record-evidence\n--baseline"]'),
    "bare record_evidence id": chain("verify-again").replace("e --> f[", "e --> record_evidence\n  e --> f["),
    "hyphenated id": `${chain("record-evidence")}\n  e --> my-id["x"]`,
    "bare id with a hyphen": `${chain("verify-again")}\n  e --> record-evidence\n  --baseline --> g`,
    "undefined bare id": `${chain("record-evidence")}\n  e --> nothing`,
    "forward bare id": chain("record-evidence").replace("flowchart TD\n", "flowchart TD\n  a --> later\n").replace("e --> f[", 'e --> later["x"]\n  e --> f['),
    "space before the label bracket": chain("record-evidence").replace('f["record-evidence"]', 'f ["record-evidence"]'),
    "trailing comment text": `${chain("record-evidence")}\n  e --> f %% later`,
    "unquoted relabel": `${chain("record-evidence")}\n  f[baseline]`,
    "in-form text on the closing fence line": `${chain("record-evidence")}\n  g --> f["x"]\x60\x60\x60`,
    "plain line": `${chain("record-evidence")}\n  a --- b`,
    "open arrow": `${chain("record-evidence")}\n  a --x b`,
    "circle arrow": `${chain("record-evidence")}\n  a --o b`,
    "dotted line": `${chain("record-evidence")}\n  a -.- b`,
    "invisible link": `${chain("record-evidence")}\n  a ~~~ b`,
    "bidirectional": `${chain("record-evidence")}\n  a <--> b`,
    "dotted edge text, spaced": `${chain("record-evidence")}\n  a -. x .-> b`,
    "hexagon quoted": `${chain("record-evidence")}\n  a{{"x"}}`,
    "round quoted": `${chain("record-evidence")}\n  a("x")`,
    "classDef line outside": `${chain("record-evidence")}\n  classDef done fill:#eee`,
    "click line outside": `${chain("record-evidence")}\n  click f href "https://x"`,
    "linkStyle line": `${chain("record-evidence")}\n  linkStyle 0 stroke:#f00`,
    "accTitle": `${chain("record-evidence")}\n  accTitle: x`,
    "accDescr": `${chain("record-evidence")}\n  accDescr: x`,
    "frontmatter": `---\ntitle: x\n---\n${chain("record-evidence")}`,
    ...Object.fromEntries(["TB", "BT", "RL", "LR", "TD"].map((d) => [`direction ${d} in a label`, chain("record-evidence").replace('f["record-evidence"]', `f["record-evidence direction ${d}"]`)])),
    ...Object.fromEntries(["TB", "BT", "RL", "LR", "TD"].map((d) => [`bare direction id, next line ${d}`, `${chain("record-evidence")}\n  direction["x"]\n  e --> direction\n  ${d}cap["record-evidence"] --> g`])),
    "bare direction id, blank line, next line LRU": `${chain("record-evidence")}\n  direction["x"]\n  e --> direction\n\n  LRU["record-evidence"] --> g`,
    "bare redirection id, next line TBD": `${chain("record-evidence")}\n  redirection["x"]\n  e --> redirection\n  TBD["record-evidence"] --> g`,
    "bare o before an arrow at the start of a line": `${chain("record-evidence")}\n  o["l"]\n  b["B"]\n  o-->g["G"]`,
    "bare x before an arrow at the start of a line": `${chain("record-evidence")}\n  x["l"]\n  b["B"]\n  x-->g["G"]`,
    "direction statement line": `${chain("record-evidence")}\n  direction TB`,
    "closing fence indented four spaces": `${chain("record-evidence")}\n    `+"\x60\x60\x60",
    "closing fence indented by a tab": `${chain("record-evidence")}\n\t`+"\x60\x60\x60",
    "text after the closing fence": `${chain("record-evidence")}\n`+"\x60\x60\x60trailing",
    "text before the closing fence": `${chain("record-evidence")}\n  subgraph s\x60\x60\x60`,
    "edge text": `${chain("record-evidence")}\n  a -- text --> b`,
    "no header": chain("record-evidence").replace("flowchart TD\n", ""),
    "header without direction": chain("record-evidence").replace("flowchart TD", "flowchart"),
    "trailing arrow": `${chain("record-evidence")}\n  a -->`,
  };
  for (const [what, body] of Object.entries(outside)) assert.ok(outOfForm(body).length >= 1, what);
  // Ids Mermaid 12.0.0 cannot parse are out of form. `click`, `call` and `href` are lexer keywords only when a
  // bare id is followed by whitespace or the line end, in any position.
  const anywhere = ["end", "style", "class", "classDef", "linkStyle", "subgraph", "graph", "flowchart", "interpolate", "_self", "_blank", "_parent", "_top"];
  const lineStart = ["click", "call", "href"];
  for (const id of anywhere) {
    assert.ok(outOfForm(`${chain("record-evidence")}\n  ${id}["x"]`).length >= 1, `${id} at the start of a line`);
    assert.ok(outOfForm(`${chain("record-evidence")}\n  e --> ${id}["x"]`).length >= 1, `${id} after an arrow`);
  }
  for (const id of lineStart) {
    assert.deepEqual(outOfForm(`${chain("record-evidence")}\n  ${id}["x"]`), [], `${id} labelled at the start of a line`);
    assert.deepEqual(outOfForm(`${chain("record-evidence")}\n  e --> ${id}["x"]`), [], `${id} labelled after an arrow`);
    assert.deepEqual(outOfForm(`${chain("record-evidence")}\n  ${id}["x"]\n  ${id}-->e`), [], `${id} bare, followed by an arrow`);
    assert.ok(outOfForm(`${chain("record-evidence")}\n  ${id}["x"]\n  ${id} --> e`).length >= 1, `${id} bare, followed by a space`);
    assert.ok(outOfForm(`${chain("record-evidence")}\n  ${id}["x"]\n  e --> ${id}`).length >= 1, `${id} bare at the end of a line`);
    assert.ok(outOfForm(`${chain("record-evidence")}\n  ${id}["x"]\n  e -->|x| ${id}`).length >= 1, `${id} bare after an edge label`);
    assert.ok(outOfForm(`${chain("record-evidence")}\n  ${id}["x"]\n  e --> ${id} --> f`).length >= 1, `${id} bare between arrows`);
  }
  for (const id of ["o", "x"]) {
    assert.ok(outOfForm(`${chain("record-evidence")}\n  ${id}["l"]\n  b["B"]\n  ${id}-->e`).length >= 1, `${id} bare at the start of a line before an arrow`);
    assert.deepEqual(outOfForm(`${chain("record-evidence")}\n  e --> ${id}["l"]-->f`), [], `${id} labelled right before an arrow`);
    assert.deepEqual(outOfForm(`${chain("record-evidence")}\n  ${id}["l"]\n  e --> ${id} --> f`), [], `${id} bare between spaced arrows`);
    assert.ok(outOfForm(`${chain("record-evidence")}\n  ${id}["l"]\n  e --> ${id}-->f`).length >= 1, `${id} bare right before an arrow, after an arrow`);
  }
  for (const id of ["O", "X"]) assert.deepEqual(outOfForm(`${chain("record-evidence")}\n  ${id}["l"]\n  e --> ${id}-->f`), [], `${id} is an id`);
  // Lower case direction is no statement in Mermaid 12.0.0, and `__proto__` is an ordinary id there.
  assert.deepEqual(outOfForm(chain("record-evidence").replace('f["record-evidence"]', 'f["record-evidence direction lr"]')), [], "direction lr");
  assert.deepEqual(outOfForm(`${chain("record-evidence")}\n  __proto__["x"]\n  e --> __proto__`), [], "__proto__");
  assert.deepEqual(outOfForm(`${chain("record-evidence")}\n  direction["x"]\n  TDcap["record-evidence"] --> g`), [], "a labelled direction id is no statement");
  // Mermaid reads the five direction words case-sensitively, also across a line break.
  for (const next of ['lrcap["record-evidence"] --> g', 'tbq["Q"] --> g']) assert.deepEqual(outOfForm(`${chain("record-evidence")}\n  direction["x"]\n  e --> direction\n  ${next}`), [], next);
  // The document form: plain fences, no HTML lines, one heading, a plain paragraph before the fence.
  const BT = "\x60\x60\x60";
  const dag = 'flowchart TD\n  a["verify"] --> f["record-evidence"] --> zi["iterate-evidence"] --> zm["describe-pr"]';
  const questions = "### Design Questions\n\n#### Where does the token secret go?\n\nA 429 carries Retry-After. Recommendation: A.\n\nUse src/channels/acme-status.mjs.\n\n";
  const fenceDoc = ({ before = "", heading = "### Execution DAG", between = "", open = `${BT}mermaid`, close = BT, after = "\n\n## Human Review\n" } = {}) => `${questions}${before}${heading}\n\n${between}${open}\n${dag}\n${close}${after}`;
  const plainReason = (text, needle) => rawProblems(text).some((line) => line.includes("outside the plain form") && line.includes(needle));
  assert.deepEqual(rawProblems(fenceDoc()), [], "the recorded layout");
  assert.deepEqual(rawProblems(`---\ntype: design-discussion\nsummary: s\n---\n\n${fenceDoc()}`), [], "leading frontmatter");
  assert.deepEqual(rawProblems(fenceDoc().replaceAll("\n", "\r\n")), [], "CRLF line endings");
  assert.deepEqual(rawProblems(fenceDoc({ heading: "### execution dag  " })), [], "any case and trailing spaces in the heading");
  assert.deepEqual(rawProblems(fenceDoc({ before: "Use `<!--` in HTML, and text <!-- x\n\n" })), [], "an inline comment opener in a prose line");
  assert.deepEqual(rawProblems(fenceDoc({ after: "\n\n---\n\n## Human Review\n\n***\n" })), [], "thematic breaks after a blank line outside the section");
  assert.deepEqual(rawProblems(fenceDoc({ between: "Draw the chain below.\n\nIt follows the workflow.\n\n" })), [], "plain paragraph lines before the fence");
  assert.deepEqual(rawProblems(fenceDoc({ before: `~~~text\nsome text\n~~~\n\n` })), [], "an earlier plain tilde fence");
  assert.deepEqual(rawProblems(fenceDoc({ before: `${BT}my-lang\nx\n${BT}\n\n${BT}a_b\nx\n${BT}\n\n` })), [], "info words with a dash and an underscore");
  assert.deepEqual(rawProblems(`---\nnotes: use ${BT} in text <b>\n---\n\n${fenceDoc()}`), [], "frontmatter is dropped before the rules");
  assert.deepEqual(rawProblems(fenceDoc({ before: `${BT}text\n<div>\n# Execution DAG ###\n${BT}\n\n` })), [], "fenced lines are not read");
  // One must-fail case per rule, with the shapes the reviews listed.
  for (const [what, doc] of Object.entries({
    "a lone CR": fenceDoc({ before: "~~~\rx\r~~~\n\n" }),
    "CR CR LF": fenceDoc({ before: "~~~\r\r\nx\n~~~\n\n" }),
    "U+2028": fenceDoc({ before: "~~~ x ~~~\n\n" }),
    "U+2029": fenceDoc({ before: "text more\n\n" }),
    "U+0085": fenceDoc({ before: "text\u0085more\n\n" }),
  })) assert.ok(plainReason(doc, "CR, U+2028"), what);
  for (const [what, doc] of Object.entries({
    "an indented fence": fenceDoc({ before: "  ~~~\n\n" }),
    "an indented fence, closed": fenceDoc({ before: "  ~~~\nx\n~~~\n\n" }),
    "an indented closing fence": fenceDoc({ before: "~~~\nx\n  ~~~\n~~~\n\n" }),
    "a four-space-indented fence": fenceDoc({ before: "    ~~~\n\n" }),
    "a list-item fence": fenceDoc({ before: `- note\n\n  ${BT}\n\n` }),
    "a block-quote fence": fenceDoc({ before: `> ${BT}text\n\n` }),
    "a four-backtick fence": fenceDoc({ before: "````md\nx\n````\n\n" }),
    "a fence with trailing text": fenceDoc({ before: `${BT}md title\nx\n${BT}\n\n` }),
    "an info word with a space": fenceDoc({ open: `${BT} mermaid` }),
    "an info word with a colon": fenceDoc({ open: `${BT}mer:maid` }),
    "a no-break space after a closing fence": fenceDoc({ before: `${BT}md\nx\n${BT} \n\n` }),
    "a form feed after a closing fence": fenceDoc({ before: `${BT}md\nx\n${BT}\f\n\n` }),
    "a no-break space after the DAG closing fence": fenceDoc({ close: `${BT} ` }),
    "a tilde fence inside a backtick fence": fenceDoc({ before: `${BT}text\n~~~\n${BT}\n\n` }),
    "a closing fence of the wrong character": fenceDoc({ before: `~~~text\n${BT}\n\n` }),
    "an unclosed fence": fenceDoc({ before: `${BT}text\nx\n` }),
    "a fence mark inside the DAG fence": fenceDoc({ open: `${BT}mermaid\n  n5["x${BT}y"]` }),
    "a tilde mark inside a fence": fenceDoc({ before: `${BT}text\nsome ~~~ text\n${BT}\n\n` }),
    "a fence mark in a prose line": fenceDoc({ before: `Use ${BT} inline.\n\n` }),
    "the DAG fence closed by tildes": fenceDoc({ close: "~~~" }),
  })) assert.ok(plainReason(doc, "fence"), what);
  for (const opener of ["<!-- note -->", "<!-- draft", "<div>", "<details>", "<pre>", "<script>", "<style>", "<textarea>", "<?php", "<!DOCTYPE html>", "<![CDATA[", "  <p>", "</div>", "<custom-tag>"]) {
    assert.ok(plainReason(fenceDoc({ before: `${opener}\n\n` }), "starts with `<`"), `an HTML line ${opener}`);
    assert.ok(plainReason(fenceDoc({ before: `${opener}\n` }), "starts with `<`"), `an HTML line ${opener} directly above the heading`);
    assert.ok(plainReason(fenceDoc({ after: `\n\n${opener}\n` }), "starts with `<`"), `an HTML line ${opener} after the section`);
  }
  for (const [what, doc] of Object.entries({
    "a closing-hash heading": fenceDoc({ heading: "### Execution DAG ###" }),
    "a no-break space after the heading": fenceDoc({ heading: "### Execution DAG " }),
    "a tab-indented decoy heading": fenceDoc({ before: "\t### Execution DAG\n\n" }),
    "an indented decoy heading": fenceDoc({ before: "  ### Execution DAG\n\n" }),
    "a decoy heading of another level": fenceDoc({ before: "#### Execution DAG\n\n" }),
    "a lower-case decoy heading": fenceDoc({ before: "#### execution dag\n\n" }),
    "a decoy heading with a closing hash": fenceDoc({ before: "### Execution DAG ###\n\n" }),
    "a decoy heading with two inner spaces": fenceDoc({ before: "### Execution  DAG\n\n" }),
    "a decoy heading in a list item": fenceDoc({ before: "- ### Execution DAG\n\n" }),
    "a decoy heading in a block quote": fenceDoc({ before: "> ### Execution DAG\n\n" }),
    "a decoy heading in a nested quote": fenceDoc({ before: ">> ### Execution DAG\n\n" }),
    "a decoy heading in an ordered item": fenceDoc({ before: "1. ### Execution DAG\n\n" }),
    "two headings": fenceDoc({ after: "\n\n### Execution DAG\n\nlater\n" }),
    "a setext heading above": fenceDoc({ before: "Execution DAG\n=============\n\n" }),
    "a dashed setext heading above": fenceDoc({ before: "Execution DAG\n-----\n\n" }),
    "an underline right under the heading": fenceDoc({ heading: "### Execution DAG\n---" }),
  })) assert.ok(plainReason(doc, "Execution DAG") || plainReason(doc, "plain paragraph"), what);
  for (const [what, between] of Object.entries({
    "a setext heading": "Notes\n-----\n\n",
    "a list item": "- item\n\n",
    "an ordered item": "1. item\n\n",
    "an ordered item with a bracket": "2) item\n\n",
    "a block quote": "> quote\n\n",
    "a table row": "| a | b |\n\n",
    "an indented line": "  indented\n\n",
    "a tab-indented line": "\tindented\n\n",
    "a sub-heading": "#### Sub\n\n",
    "an equals underline": "Notes\n=====\n\n",
    "a star item": "* item\n\n",
    "a plus item": "+ item\n\n",
  })) assert.ok(plainReason(fenceDoc({ between }), "plain paragraph"), what);
  assert.ok(plainReason(fenceDoc({ open: `${BT}text` }), "not a mermaid fence"), "the first fence under the heading is not mermaid");
  assert.ok(plainReason(`${questions}${BT}text\nx\n`, "unclosed"), "an unclosed fence");
  assert.ok(rawProblems(fenceDoc({ heading: "### Execution Diagram" })).length >= 1, "no Execution DAG heading");
  // Stricter by design: a Markdown parser draws each of these, the plain form rejects them.
  for (const [what, doc] of Object.entries({
    "an opening fence indented three spaces": fenceDoc({ open: `   ${BT}mermaid` }),
    "a four-backtick DAG fence": fenceDoc({ open: `${BT}\x60mermaid`, close: `${BT}\x60` }),
    "a closing fence with trailing spaces": fenceDoc({ close: `${BT}  ` }),
    "a closing fence with a tab": fenceDoc({ close: `${BT}\t` }),
    "an indented heading": fenceDoc({ heading: "   ### Execution DAG" }),
    "a heading with closing hashes": fenceDoc({ heading: "### Execution DAG ###" }),
    "a closed comment above the heading": fenceDoc({ before: "<!-- note -->\n\n" }),
    "a list item before the fence": fenceDoc({ between: "- note\n\n" }),
    "a block-quote line before the fence": fenceDoc({ between: "> note\n\n" }),
  })) assert.ok(rawProblems(doc).length >= 1, `stricter by design: ${what}`);
  // Hostile inputs, each under 1.5 s.
  const decreasing = Array.from({ length: 900 }, (_, i) => "\x60".repeat(903 - i) + "mermaid").join("\n");
  for (const [what, body] of Object.entries({ "decreasing openings": decreasing, "equal openings": `${BT}mermaid\n`.repeat(30000), "backtick runs": "\x60 ".repeat(100000), "many lines": "x\n".repeat(200000), "many HTML lines": "<p>\n".repeat(100000), "many headings": "### Execution DAG\n".repeat(50000) })) {
    const started = performance.now();
    rawProblems(`${questions}${body}`);
    assert.ok(performance.now() - started < 1500, what);
  }
  for (const id of ["direction", "End", "Style", "default", "accTitle"]) assert.deepEqual(outOfForm(`${chain("record-evidence")}\n  ${id}["x"]\n  e --> ${id}`), [], id);

  // The example block of every Execution DAG template is itself in the form.
  for (const file of ["create-tdd/references/tdd_template.md", "iterate-tdd/references/tdd_template.md", "create-design-discussion/references/design_discussion_template.md", "iterate-design-discussion/references/design_discussion_template.md"]) {
    const template = fs.readFileSync(new URL(`../skills/delivery/${file}`, import.meta.url), "utf8");
    const example = /### Execution DAG[\s\S]*?```mermaid\n([\s\S]*?)```/.exec(template)[1];
    assert.deepEqual(outOfForm(example), [], file);
  }


  // Hostile 100,000-character inputs, each under 1 s (generous so a slow machine does not flake).
  const hostile = {
    "long label": `flowchart TD\n  a["${"x".repeat(100000)}"]\n  ${tail}`,
    "long unclosed label": `flowchart TD\n  a["${"x".repeat(100000)}\n  ${tail}`,
    "long line of arrows": `flowchart TD\n  a${" --> a".repeat(20000)}\n  ${tail}`,
    "arrows with unclosed edge labels": `flowchart TD\n  a${" -->|".repeat(30000)}\n  ${tail}`,
    "long whitespace run": `flowchart TD\n  a${" ".repeat(100000)}b\n  ${tail}`,
    "many lines": `flowchart TD\n${"  a --> b\n".repeat(50000)}  ${tail}`,
    "many openers": `flowchart TD\n  ${"[".repeat(100000)}\n  ${tail}`,
    "one id relabelled on many lines": `flowchart TD\n  a["x"]\n${'  a["x"]\n'.repeat(100000)}  ${tail}`,
    "one id relabelled in one chain": `flowchart TD\n  a["x"]${' --> a["x"]'.repeat(60000)}\n  ${tail}`,
  };
  for (const [what, body] of Object.entries(hostile)) {
    const started = performance.now();
    problems(body);
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 1000, `${what}: ${elapsed} ms`);
  }
});

test("placeholders keep the execution DAG template's example labels as prompts and accept a correctly drawn chain", async () => {
  const { placeholders } = await import("../evals/lib.mjs");
  assert.deepEqual(placeholders('x["review loop"]', 'x["review loop"]'), ['["review loop"]']);
  const chain = 'implement["implement-plan"] --> verify["verify-implementation"] --> review["review loop"] --> pr["describe-pr"]';
  for (const file of ["create-tdd/references/tdd_template.md", "iterate-tdd/references/tdd_template.md", "create-design-discussion/references/design_discussion_template.md", "iterate-design-discussion/references/design_discussion_template.md"]) {
    const template = fs.readFileSync(new URL(`../skills/delivery/${file}`, import.meta.url), "utf8");
    assert.deepEqual(placeholders(chain, template), [], file);
    const example = /### Execution DAG[\s\S]*?(```mermaid\n[\s\S]*?```)/.exec(template)[1];
    assert.deepEqual(placeholders(example, template).sort(), ['["[phase already done]', '["[phase]', '["[unattended phase]', "[gates value]"].sort(), file);
    assert.ok(placeholders("[Known limit, or `None.`]", template).length === 1, file);
  }
});

test("the convert-rfc outbox-log check accepts the append line and still rejects unrelated or fabricated store.mjs lines", async () => {
  const { default: scenario } = await import("../evals/scenarios/convert-rfc.mjs");
  const phase = scenario.phases.find((p) => p.skill === "create-tdd");
  const codeRoot = fileURLToPath(new URL("../evals/fixtures/repo-cli", import.meta.url));
  const grade = (pointer) => [phase.check({ artifact: { text: `### Local Patterns\n\n- Delivery log, ${pointer}, appends one entry per delivery.\n\n## Human Review\n` }, answer: "", codeRoot })].flat(Infinity).filter(Boolean);
  const log = (pointer) => grade(pointer).filter((line) => line.includes("cite a real line of the outbox log"));
  assert.deepEqual(log("`src/store.mjs:13`"), []);
  assert.deepEqual(log("`src/store.mjs:9-11`"), []);
  assert.equal(log("`src/store.mjs:1`").length, 1);
  assert.equal(log("`src/store.mjs:99`").length, 1);
  assert.ok(grade("`src/store.mjs:99`").some((line) => /pointer\(s\) do not resolve.*src\/store\.mjs:99/.test(line)));
});

test("the convert-prd seven-day check excuses only a sentence that says the item is open", async () => {
  const { default: scenario } = await import("../evals/scenarios/convert-prd.mjs");
  const phase = scenario.phases.find((p) => p.skill === "create-prd");
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "convert-prd-"));
  try {
    const decided = (details) => [phase.check({ artifact: { text: `### Proposed Solution\n\nA daily digest.\n\n### Solution Details\n\n${details}\n\n## Human Review\n` }, answer: "", taskDir })].flat(Infinity).filter((line) => line && line.includes("the seven-day question reads as decided"));
    // The two sentences of run 20261001-035602 pass through OPEN_ITEM, as do the short sentences that exercise
    // its verbs and list words. "Whether ..." passes through HEDGE, and the last two are not selected by
    // SEVEN_DAY at all.
    for (const open of [
      // The recorded section of run 20261001-035602: the heading, its body and the source pointers.
      "#### Performance and upcoming invoices remain unresolved\n\n\u201cDigests must be fast.\u201d provides no measurable obligation; no threshold is approved here. Source: [Billing Alerts Digest](../../../docs/external/billing-alerts-prd.md), Requirements, line 27.\n\nIncluding invoices due within the next seven days remains an open decision, not an approved requirement. Source: [Billing Alerts Digest](../../../docs/external/billing-alerts-prd.md), Open questions, line 38.",
      "Including invoices due within the next seven days remains an open decision, not an approved requirement.",
      "Including invoices due within seven days is an open decision, not an approved requirement.",
      "The seven-day question is unresolved.",
      "Invoices due within seven days are unresolved.",
      "The 7-day window is unresolved.",
      "The seven-day invoice window remains an open decision.",
      "Seven-day inclusion is unresolved.",
      "Whether invoices due within seven days are included is still unresolved.",
      "Upcoming-invoice inclusion remains unresolved until Finance and Support have decided.",
      "Upcoming-invoice inclusion remains unresolved; the TDD must not assume it is included.",
    ]) assert.deepEqual(decided(open), [], open);
    // Decided and two-clause sentences stay flagged, as on origin/main.
    for (const settled of [
      "Upcoming invoices are unresolved. Source: Finance decided to include them. Source: line 38.",
      "Upcoming invoices are unresolved. The digest includes them, Source: line 38.",
      "#### Upcoming invoices remain unresolved\n\nThe digest shall include them.\n\n#### Other\n\nInvoices due within seven days remain an open decision.",
      "Upcoming invoices are unresolved. This PRD includes them, whether or not Finance agrees.",
      "Upcoming invoices are unresolved. The digest shall include them; see Verify.",
      "Upcoming invoices are unresolved. The digest includes them, TBD aside.",
      "Upcoming invoices are unresolved. No decision is pending: the digest includes them.",
      "Upcoming invoices are unresolved. The open question is settled: the digest includes them.",
      "Upcoming invoices are unresolved. Source: line 38, and the digest includes them.",
      "Upcoming invoices are unresolved. Source: Finance decided to include them.",
      "Upcoming invoices are unresolved. The digest includes them (Source: line 38).",
      "Upcoming invoices are unresolved. The digest includes them. Source: line 38.",
      "Upcoming invoices are unresolved.\nThis PRD includes them.",
      "#### Upcoming invoices remain unresolved\n\nThe digest shall include them.",
      "#### Performance and upcoming invoices remain unresolved\n\nThe digest shall include them. Source: line 38.",
      "#### Upcoming invoices remain unresolved\nThe digest shall include them.",
      "The seven-day question, which is unresolved in the export, is decided here: include invoices due within seven days.",
      "Nothing about upcoming invoices is unresolved: they are included.",
      "Including invoices due within seven days is an open decision that this PRD settles: they are included.",
      "No part of the seven-day question remains an open decision; invoices due within seven days are included.",
      "Invoices due within seven days are included; nothing is left unresolved.",
      "The seven-day question, left unresolved in the export, is decided here: invoices due within seven days are included.",
      "The question the export left unresolved is settled: invoices due within seven days are included.",
      "Seven-day inclusion was still unresolved in the export; this PRD includes invoices due within seven days.",
      "The export left an open decision on upcoming invoices, and they are now included.",
      "No question remains unresolved: invoices due within seven days are included.",
      "Nothing is left unresolved; upcoming invoices are included.",
      "What the export left unresolved is now settled: invoices due within seven days are included.",
      "Invoices due within seven days are included; the speed target is still unresolved.",
      "Including invoices due within seven days is an open decision that the owner settled: include them.",
      "Upcoming invoices are included; what remains an open decision is the email copy.",
      "Invoices due within seven days are included; it is an open decision no more.",
      "Invoices due within seven days are included, and nothing else is still an open decision.",
      "Invoices due within seven days are included and the matter is unresolved no longer.",
      "The seven-day question remains unresolved in the export; the digest shall include invoices due within seven days.",
      "The digest shall include invoices due within seven days, which remains an open decision in the export.",
      "Upcoming invoices remain unresolved in the export, but the digest will include them.",
      "Invoices due within seven days go into the digest; nothing remains unresolved.",
      "No question remains unresolved: the digest covers invoices due within seven days.",
      "The digest lists invoices due within seven days, so nothing is unresolved.",
      "Invoices due within seven days are in scope; nothing remains an open decision.",
      "Invoices due within seven days are sent in the digest; the speed target is still unresolved.",
      "The system shall add invoices due within seven days; nothing stays unresolved.",
      "Upcoming invoices are part of the digest; no question is left unresolved.",
      "Invoices due within seven days appear in the digest; the email copy remains an open decision.",
      "We include upcoming invoices; nothing remains unresolved.",
      "The seven-day question is unresolved in the export, and we chose to include those invoices.",
      "Upcoming invoices: yes, include them; nothing remains unresolved.",
      "Upcoming invoices are approved for the digest; nothing remains unresolved.",
      "Including invoices due within seven days is not an open decision: they are included.",
      "The system shall include invoices due within seven days, although the question remains unresolved.",
      "The system shall include invoices due within seven days; this remains an open decision in the export.",
      "The digest shall list invoices due within the next seven days, which remains an open decision for Finance.",
      "Invoices due within seven days shall appear in the digest; the export's question is still unresolved.",
      "The digest lists invoices due within seven days; nothing remains unresolved.",
      "Upcoming invoices are part of the digest, so the question is no longer open and stays unresolved only in the export.",
      "The system must list invoices due within seven days even though the item remains unresolved.",
      "Invoices due within seven days will be listed, though the scope remains an open decision.",
      "Upcoming invoices remain unresolved in the export; the digest shall include invoices due within seven days.",
      "This PRD will include invoices due within seven days, which is unresolved in the export.",
      "The question is unresolved in the source, so this PRD chooses to include invoices due within seven days.",
      "The digest lists invoices due within seven days, though the question remains an open decision in the export.",
      "Seven-day inclusion was unresolved in the export.",
      "Upcoming invoices remain unresolved in the export: invoices due within seven days appear in the digest.",
      "Upcoming-invoice inclusion is unresolved, and invoices due within seven days stay out until it is settled.",
      "The previously unresolved seven-day question is settled: include invoices due within seven days.",
      "Invoices due within seven days, once unresolved, are now included.",
      "Invoices due within seven days are included.",
      "The seven-day question was an open decision; invoices due within seven days are now included.",
      "Once an open decision, upcoming invoices are now included.",
      "Upcoming invoices remain unresolved, and the PRD adopts them.",
      "Seven-day inclusion was unresolved.",
      "Upcoming invoices are unresolved. This PRD includes them.",
      "Invoices due within seven days are unresolved. They are included in the digest.",
      "Including invoices due within seven days is an open decision. The digest shall include them.",
      // F37 and ADV-042: a Source line or a HEDGE sentence that carries the decision.
      "Upcoming invoices are unresolved. Source: Finance decided to include them, line 38.",
      "Upcoming invoices are unresolved. Source: the digest includes them per billing-alerts-prd.md:38.",
      "Upcoming invoices are unresolved. Source: this PRD includes them at line 38.",
      "Upcoming invoices are unresolved. Source: [The digest includes them](billing-alerts-prd.md), line 38.",
      "Upcoming invoices are unresolved. Source: Finance decided they are included. line 38.",
      "Upcoming invoices are unresolved. SOURCE: we include them, line 38.",
      "Upcoming invoices are unresolved. Source: line 38; Finance decided to include them.",
      "Upcoming invoices are unresolved. Source: the digest includes them per line 38.",
      "Upcoming invoices are unresolved. Source: they are included in the digest, billing-alerts-prd.md:38.",
      "Upcoming invoices are unresolved. Source: the PRD settles this and includes them, line 38.",
      "Upcoming invoices are unresolved. Source: Open questions \u2014 now decided: include them \u2014 line 38.",
      "Upcoming invoices are unresolved. Source: Finance decided to include them, billing-alerts-prd.md, Open questions, line 38.",
      "#### Upcoming invoices remain unresolved\n\nIncluding invoices due within the next seven days remains an open decision. Source: Finance decided to include them, line 38.",
      "#### Upcoming invoices remain unresolved\n\nInvoices due within seven days remain an open decision. Source: Finance has since decided to include them, line 38.",
      "Upcoming invoices are unresolved. The digest includes upcoming invoices, whether or not Finance agrees.",
      "Upcoming invoices are unresolved. The open question about upcoming invoices is settled: they are included.",
      "Upcoming invoices are unresolved. No decision is pending on upcoming invoices: they are included.",
      "Upcoming invoices are unresolved. Invoices due within seven days are included; see Verify.",
      "Upcoming invoices are unresolved. Whether upcoming invoices count is settled: they are included.",
      "#### Upcoming invoices remain unresolved\n\nThe digest includes upcoming invoices, whether or not Finance agrees.",
    ]) assert.equal(decided(settled).length, 1, settled);
    // Hostile input of about 400,000 characters: the paragraph verdict is computed once per paragraph, so these stay far
    // under the bound (a verdict per sentence takes seconds); the bound is generous so a slow machine does not flake.
    const unit = "Seven days is unresolved. ";
    for (const [what, text] of Object.entries({
      "one paragraph of open sentences": unit.repeat(15000),
      "one paragraph of decided sentences": "Invoices due within seven days are included. ".repeat(9000),
      "many paragraphs": `${unit}\n\n`.repeat(15000),
      "many headings": "#### Seven days is unresolved\n".repeat(15000),
      "open sentences, then a deciding one": `${unit.repeat(15000)}This PRD includes them.`,
    })) {
      const started = performance.now();
      decided(text);
      const elapsed = performance.now() - started;
      assert.ok(elapsed < 1500, `${what}: ${elapsed} ms`);
    }
    // An open sentence stays excused beside other open sentences or a Source line in its paragraph.
    for (const paragraph of [
      "Invoices due within seven days are unresolved. Source: billing-alerts-prd.md line 27",
      "Upcoming invoices are unresolved. Source: Open questions, lines 36-38.",
      "Upcoming invoices are unresolved. Source: [Billing Alerts Digest](../../../docs/external/billing-alerts-prd.md), Requirements, line 27.",
      "Upcoming invoices are unresolved. Source: billing-alerts-prd.md, Open questions, line 38.",
      "Upcoming invoices are unresolved. Source: lines 36 and 38.",
      "Upcoming invoices are unresolved. Source: Billing Alerts Digest, Open questions, line 38.",
      "Upcoming invoices are unresolved.\n[Source: Open questions, line 38](../../../docs/external/billing-alerts-prd.md)",
      "Upcoming invoices are unresolved.\n[Source: Open questions, line 38](../../../docs/external/billing-alerts-prd.md#open-questions)",
      "Upcoming invoices are unresolved. Source: [Billing Alerts Digest](billing-alerts-prd.md#L38), line 38.",
      "Upcoming invoices are unresolved. Source: docs/external/billing-alerts-prd.md, line 38.",
      "Upcoming invoices are unresolved. Source: Open questions, lines 36\u201338.",
      "The seven-day window is an open decision. The 7-day question remains unresolved.",
      "The seven-day question is unresolved. Source: billing-alerts-prd.md:38-40.",
    ]) assert.deepEqual(decided(paragraph), [], paragraph);
  } finally {
    fs.rmSync(taskDir, { recursive: true, force: true });
  }
});

test("the convert-prd known-limit checks accept the named limits and fail on unrelated ones", async () => {
  const { default: scenario } = await import("../evals/scenarios/convert-prd.mjs");
  const phase = scenario.phases.find((p) => p.skill === "create-prd");
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "convert-prd-"));
  try {
    const run = (limits, details = "The system shall send a digest (line 4).", verify = "- [ ] Decide it.") => [phase.check({ artifact: { text: `### Solution Details\n\n${details}\n\n## Human Review\n\n### Verify\n\n${verify}\n\n### Known limits\n\n${limits}\n` }, answer: "", taskDir })].flat(Infinity).filter(Boolean);
    const verifyBox = (verify) => run("- x", undefined, verify).filter((line) => line.includes("Verify box decides the seven-day question"));
    // The Verify box uses origin/main's pattern: only the Known limits check also reads "upcoming-invoice inclusion".
    assert.deepEqual(verifyBox("- [ ] Decide whether invoices due within seven days belong in the digest."), []);
    assert.equal(verifyBox("- [ ] Decide upcoming-invoice inclusion.").length, 1);
    const fastLimit = (limits) => run(limits).filter((line) => line.includes("'fast' named as a known limit"));
    const openLimit = (limits) => run(limits).filter((line) => line.includes("open question named as a known limit"));
    for (const named of ["- The speed requirement has no measurable threshold.", "- 'Fast' has no measurable threshold.", "- No target says how much faster the digest must be.", "- Fastness is undefined."]) assert.deepEqual(fastLimit(named), [], named);
    for (const unrelated of ["- No last-edited date is stated.", "- Email delivery speed depends on the provider."]) assert.equal(fastLimit(unrelated).length, 1, unrelated);
    for (const named of ["- Upcoming-invoice inclusion is unresolved.", "- Upcoming invoices are not decided.", "- Seven days is not defined."]) assert.deepEqual(openLimit(named), [], named);
    for (const unrelated of ["- No last-edited date is stated.", "- The upcoming-invoice email template is not designed.", "- An upcoming invoice reminder is out of scope."]) assert.equal(openLimit(unrelated).length, 1, unrelated);
    assert.equal(run("- x", "Upcoming invoices are included.").filter((line) => line.includes("the seven-day question reads as decided")).length, 1);
  } finally {
    fs.rmSync(taskDir, { recursive: true, force: true });
  }
});

test("expectedLimit names each scenario's limit and no numeric check sees none", async () => {
  const { expectedLimit, overLimit, limitMismatch, scenarioReservation } = await import("../evals/iterate-evidence.mjs");
  const names = { "iterate-evidence-zero-limit": "0", "iterate-evidence-label-disagreement": "0", "iterate-evidence-no-progress": "1", "iterate-evidence-three-rounds": "3", "iterate-evidence-continuation": "none", "iterate-evidence-viewer-blocked": "none", "iterate-evidence": "none" };
  for (const [name, limit] of Object.entries(names)) {
    assert.equal(expectedLimit(name), limit, name);
    assert.equal(limitMismatch(name, { limit }), false, name);
    assert.equal(limitMismatch(name, { limit: limit === "3" ? "none" : "3" }), true, `${name} rejects the other value`);
  }
  assert.equal(overLimit({ limit: "none", consumed_rounds: "5" }), false, "no cap, no exhaustion");
  assert.equal(overLimit({ limit: "1", consumed_rounds: "2" }), true);
  assert.equal(overLimit({ limit: "3", consumed_rounds: "3" }), false);
  const reservation = (limit) => `---\nstatus: in-progress\nstop_reason: none\nconsumed_rounds: 1\nlimit: ${limit}\n---\n### Round 1\n- Reservation persisted at: this boundary before mutation.\n- Consumed count / authorized limit: 1 / ${limit}.\n- Attempted finding IDs: IE-001.\n- Current step: repair pending.`;
  for (const [name, limit] of [["iterate-evidence-continuation", "none"], ["iterate-evidence-three-rounds", "3"], ["iterate-evidence-no-progress", "1"]]) {
    assert.equal(scenarioReservation(name, reservation(limit), 1, "IE-001"), true, name);
    assert.equal(scenarioReservation(name, reservation(limit === "3" ? "none" : "3"), 1, "IE-001"), false, `${name} rejects the other limit`);
  }
});

test("continuation scenario check records limit none and rejects the old default 3", async () => {
  const { default: continuation } = await import("../evals/scenarios/iterate-evidence-continuation.mjs");
  const text = "---\ntype: evidence-iteration\n---\n\n## Findings\n\n| ID | Flow | State |\n| --- | --- | --- |\n| IE-001 | increment | resolved |\n";
  const receipt = (limit) => { const a = { fm: { type: "evidence-iteration", status: "passed", stop_reason: "success", limit, consumed_rounds: "1" }, text }; return continuation.phases[0].check({ artifact: a, artifacts: [a] }); };
  assert.deepEqual(receipt("none"), []);
  assert.ok(receipt("3").some((p) => p.includes("uncapped")));
});


test("scenario stubs run first on PATH, keep their exit code, and log every call", async () => {
  const { writeStubs, stubCalls } = await import("../evals/lib.mjs");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "stub-calls-"));
  assert.equal(writeStubs({}, path.join(out, "stub-calls.log")), null, "no stubs, no directory");
  const dir = writeStubs({ glab: "echo stubbed; exit 3" }, path.join(out, "stub-calls.log"));
  const ran = spawnSync("glab", ["api", "projects/1"], { encoding: "utf8", env: { ...process.env, PATH: [dir, process.env.PATH].join(path.delimiter) } });
  assert.equal(ran.status, 3);
  assert.equal(ran.stdout.trim(), "stubbed");
  assert.deepEqual(stubCalls(out), ["glab api projects/1"]);
  for (const d of [dir, out]) fs.rmSync(d, { recursive: true, force: true });
});

test("the research phase must show it ran the citation and coverage judgments, or say it skipped them", async () => {
  const { researchPhases } = await import("../evals/acme-chain.mjs");
  const research = researchPhases("create-plan").find((phase) => phase.skill === "create-research");
  assert.ok(research.stubs.node, "a node stub records the judge calls");
  const text = (limit) => `src/channels/index.mjs registers channels.\n\n### Known limits\n\n- ${limit}\n\n## Summary\n`;
  const judged = (calls, limit) => [research.check({ artifact: { text: text(limit) }, stubCalls: calls })].flat(Infinity).filter((line) => line?.startsWith("research: no `judge.mjs cite`"));
  const ran = ["node /s/typed-judgment/judge.mjs cite-artifact a.md", "node /s/typed-judgment/judge.mjs coverage q.json a.md"];
  assert.equal(judged(ran, "None.").length, 0);
  assert.equal(judged(["node /s/typed-judgment/judge.mjs cite q.json", ran[1]], "None.").length, 0);
  assert.equal(judged([ran[0]], "None.").length, 1);
  assert.equal(judged([], "None.").length, 1);
  assert.equal(judged([], "Judgments skipped: no TypeSafe key.").length, 0);
});

test("one host-write detector: api calls with a method or a body flag, and mutating subcommands, are writes", async () => {
  const { isHostWrite } = await import("../evals/lib.mjs");
  const writes = [
    "glab api projects/1/merge_requests/2/notes --raw-field body=hi --method POST",
    "glab api projects/1/merge_requests/2/notes -f body=hi",
    "glab api projects/1/merge_requests/2/notes -F body=@x.md",
    "glab api projects/1/issues --field title=t",
    "glab api projects/1/merge_requests/2 --method=PUT",
    "glab api -X DELETE projects/1/merge_requests/2/notes/3",
    "glab api projects/1/discussions --input body.json",
    "gh api repos/a/b/issues -f title=t",
    "glab mr create --title t",
    "glab mr note 2 -m hi",
    "glab mr approve 2",
    "glab mr merge 2",
    "glab issue create --title t",
    "gh pr comment 2 --body hi",
    "gh pr review 2 --approve",
    "gh pr merge 2",
  ];
  const reads = [
    "glab api projects/1/merge_requests/2",
    "glab api projects/1/merge_requests/2 --method GET --raw-field per_page=100",
    "glab api -X GET projects/1/merge_requests --field state=opened",
    "glab mr view 2",
    "glab mr list",
    "glab auth status",
    "gh pr view 2",
    "gh api repos/a/b/pulls",
    "git push origin main",
  ];
  for (const call of writes) assert.equal(isHostWrite(call), true, call);
  for (const call of reads) assert.equal(isHostWrite(call), false, call);
});

test("a stub call with a newline in an argument is one log line, so a later --method POST is still seen", async () => {
  const { writeStubs, stubCalls, isHostWrite } = await import("../evals/lib.mjs");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "stub-lines-"));
  const dir = writeStubs({ glab: "echo '{}'" }, path.join(out, "stub-calls.log"));
  const env = { ...process.env, PATH: [dir, process.env.PATH].join(path.delimiter) };
  spawnSync("glab", ["api", "p/notes", "--raw-field", "body=Evidence\nsecond line", "--method", "POST"], { env });
  spawnSync("glab", ["api", "p/notes", "-f", "body=hi"], { env });
  const calls = stubCalls(out);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(isHostWrite), [true, true]);
  for (const d of [dir, out]) fs.rmSync(d, { recursive: true, force: true });
});

test("the slack-coordinator stub finds its log, answers 11, 10, then 0, and the gate grader reads those states", async () => {
  const { writeStubs, stubCalls } = await import("../evals/lib.mjs");
  const { default: gate, gateProblems } = await import("../evals/scenarios/slack-check-gate.mjs");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "stub-gate-"));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "stub-gate-repo-"));
  spawnSync("git", ["init", "-q"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "a.txt"), "1");
  const git = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: repo });
  git("add", "."); git("commit", "-qm", "seed");
  const dir = writeStubs(gate.stubs, path.join(out, "stub-calls.log"));
  const env = { ...process.env, PATH: [dir, process.env.PATH].join(path.delimiter) };
  const call = (...args) => spawnSync("slack-coordinator", args, { cwd: repo, env, encoding: "utf8" });
  assert.equal(call("run", "check").status, 11);
  assert.equal(call("run", "check").status, 10);
  call("run", "resolve", "eval-gate-1");
  fs.writeFileSync(path.join(repo, "a.txt"), "2");
  assert.equal(call("run", "check").status, 0);
  const calls = stubCalls(out);
  assert.equal(calls.filter((c) => c.startsWith("slack-state ")).length, 3, "the stub wrote one state line per check beside the call log");
  assert.ok(gateProblems(calls).some((p) => /repository changed between the exit 11/.test(p)), "an edit between the 11 and the 0 is caught");
  const tree = (c) => /tree=\d+/.exec(c)[0];
  const same = calls.map((c) => (c.startsWith("slack-state n=3") ? c.replace(/tree=\d+/, tree(calls.find((x) => x.startsWith("slack-state n=1")))) : c));
  assert.deepEqual(gateProblems(same), []);
  for (const d of [dir, out, repo]) fs.rmSync(d, { recursive: true, force: true });
});

test("a phase's env, unsetEnv and stub directory reach only its own session environment, stubs first on PATH", async () => {
  const { sessionEnv } = await import("../evals/lib.mjs");
  const base = { PATH: "/usr/bin", GLAB_TOKEN: "t", GITLAB_HOST: "h", KEEP: "1", DROP: "x" };
  const one = sessionEnv(base, { shim: "/shim", stubDir: "/stubs", unsetEnv: /^(?:GLAB_|GITLAB_)/, overrides: { DROP: null, NEW: "n", GLAB_CONFIG_DIR: "/none" } });
  const two = sessionEnv(base, {});
  assert.equal(one.PATH, ["/stubs", "/shim", "/usr/bin"].join(path.delimiter));
  assert.deepEqual([one.GLAB_TOKEN, one.GITLAB_HOST, one.DROP, one.NEW, one.GLAB_CONFIG_DIR, one.KEEP], [undefined, undefined, undefined, "n", "/none", "1"]);
  assert.deepEqual(two, base, "another phase's environment is untouched");
  assert.equal(base.GLAB_TOKEN, "t", "the base is not mutated");
  // Isolation-owned names survive any unsetEnv, any pattern list, and no override may replace PATH or restore SLACK_*.
  const iso = { PATH: "/usr/bin", SLACK_AGENT_ENV_FILE: "/iso/env", SLACK_BOT_TOKEN: "x", GLAB_TOKEN: "t" };
  const kept = sessionEnv(iso, { stubDir: "/stubs", unsetEnv: [/^SLACK_/, /^PATH$/, /^GLAB_/] });
  assert.equal(kept.SLACK_AGENT_ENV_FILE, "/iso/env");
  assert.equal(kept.PATH, ["/stubs", "/usr/bin"].join(path.delimiter));
  assert.equal(kept.GLAB_TOKEN, undefined, "every pattern in the list applies");
  assert.throws(() => sessionEnv(iso, { overrides: { PATH: "/usr/bin" } }), /PATH/);
  assert.throws(() => sessionEnv(iso, { overrides: { SLACK_AGENT_ENV_FILE: null } }), /Slack/);
});

test("create-epic-plan childrenProblems runs the skill's own checker, with the eval-only rules on top", async () => {
  const { childrenProblems } = await import("../evals/scenarios/create-epic-plan.mjs");
  const child = (o = {}) => ({ name: "a", workflow: "oneshot", slice: "vertical", prompt: "Edit src/x.mjs.", depends_on: [], acceptance: ["The CLI shall print."], ...o });
  const plan = (children, slice = "| a | b |") => `## Children\n\n\`\`\`json\n${JSON.stringify(children)}\n\`\`\`\n\n## Slice Check\n\n${slice}\n`;
  const b = child({ name: "b", depends_on: ["a"] });
  assert.deepEqual(childrenProblems(plan([child(), b])), []);
  assert.ok(childrenProblems(plan([child({ acceptance: ["The CLI shall print"] }), b])).some((p) => /EARS/.test(p)), "the final period is required, as the script requires");
  assert.ok(childrenProblems(plan([child({ acceptance: ["The CLI shall be fast."] }), b])).some((p) => /fast/.test(p)));
  assert.ok(childrenProblems(plan([child(), b], "| a |")).some((p) => /Slice Check has no row/.test(p)));
  assert.ok(childrenProblems(plan([child({ prompt: "Do it." }), b])).some((p) => /names no source or test file/.test(p)));
  assert.ok(childrenProblems(plan([child()])).some((p) => /expected 2 to 6/.test(p)));
});

test("evidence grader accepts only authorized dirty repairs and the dependency closure install", () => {
  assert.deepEqual(dirtyProblems(" M app.js\n M check.mjs"), []);
  assert.deepEqual(dirtyProblems(""), []);
  assert.deepEqual(dirtyProblems(" M app.js\n M server.mjs\n?? stray.txt"), ["M server.mjs", "?? stray.txt"]);
  assert.equal(expectedInstalledSkills, "agent-slack-control-plane,deliver,iterate-evidence,jira-issue-refinement,record-evidence,route-model,typed-judgment");
});

test("deliver-plan-gate counts a granted approval even when its reason says request, never a pending one", async () => {
  const { APPROVAL } = await import("../evals/scenarios/deliver-plan-gate.mjs");
  assert.ok(APPROVAL.test("## Decisions\n- 2026-10-02: plan approved. Owner: eval owner. Reason: the plan matches the request."));
  assert.ok(!APPROVAL.test("- 2026-10-02: awaiting owner approval"));
  assert.ok(!APPROVAL.test("- 2026-10-02: needs owner approved plan"));
  assert.ok(!APPROVAL.test("- plan approved, no date"));
});

test("review-code seeded defect: the test-gap CR is tied to the bug by id or by describing it, and nothing else passes", async () => {
  const { reviewCheck, BUG_LINE } = await import("../evals/scenarios/review-code-seeded-defect.mjs");
  const bug = `### CR-001 Last page is off by one\n\nseverity: major\n\nsrc/paginate.mjs:${BUG_LINE} slices one item too few.\n\n`;
  const gap = (note) => `### CR-002 Tests do not cover a full page\n\nseverity: major\n\nsrc/paginate.mjs:3 has no test that ${note}.\n\n`;
  const problems = (...blocks) => reviewCheck("findings")({ artifact: { text: `## Critical and Required Findings\n\n${bug}${blocks.join("")}\n## Advisories\n`, fm: { status: "findings" } }, answer: "" }).filter((p) => p.includes("CR- findings"));
  assert.equal(problems(gap("cannot detect CR-001")).length, 0, "names the id");
  assert.equal(problems(gap("returns a full page, so the off-by-one ships")).length, 0, "describes the behavior");
  assert.equal(problems(`### CR-002 Tests ignore the empty list\n\nseverity: major\n\nsrc/paginate.mjs:3 has no test for an empty input.\n\n`).length, 1, "an unrelated extra finding fails");
});

test("record-evidence-cli phase setups and cleanups run against the fixture and close the server", async () => {
  const scenario = (await import("../evals/scenarios/record-evidence-cli.mjs")).default;
  const { execFileSync } = await import("node:child_process");
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "rec-cli-"));
  try {
    fs.cpSync(path.join(import.meta.dirname, "..", "evals", "fixtures", "repo-cli"), repo, { recursive: true });
    const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "pipe" });
    git("init", "-q", "-b", "main");
    // The phases commit through their own git helper, so the identity lives in the repository, not in -c flags (CI has no global one).
    git("config", "user.name", "t");
    git("config", "user.email", "t@t");
    git("add", ".");
    git("commit", "-q", "-m", "fixture");
    const taskDir = path.join(repo, "task");
    fs.mkdirSync(path.join(taskDir, "evidence"), { recursive: true });
    const hostFile = path.join(taskDir, "upload-host.txt");
    for (const phase of scenario.phases) {
      const setup = await phase.setup?.({ repo, taskDir });
      assert.ok(setup, "setup returns state");
      await setup.cleanup?.();
    }
    assert.ok(fs.existsSync(hostFile), "phase 2 setup names its upload host");
    await assert.rejects(fetch(fs.readFileSync(hostFile, "utf8").trim()), "the upload server is closed after cleanup");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("iteration grading binds one immutable successor and never accepts rewritten seed bytes", async t => {
  const { revisionProblems, seed } = await import("../evals/iterate-grade.mjs");
  const { initTaskArtifacts, reserveArtifactIteration, recordArtifact } = await import("../shared/task-artifacts.mjs");
  const { artifacts } = await import("../evals/lib.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "iterate-ledger-"));
  const taskDir = path.join(root, "iterate-ledger");
  fs.mkdirSync(taskDir);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initTaskArtifacts(taskDir);
  const file = "artifacts/research/primary/0001.md";
  const seedText = "---\ntype: research\nsummary: Original findings\n---\n# Findings\n\nOriginal fact.\n";
  seed({ [file]: seedText })({ taskDir });
  const before = fs.readFileSync(path.join(taskDir, file));
  const allocation = reserveArtifactIteration(taskDir, "research", "primary");
  fs.writeFileSync(path.join(taskDir, allocation.writePath), "---\ntype: research\nsummary: Corrected grounded findings\n---\n# Findings\n\nCorrected fact.\n");
  const saved = recordArtifact(taskDir, "research", "primary", "research", allocation.writePath);
  const ctx = { taskDir, taskRel: ".agents/tasks/test", artifacts: artifacts(taskDir), answer: "", template: "", live: false };
  const grade = context => revisionProblems("iterate", context, { file, type: "research", seedText });
  assert.deepEqual(grade(ctx), []);
  assert.equal(saved.supersedes, ctx.artifacts.find(artifact => artifact.file === file).record.id);
  assert.deepEqual(fs.readFileSync(path.join(taskDir, file)), before);
  assert.ok(grade({ ...ctx, artifacts: ctx.artifacts.filter(artifact => artifact.file === file) }).some(problem => problem.includes("no immutable successor")));
  assert.ok(grade({ ...ctx, artifacts: ctx.artifacts.map(artifact => artifact.file === file ? { ...artifact, text: "rewritten" } : artifact) }).some(problem => problem.includes("rewritten")));
  assert.ok(grade({ ...ctx, artifacts: ctx.artifacts.map(artifact => artifact.file === saved.path ? { ...artifact, record: { ...artifact.record, supersedes: "wrong" } } : artifact) }).some(problem => problem.includes("supersede")));
});

test("explicit security coverage cannot turn an unavailable scanner into a clean scan", async () => {
  const { checkScan } = await import("../evals/scenarios/security-check-opt-in.mjs");
  const context = {
    live: false,
    answer: "github.com/eval/notifyctl Semgrep 1.168.0 incomplete; Gitleaks 8.24.0 complete.",
    stubCalls: ["semgrep scan --json --config auto", "gitleaks git --report-format=json"],
  };
  assert.deepEqual(checkScan("incomplete")(context), []);
  assert.ok(checkScan("incomplete")({ ...context, answer: context.answer + " All clear." }).some(problem => /advertised as clean/.test(problem)));
  assert.ok(checkScan("complete")({ ...context, answer: context.answer.replace("Gitleaks 8.24.0 complete", "Gitleaks 8.24.0 incomplete") }).some(problem => /complete coverage/.test(problem)));
  assert.ok(checkScan("incomplete")({ ...context, stubCalls: ["gitleaks git --report-format=json"] }).some(problem => /Semgrep scan was not executed/.test(problem)));
  assert.ok(checkScan("incomplete")({ ...context, stubCalls: [...context.stubCalls, "gh pr comment 1 --body clean"] }).some(problem => /hosted publication/.test(problem)));
});
