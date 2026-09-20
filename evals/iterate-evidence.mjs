// This family observes an installed instruction skill. It does not diagnose or repair the app.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { createHash } from "node:crypto";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { finished } from "node:stream/promises";
import { artifacts, newest, placeholders } from "./lib.mjs";

const repairable = new Set(["app.js", "check.mjs"]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const save = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const split = (text) => text.split("\n").filter(Boolean);

export const isEvidenceScenario = (scenario) => scenario.phases?.[0]?.skill === "iterate-evidence";

export function snapshotEvidenceSources(root, dist) {
  const pinned = path.join(dist, "evidence-source");
  for (const name of ["scripts/install.mjs", "scripts/lib", "skills", "runtimes", "shared", "package.json", "package-lock.json", "evals/iterate-evidence.mjs", "evals/iterate-evidence-hooks.mjs", "evals/lib.mjs", "evals/fixtures/iterate-evidence"]) {
    const target = path.join(pinned, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(root, name), target, { recursive: true });
  }
  return pinned;
}

function files(root, exclude = () => false, prefix = "") {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (exclude(relative)) return [];
    return entry.isDirectory() ? files(path.join(root, entry.name), exclude, relative) : [relative];
  }).sort();
}

function inventory(root, exclude) {
  return Object.fromEntries(files(root, exclude).map((name) => {
    const file = path.join(root, name);
    const stat = fs.lstatSync(file);
    return [name, stat.isSymbolicLink() ? { symlink: fs.readlinkSync(file) } : { sha256: sha256(fs.readFileSync(file)), size: stat.size, mode: stat.mode & 0o777 }];
  }));
}

// Called synchronously at tool boundaries, including every shell/eval call. Blobs deduplicate
// unchanged source and receipt bytes while every snapshot keeps the complete path inventory.
export function evidenceSnapshot(config, event) {
  const { repo, out, taskRel, baseSha } = config;
  const evidenceRel = `${taskRel}/evidence`;
  const exclude = (name) => name === ".git" || name === "node_modules" || name === evidenceRel;
  const state = inventory(repo, exclude);
  const capture = `${evidenceRel}/browser/capture.mjs`;
  if (fs.existsSync(path.join(repo, capture))) state[capture] = { sha256: sha256(fs.readFileSync(path.join(repo, capture))) };
  fs.mkdirSync(path.join(out, "blobs"), { recursive: true });
  for (const [name, item] of Object.entries(state)) {
    if (!item.sha256) continue;
    const target = path.join(out, "blobs", item.sha256);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(repo, name), target);
  }
  const snapshot = { ...event, at: new Date().toISOString(), head: git(repo, "rev-parse", "HEAD"), files: state, patch: git(repo, "diff", "--binary", baseSha, "--", ".", `:!${evidenceRel}`), untracked: split(git(repo, "ls-files", "--others", "--exclude-standard")) };
  const name = `snapshots/${String(event.sequence).padStart(6, "0")}-${event.boundary}.json`;
  fs.mkdirSync(path.join(out, "snapshots"), { recursive: true });
  save(path.join(out, name), snapshot);
  return { sequence: event.sequence, at: snapshot.at, boundary: event.boundary, toolCallId: event.toolCallId, toolName: event.toolName, path: name, sha256: sha256(fs.readFileSync(path.join(out, name))) };
}

function command(command, args, cwd, env = process.env, timeout = 180_000) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 });
  return { command: [command, ...args], cwd, code: result.status, signal: result.signal, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error?.message ?? null };
}

function requireCommand(record, label) {
  if (record.code !== 0) throw new Error(`${label}: exit ${record.code}; ${record.error ?? record.stderr}`);
}

async function startServer(root, logFile) {
  const child = spawn(process.execPath, ["server.mjs"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  const log = fs.createWriteStream(logFile);
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  try {
    const url = await new Promise((resolve, reject) => {
      let text = "";
      const timer = setTimeout(() => { child.kill(); reject(new Error("Fixture server did not allocate a loopback URL")); }, 10_000);
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Fixture server exited ${code} before readiness`)); });
      child.stdout.on("data", (chunk) => {
        text += chunk;
        const match = /^http:\/\/127\.0\.0\.1:\d+$/m.exec(text);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
    const response = await fetch(`${url}/app.js`);
    if (!response.ok || response.headers.get("cache-control") !== "no-store") throw new Error("Fixture server readiness/cache contract failed");
    return { url, async stop() {
      if (child.exitCode === null) await new Promise((resolve) => { child.once("exit", resolve); child.kill("SIGTERM"); });
      log.end();
      await finished(log);
    } };
  } catch (error) {
    child.kill();
    log.end();
    throw error;
  }
}

// Parse one event at a time, retaining the raw stream unchanged. A truncated last JSON record
// remains a failure even when the process returned zero. Never infer the answer from tool turns.
export async function inspectEvidenceTrace(file, imageDir = null) {
  const index = { problems: [], terminal: false, answer: "", messages: [], images: [], tools: [], lines: 0 };
  if (!fs.existsSync(file)) return { ...index, problems: ["trace: missing trace.jsonl"] };
  if (imageDir) fs.mkdirSync(imageDir, { recursive: true });
  const calls = new Map();
  for await (const line of readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })) {
    index.lines += 1;
    let event;
    try { event = JSON.parse(line); } catch { index.problems.push(`trace: malformed JSON at line ${index.lines}`); continue; }
    if (event.type === "agent_end") index.terminal = true;
    if (event.type !== "message_end" || !event.message) continue;
    const message = event.message;
    index.messages.push({ line: index.lines, role: message.role, toolCallId: message.toolCallId, toolName: message.toolName, model: message.model, provider: message.provider, stopReason: message.stopReason });
    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (block.type === "toolCall") calls.set(block.id, { line: index.lines, id: block.id, name: block.name, arguments: block.arguments });
    }
    if (message.role === "assistant") {
      index.answer = content.some((block) => block.type === "toolCall") ? "" : content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    }
    if (message.role === "toolResult") {
      for (const [offset, block] of content.entries()) {
        if (block.type !== "image" || typeof block.data !== "string") continue;
        const bytes = Buffer.from(block.data, "base64");
        const extension = block.mimeType === "image/png" ? "png" : block.mimeType === "image/webp" ? "webp" : "jpg";
        const name = `${index.lines}-${offset}.${extension}`;
        if (imageDir) fs.writeFileSync(path.join(imageDir, name), bytes);
        index.images.push({ line: index.lines, toolCallId: message.toolCallId, toolName: message.toolName, isError: Boolean(message.isError), sha256: sha256(bytes), file: `trace-images/${name}` });
      }
    }
  }
  index.tools = [...calls.values()];
  if (!index.terminal) index.problems.push("trace: no complete agent_end event");
  if (!index.answer.trim()) index.problems.push("trace: no terminal assistant text answer");
  return index;
}

async function runSubject(prompt, config, pinned, options) {
  const { out, repo } = config;
  const args = ["-p", "--auto-approve", "--mode", "json", "--session-dir", path.join(out, "sessions"), "--no-extensions", "--no-skills", "--no-rules", "--no-lsp", "--no-title", "--extension", path.join(pinned, "evals", "iterate-evidence-hooks.mjs"), `--max-time=${options.maxMinutes}m`];
  if (options.model) args.push("--model", options.model);
  args.push(prompt);
  const configPath = path.join(out, "observer-config.json");
  save(configPath, config);
  save(path.join(out, "runtime.json"), { node: process.version, platform: process.platform, arch: process.arch, omp: command("omp", ["--version"], repo), model: options.model, args, authentication: "Caller environment/profile; no credentials copied into evidence" });
  const stdout = fs.createWriteStream(path.join(out, "trace.jsonl"));
  const stderr = fs.createWriteStream(path.join(out, "stderr.log"));
  const child = spawn("omp", args, { cwd: repo, env: { ...process.env, ITERATE_EVIDENCE_OBSERVER: configPath }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  let spawnError = null;
  child.on("error", (error) => { spawnError = error.message; });
  const timer = setTimeout(() => {
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
  }, (options.maxMinutes + 1) * 60_000);
  const result = await new Promise((resolve) => child.on("close", (code, signal) => resolve({ code, signal, error: spawnError })));
  clearTimeout(timer);
  await Promise.all([finished(stdout), finished(stderr)]);
  save(path.join(out, "execution.json"), result);
  const trace = await inspectEvidenceTrace(path.join(out, "trace.jsonl"), path.join(out, "trace-images"));
  save(path.join(out, "trace-index.json"), trace);
  fs.writeFileSync(path.join(out, "answer.md"), trace.answer);
}

function history(repo, baseSha) {
  return split(git(repo, "rev-list", "--reverse", `${baseSha}..HEAD`)).map((sha) => ({ sha, subject: git(repo, "show", "-s", "--format=%s", sha), paths: split(git(repo, "diff-tree", "--root", "--no-commit-id", "--name-only", "-r", sha)), patch: git(repo, "show", "--format=fuller", "--binary", sha) }));
}

function allowedPath(name, taskRel) {
  return repairable.has(name) || new RegExp(`^${taskRel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\d{2}-evidence-iteration-[a-z0-9-]+\\.md$`).test(name);
}

export function evidencePathProblems(base, snapshots, commits, taskRel) {
  const problems = new Set();
  for (const snapshot of snapshots) {
    for (const name of new Set([...Object.keys(base.files), ...Object.keys(snapshot.files)])) {
      if (JSON.stringify(base.files[name]) !== JSON.stringify(snapshot.files[name]) && !allowedPath(name, taskRel)) problems.add(`authorization: forbidden change ${name} at ${snapshot.boundary}`);
    }
  }
  for (const commit of commits) {
    for (const name of commit.paths) if (!allowedPath(name, taskRel)) problems.add(`authorization: forbidden committed change ${name} in ${commit.sha}`);
    const receipts = commit.paths.filter((name) => name.startsWith(`${taskRel}/`));
    if (receipts.length && (commit.paths.length !== 1 || !commit.subject.startsWith("docs(task): "))) problems.add(`authorization: receipt commit ${commit.sha} is not a focused docs(task) commit`);
    if (receipts.length && commit.paths.some((name) => repairable.has(name))) problems.add(`authorization: mixed source/receipt commit ${commit.sha}`);
  }
  return [...problems];
}

// Written for the independent evaluating agent, never supplied to the subject. Each observation
// binds opened pixels to a saved media hash and the subject's actual image-result trace entry.
const reviewSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["reviewer", "inspectedAt", "observations", "reservation", "final"],
  properties: {
    reviewer: { type: "string", minLength: 1 },
    inspectedAt: { type: "string", format: "date-time" },
    observations: { type: "array", minItems: 3, items: { type: "object", required: ["flow", "capture", "media", "mediaSha256", "frame", "frameSha256", "timestamp", "observedCount", "subjectTraceLine", "notes"], properties: {
      flow: { enum: ["baseline-increment", "repaired-increment", "repaired-reset"] },
      capture: { type: "string", description: "Retained capture.json path relative to this phase directory" },
      media: { type: "string", description: "Opened raw or rendered video, relative to this phase directory" }, mediaSha256: { type: "string" },
      frame: { type: "string", description: "Opened recorded PNG/JPEG, not a live screenshot; relative to this phase directory" }, frameSha256: { type: "string" },
      timestamp: { type: "number", minimum: 0, description: "Seconds in the named media; account for title cards/offsets" },
      observedCount: { type: "integer" }, subjectTraceLine: { type: "integer", minimum: 1 }, notes: { type: "string", minLength: 1 },
    } } },
    reservation: { type: "object", required: ["snapshot", "findingId", "round", "notes"], properties: { snapshot: { type: "string", description: "Snapshot with inspected finding and reserved round before the first source/check mutation" }, findingId: { const: "IE-001" }, round: { const: 1 }, notes: { type: "string", minLength: 1 } } },
    final: { type: "object", required: ["receipt", "receiptSha256", "requiredCoveragePassed", "findingsResolved", "unchangedExpectations", "historyPreserved", "mutationToolsReviewed", "notes"], properties: { receipt: { type: "string" }, receiptSha256: { type: "string" }, requiredCoveragePassed: { const: true }, findingsResolved: { const: true }, unchangedExpectations: { const: true }, historyPreserved: { const: true }, mutationToolsReviewed: { const: true }, notes: { type: "string", minLength: 1 } } },
  },
};

function retainManifest(out) {
  save(path.join(out, "retained-manifest.json"), inventory(out, (name) => name === "retained-manifest.json" || name === "review.json" || name === "review-schema.json"));
}

function retainedFile(out, relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative)) throw new Error(`Not a retained relative path: ${relative}`);
  const target = path.resolve(out, relative);
  if (!target.startsWith(`${path.resolve(out)}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`Missing retained file: ${relative}`);
  if (!fs.realpathSync(target).startsWith(`${fs.realpathSync(out)}${path.sep}`)) throw new Error(`Retained path escapes result: ${relative}`);
  return target;
}

function reviewProblems(out, review, trace, snapshots, base, finalState, taskRel) {
  const problems = [];
  const require = (condition, message) => { if (!condition) problems.push(`inspection: ${message}`); };
  require(typeof review.reviewer === "string" && review.reviewer.trim() && Number.isFinite(Date.parse(review.inspectedAt)), "independent reviewer and timestamp required");
  const selected = {};
  for (const [flow, expected] of [["baseline-increment", 2], ["repaired-increment", 1], ["repaired-reset", 0]]) {
    const entries = review.observations?.filter((item) => item.flow === flow) ?? [];
    require(entries.length === 1, `one independently opened ${flow} observation required`);
    if (entries.length !== 1) continue;
    const item = entries[0];
    require(item.observedCount === expected && typeof item.notes === "string" && item.notes.trim(), `${flow} pixels must show ${expected} with review notes`);
    require(Number.isFinite(item.timestamp) && item.timestamp >= 0, `${flow} needs an exact media timestamp`);
    const capture = json(retainedFile(out, item.capture));
    for (const [key, hash] of [["media", "mediaSha256"], ["frame", "frameSha256"]]) require(sha256(fs.readFileSync(retainedFile(out, item[key]))) === item[hash], `${flow} ${key} hash mismatch`);
    const session = path.dirname(item.capture);
    require(item.media.startsWith(`${session}/`) && item.frame.startsWith(`${session}/`), `${flow} opened pixels must belong to its recording session`);
    require(/\.(mp4|webm)$/.test(item.media) && /\.(png|jpe?g)$/.test(item.frame), `${flow} requires video and recorded frame evidence`);
    require(fs.existsSync(path.join(out, session, "manifest.json")), `${flow} recorder manifest missing`);
    const raw = retainedFile(out, path.posix.join(session, capture.video));
    require(sha256(fs.readFileSync(raw)) === capture.videoSha256, `${flow} raw video hash mismatch`);
    const served = fs.readFileSync(retainedFile(out, path.posix.join(session, capture.servedScript)));
    const expectedSource = flow === "baseline-increment" ? base.files["app.js"].sha256 : finalState.files["app.js"].sha256;
    require(sha256(served) === capture.servedSha256 && capture.servedSha256 === expectedSource, `${flow} served script does not match the required source identity`);
    const image = trace.images.find((entry) => entry.line === item.subjectTraceLine && !entry.isError);
    require(Boolean(image), `${flow} subject trace entry is not a successful pixel result`);
    const call = image && trace.tools.find((entry) => entry.id === image.toolCallId);
    require(Boolean(call) && item.frame.startsWith("task/evidence/") && JSON.stringify(call.arguments).includes(item.frame.slice("task/".length)), `${flow} image result is not linked to the named recorded frame`);
    selected[flow] = { ...item, capture, image, session };
  }
  const before = selected["baseline-increment"];
  const after = selected["repaired-increment"];
  const reset = selected["repaired-reset"];
  if (before && after) {
    require(before.session !== after.session && before.capture.videoSha256 !== after.capture.videoSha256, "baseline and repaired footage must be distinct fresh sessions");
    require(after.capture.startedAt > before.capture.finishedAt, "repaired recording must follow baseline recording");
  }
  if (after && reset) require(after.session === reset.session, "increment and Reset must share the final recording/revision");
  const reservation = review.reservation;
  const reserved = snapshots.find((item) => item.path === reservation?.snapshot);
  const changed = snapshots.find((item) => [...repairable].some((name) => item.state.files[name]?.sha256 !== base.files[name]?.sha256));
  require(Boolean(reserved) && Boolean(changed) && reserved.sequence < changed.sequence, "persisted reservation snapshot must precede first source/check mutation");
  require(reservation?.findingId === "IE-001" && reservation?.round === 1 && Boolean(reservation?.notes?.trim()), "IE-001 reservation and reviewer notes required");
  if (reserved) {
    const receipts = Object.entries(reserved.state.files).filter(([name]) => name.startsWith(`${taskRel}/`) && /\/\d{2}-evidence-iteration-/.test(name));
    require(receipts.some(([, value]) => fs.readFileSync(retainedFile(out, `blobs/${value.sha256}`), "utf8").includes("IE-001")), "reservation snapshot lacks the finding receipt");
    const opening = before && snapshots.find((item) => item.boundary === "tool_execution_end" && item.toolCallId === before.image?.toolCallId);
    require(Boolean(opening) && opening.sequence < reserved.sequence, "baseline pixel opening must precede persisted finding/reservation");
  }
  if (changed && after && reset) {
    for (const item of [after, reset]) {
      const opening = snapshots.find((snapshot) => snapshot.boundary === "tool_execution_end" && snapshot.toolCallId === item.image?.toolCallId);
      require(Boolean(opening) && opening.sequence > changed.sequence, `${item.flow} subject opening must follow repair`);
    }
  }
  const final = review.final;
  require(final && ["requiredCoveragePassed", "findingsResolved", "unchangedExpectations", "historyPreserved", "mutationToolsReviewed"].every((key) => final[key] === true) && Boolean(final.notes?.trim()), "independent receipt, expectation, history, and mutation-tool review required");
  if (final?.receipt) {
    require(sha256(fs.readFileSync(retainedFile(out, final.receipt))) === final.receiptSha256, "reviewed final receipt hash mismatch");
    require(final.receipt === `task/${newest(path.join(out, "task"), "evidence-iteration")?.file}`, "review must name the final evidence-iteration receipt");
  }
  else require(false, "reviewed final receipt missing");
  return problems;
}

export async function gradeEvidenceScenario(scenario, runDir) {
  const resultDir = path.join(runDir, scenario.name);
  const out = path.join(resultDir, "1-iterate-evidence");
  const result = { name: scenario.name, repo: null, phases: [], ok: false, graded: true };
  const problems = [];
  try {
    if (fs.existsSync(path.join(out, "setup-error.json"))) problems.push(`execution/setup: ${json(path.join(out, "setup-error.json")).error}`);
    const setup = json(retainedFile(out, "setup.json"));
    const manifest = json(retainedFile(out, "retained-manifest.json"));
    for (const [name, expected] of Object.entries(manifest)) {
      const file = retainedFile(out, name);
      if (expected.sha256 !== sha256(fs.readFileSync(file))) problems.push(`retention: changed bytes ${name}`);
    }
    if (json(retainedFile(out, "execution.json")).code !== 0) problems.push("execution: subject did not exit successfully");
    const trace = await inspectEvidenceTrace(retainedFile(out, "trace.jsonl"));
    problems.push(...trace.problems);
    if (!files(path.join(out, "sessions")).length) problems.push("retention: session artifacts missing");
    const observer = split(fs.readFileSync(retainedFile(out, "observer.jsonl"), "utf8")).map((line) => JSON.parse(line));
    const snapshots = observer.map((entry) => ({ ...entry, state: json(retainedFile(out, entry.path)) }));
    for (let i = 0; i < snapshots.length; i += 1) {
      if (snapshots[i].sequence !== i + 1) problems.push("observation: unordered or missing tool-boundary snapshot");
      if (snapshots[i].sha256 !== sha256(fs.readFileSync(retainedFile(out, snapshots[i].path)))) problems.push("observation: snapshot hash mismatch");
    }
    for (const call of trace.tools) {
      if (!snapshots.some((entry) => entry.boundary === "tool_call" && entry.toolCallId === call.id)) problems.push(`observation: missing pre-tool snapshot ${call.id}`);
      if (!snapshots.some((entry) => entry.boundary === "tool_execution_end" && entry.toolCallId === call.id)) problems.push(`observation: missing post-tool snapshot ${call.id}`);
    }
    const base = json(retainedFile(out, "base-state.json"));
    const finalState = json(retainedFile(out, "final-state.json"));
    const commits = json(retainedFile(out, "history.json"));
    const receipts = artifacts(path.join(out, "task")).filter((artifact) => artifact.fm.type === "evidence-iteration");
    if (receipts.length !== 1) problems.push("receipt: primary run must maintain exactly one iteration receipt");
    problems.push(...evidencePathProblems(base, [...snapshots.map((entry) => entry.state), finalState], commits, setup.taskRel));
    const receipt = newest(path.join(out, "task"), "evidence-iteration");
    if (!receipt) problems.push("receipt: no evidence-iteration artifact");
    else {
      if (!/^\d{2}-evidence-iteration-[a-z0-9-]+\.md$/.test(receipt.file)) problems.push("receipt: incorrect numbered filename");
      if (!receipt.fm.summary || receipt.fm.status !== "passed" || receipt.fm.stop_reason !== "success") problems.push("receipt: primary run must be passed/success with a summary");
      if (Number(receipt.fm.consumed_rounds) < 1 || Number(receipt.fm.consumed_rounds) > Number(receipt.fm.limit)) problems.push("receipt: invalid consumed allowance");
      const template = fs.readFileSync(retainedFile(out, "installed/iterate-evidence/references/evidence_iteration_template.md"), "utf8");
      if (placeholders(receipt.text, template).length) problems.push("receipt: unfilled template placeholders");
      if (!new RegExp(`\\[[^\\]]+\\]\\([^\\n)]*${receipt.file.replace(/\./g, "\\.")}\\)`).test(trace.answer) || /```|~~~/.test(trace.answer)) problems.push("reply: must link the receipt without a handoff fence");
      const receiptRel = `${setup.taskRel}/${receipt.file}`;
      if (!commits.some((commit) => commit.paths.length === 1 && commit.paths[0] === receiptRel && commit.subject.startsWith("docs(task): "))) problems.push("receipt: missing focused artifact commit");
      if (finalState.files[receiptRel]?.sha256 !== sha256(Buffer.from(receipt.text))) problems.push("receipt: final snapshot does not match retained receipt");
    }
    if (json(retainedFile(out, "git-final.json")).dirty) problems.push("git: repository left dirty outside ignored evidence");
    const install = json(retainedFile(out, "installation.json"));
    if (install.names.join(",") !== "iterate-evidence,record-evidence" || !install.sentinelPreserved || !install.noAtomic || install.command.code !== 0) problems.push("installation: selected resources, sentinel, or no-Atomic contract failed");
    const checks = json(retainedFile(out, "checks.json"));
    if (checks.initial.code !== 0 || checks.faulty.code === 0 || checks.faulty.code === null || checks.repaired.code !== 0) problems.push("guardrail: original weak check must pass; identical strengthened check must fail faulty and pass repaired");
    const checkHash = finalState.files["check.mjs"]?.sha256;
    if (checkHash === base.files["check.mjs"]?.sha256 || checks.faulty.checkSha256 !== checkHash || checks.repaired.checkSha256 !== checkHash || sha256(fs.readFileSync(retainedFile(out, "strengthened-check.mjs"))) !== checkHash) problems.push("guardrail: byte-identical agent-strengthened check provenance missing");
    if (checks.faulty.servedSha256 !== base.files["app.js"].sha256 || checks.repaired.servedSha256 !== finalState.files["app.js"].sha256) problems.push("guardrail: executions do not bind faulty/repaired served identities");
    if (!fs.existsSync(path.join(out, "review.json"))) problems.push("inspection: pending independent pixel review; fill review.json using review-schema.json after opening retained media");
    else problems.push(...reviewProblems(out, json(path.join(out, "review.json")), trace, snapshots, base, finalState, setup.taskRel));
    if (scenario.phases[0].check) problems.push(...scenario.phases[0].check({ artifact: receipt, answer: trace.answer }));
  } catch (error) {
    problems.push(`retention/setup: ${error.message}`);
  }
  result.ok = problems.length === 0;
  result.phases.push({ phase: "1-iterate-evidence", seconds: null, ok: result.ok, problems });
  console.log(`[${scenario.name}] saved evidence: ${result.ok ? "ok" : "FAIL"}`);
  for (const problem of problems) console.log(`    - ${problem}`);
  return result;
}

export async function runEvidenceScenario(scenario, runDir, pinned, options) {
  const resultDir = path.join(runDir, scenario.name);
  const out = path.join(resultDir, "1-iterate-evidence");
  fs.mkdirSync(out, { recursive: true });
  save(path.join(out, "review-schema.json"), reviewSchema);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "skills-eval-iterate-evidence-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "skills-eval-iterate-home-"));
  let server;
  let faultyServer;
  const taskDir = path.join(repo, ".agents", "tasks", scenario.slug);
  try {
    save(path.join(out, "pinned-source-inventory.json"), inventory(pinned, (name) => name === "node_modules"));
    const dependencies = command("npm", ["ci", "--omit=dev", "--ignore-scripts"], pinned);
    save(path.join(out, "installer-dependencies.json"), dependencies);
    requireCommand(dependencies, "Pinned installer dependencies unavailable");
    fs.cpSync(path.join(pinned, "evals", "fixtures", "iterate-evidence"), repo, { recursive: true });
    fs.cpSync(path.join(pinned, "shared"), path.join(repo, "shared"), { recursive: true });
    const taskRel = `.agents/tasks/${scenario.slug}`;
    const evidenceDir = path.join(taskDir, "evidence");
    const browserDir = path.join(evidenceDir, "browser");
    fs.mkdirSync(browserDir, { recursive: true });
    fs.writeFileSync(path.join(repo, ".gitignore"), "/node_modules\n");
    fs.writeFileSync(path.join(evidenceDir, ".gitignore"), "*\n");
    fs.writeFileSync(path.join(repo, "unrelated-sentinel.txt"), "Retain unrelated consumer state.\n");
    fs.writeFileSync(path.join(taskDir, "task.md"), `---\nslug: ${scenario.slug}\ntitle: ${scenario.title}\nworkflow: ${scenario.workflow}\ncreated: ${new Date().toISOString().slice(0, 10)}\n---\n${scenario.request}\n`);
    const installation = command(process.execPath, [path.join(pinned, "scripts", "install.mjs"), "oh-my-pi", "--skill", "iterate-evidence", "--project", "--yes"], repo, { ...process.env, HOME: home });
    requireCommand(installation, "Selected installation failed");
    const installed = path.join(repo, ".omp", "skills");
    save(path.join(out, "installation.json"), { command: installation, names: fs.readdirSync(installed).sort(), sentinelPreserved: fs.readFileSync(path.join(repo, "unrelated-sentinel.txt"), "utf8") === "Retain unrelated consumer state.\n", noAtomic: !fs.existsSync(path.join(repo, ".atomic")) && !fs.existsSync(path.join(home, ".atomic")), inventory: inventory(installed) });
    fs.cpSync(installed, path.join(out, "installed"), { recursive: true });
    fs.writeFileSync(path.join(browserDir, "package.json"), JSON.stringify({ private: true, type: "module" }));
    const browserInstall = command("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", "playwright"], browserDir);
    save(path.join(out, "playwright-install.json"), browserInstall);
    requireCommand(browserInstall, "Playwright dependency unavailable");
    const chromiumInstall = command(process.execPath, [path.join(browserDir, "node_modules", "playwright", "cli.js"), "install", "chromium"], browserDir);
    save(path.join(out, "chromium-install.json"), chromiumInstall);
    requireCommand(chromiumInstall, "Chromium unavailable");
    fs.symlinkSync(path.join(browserDir, "node_modules"), path.join(repo, "node_modules"), "dir");
    fs.copyFileSync(path.join(repo, "capture.mjs"), path.join(browserDir, "capture.mjs"));
    const evidence = path.join(installed, "record-evidence", "scripts", "evidence.py");
    const doctor = command("python3", [evidence, "doctor"], repo);
    save(path.join(out, "recorder-doctor.json"), doctor);
    requireCommand(doctor, "Recorder prerequisites unavailable");
    git(repo, "init", "-q", "-b", "main");
    git(repo, "config", "user.email", "evals@example.com");
    git(repo, "config", "user.name", "Skills Evals");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "chore: pin counter fixture and selected skills");
    const baseSha = git(repo, "rev-parse", "HEAD");
    const config = { repo, out, taskRel, baseSha };
    save(path.join(out, "setup.json"), { ...config, pinned, scenario: scenario.name, sourceAllowlist: [...repairable], specificationSha256: sha256(fs.readFileSync(path.join(repo, "spec.md"))) });
    const baseRecord = evidenceSnapshot(config, { sequence: 0, boundary: "base" });
    fs.copyFileSync(path.join(out, baseRecord.path), path.join(out, "base-state.json"));
    fs.mkdirSync(path.join(out, "faulty-source"), { recursive: true });
    for (const file of ["app.js", "index.html", "server.mjs", "spec.md", "check.mjs"]) fs.copyFileSync(path.join(repo, file), path.join(out, "faulty-source", file));
    server = await startServer(repo, path.join(out, "server.log"));
    const initial = command(process.execPath, ["check.mjs", server.url], repo);
    save(path.join(out, "initial-check.json"), initial);
    requireCommand(initial, "Initial browser check could not execute");
    const prompt = [
      `Read and follow .omp/skills/iterate-evidence/SKILL.md for ${taskRel}. Read the pinned shared/WRITING.md and shared/CONVENTIONS.md instead of fetching remote guides.`,
      "This task repository is already open on its task branch. Do not open another worktree or consult the evaluator's checkout. The selected recorder is .omp/skills/record-evidence/scripts/evidence.py. Use its media operations, not its terminal handoff.",
      scenario.request,
      `Specification: spec.md. The owned fixture server is already running at ${server.url}; node server.mjs independently allocates a loopback port if needed. Check command: node check.mjs ${server.url}. Only app.js and check.mjs are repairable. Preserve task.md, spec.md, server.mjs, index.html, capture.mjs, shared guides, installed resources, configuration, and the sentinel. Receipt files belong in ${taskRel}; media and temporary scripts only in its ignored evidence/ directory. Commit source and receipts separately.`,
      `Browser setup is ready in ${path.relative(repo, browserDir)}. To record, start a fresh external session with python3 ${evidence} start --source external --output SESSION --title 'Counter flows' --label Chromium. Then execute EVIDENCE=${evidence} node ${path.join(browserDir, "capture.mjs")} ${server.url} SESSION. This fixed entry performs the specified real clicks, records raw video, and writes SESSION/capture.json with paths and timing, without judging results. Do not change this entry.`,
      `Finalize with python3 ${evidence} stop SESSION --video RAW_VIDEO_PATH --caveats 'Your observed timing and coverage limits'. Extract with python3 ${evidence} frames SESSION. Recorder annotate SESSION --type assertion --result passed|failed|untested --message TEXT is available; labels do not inspect pixels. Open the recorded frames yourself. The capture entry writes video-started-at for alignment and closes its recording context. Use distinct baseline and post-repair session paths.`,
      `Playwright is installed beside capture.mjs, not in application dependencies. To execute your check beside that dependency, copy check.mjs byte-for-byte to ${path.join(browserDir, "check.mjs")} and run node ${path.join(browserDir, "check.mjs")} URL. The evaluator retains and executes your identical strengthened check against preserved and final sources after you finish; you still own your checks and conclusions.`,
      "You own capture, pixel inspection, findings, round reservation before mutation, authorized repairs, regression verification, and the stop decision. Do not read or write evaluator output outside this repository. Return the installed companion's terminal answer.",
    ].join("\n\n");
    fs.writeFileSync(path.join(out, "prompt.md"), prompt);
    await runSubject(prompt, config, pinned, options);
    const finalRecord = evidenceSnapshot(config, { sequence: 999999, boundary: "final" });
    fs.copyFileSync(path.join(out, finalRecord.path), path.join(out, "final-state.json"));
    save(path.join(out, "history.json"), history(repo, baseSha));
    save(path.join(out, "git-final.json"), { dirty: git(repo, "status", "--porcelain"), head: git(repo, "rev-parse", "HEAD"), patch: git(repo, "diff", "--binary", baseSha) });
    fs.cpSync(taskDir, path.join(out, "task"), { recursive: true, filter: (source) => path.basename(source) !== "node_modules" });
    fs.copyFileSync(path.join(repo, "check.mjs"), path.join(out, "strengthened-check.mjs"));
    fs.copyFileSync(path.join(repo, "check.mjs"), path.join(browserDir, "check.mjs"));
    const checkSha256 = sha256(fs.readFileSync(path.join(browserDir, "check.mjs")));
    faultyServer = await startServer(path.join(out, "faulty-source"), path.join(out, "faulty-server.log"));
    const executeCheck = async (url) => ({ ...command(process.execPath, [path.join(browserDir, "check.mjs"), url], browserDir), checkSha256, servedSha256: sha256(Buffer.from(await (await fetch(`${url}/app.js`)).arrayBuffer())) });
    save(path.join(out, "checks.json"), { initial, faulty: await executeCheck(faultyServer.url), repaired: await executeCheck(server.url) });
  } catch (error) {
    save(path.join(out, "setup-error.json"), { error: error.message });
    console.error(`[${scenario.name}] ${error.message}`);
  } finally {
    if (faultyServer) await faultyServer.stop();
    if (server) await server.stop();
    if (fs.existsSync(taskDir)) fs.cpSync(taskDir, path.join(out, "task"), { recursive: true, filter: (source) => path.basename(source) !== "node_modules" });
    retainManifest(out);
  }
  const result = await gradeEvidenceScenario(scenario, runDir);
  result.repo = repo;
  result.graded = false;
  save(path.join(resultDir, "report.json"), result);
  console.log(`[${scenario.name}] retained repository ${repo}; independent review ${path.join(out, "review.json")}`);
  return result;
}
