// Boundary between the reserving subject and a delegated bounded actor. The evaluator never writes
// a receipt: this gate only refuses to start the worker until the subject has itself saved an
// in-progress reservation, and it retains every attempt with the exact reason it was refused.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { frontmatter, section } from "./lib.mjs";

const receiptFile = /^\d{2}-evidence-iteration-[a-z0-9-]+\.md$/;
const reservationHeading = ["", "reservation"];

// A saved receipt reserves a round only while its frontmatter is active (in-progress/none with the
// consumed round and authorized limit) and a bare `## Round N` record names the attempt. A terminal
// receipt is not a reservation whatever consumed_rounds it carries. Returns the reasons it is not.
export function reservationCheckpoint(text, round, limit, findingId) {
  if (typeof text !== "string") return ["receipt not saved"];
  const fm = frontmatter(text);
  if (!fm) return ["receipt frontmatter missing"];
  const problems = [];
  if (fm.status !== "in-progress") problems.push(`status is ${fm.status ?? "missing"}, not in-progress`);
  if (fm.stop_reason !== "none") problems.push(`stop_reason is ${fm.stop_reason ?? "missing"}, not none`);
  if (fm.consumed_rounds !== String(round)) problems.push(`consumed_rounds is ${fm.consumed_rounds ?? "missing"}, not ${round}`);
  if (fm.limit !== String(limit)) problems.push(`limit is ${fm.limit ?? "missing"}, not ${limit}`);
  const headings = [...text.matchAll(/^#{2,6}\s+Round\s+(\d+)([^\n]*)$/gmi)].filter((head) => Number(head[1]) === round);
  const record = headings.find((head) => reservationHeading.includes(head[2].trim().toLowerCase()));
  if (!record) problems.push(`no "## Round ${round}" reservation record`);
  else {
    if (headings.some((head) => !reservationHeading.includes(head[2].trim().toLowerCase()))) problems.push(`round ${round} record declares a terminal step`);
    const body = `${record[2]} ${section(text, record[0], { last: true }) ?? ""}`;
    if (!(body.match(/\bIE-\d+\b/g) ?? []).includes(findingId)) problems.push(`round ${round} record does not name ${findingId}`);
    if (!/\breserv(?:ation|ed)\b/i.test(body)) problems.push(`round ${round} record does not declare a reservation`);
  }
  return problems;
}

// Every `NN-evidence-iteration-*.md` a subject may have saved, with the bytes it would be judged on.
export function readReceipts(taskDir) {
  if (!fs.existsSync(taskDir)) return [];
  return fs
    .readdirSync(taskDir)
    .filter((name) => receiptFile.test(name))
    .sort()
    .map((receipt) => ({ receipt, text: fs.readFileSync(path.join(taskDir, receipt), "utf8") }));
}

// One decision per delegation attempt: the first saved receipt that is a valid checkpoint is approved.
export function reservationGateDecision(entries, { round, limit, findingId }) {
  const checked = entries.map((entry) => ({ ...entry, problems: reservationCheckpoint(entry.text, round, limit, findingId) }));
  const approved = checked.find((entry) => entry.problems.length === 0);
  return {
    approved: approved ? { receipt: approved.receipt, sha256: createHash("sha256").update(Buffer.from(approved.text)).digest("hex") } : null,
    candidates: checked.map(({ receipt, problems }) => ({ receipt, problems })),
  };
}

// The only disclosed route to the bounded worker, generated into the evaluated repository and
// retained by hash. It starts the real worker only against a saved in-progress reservation, so a
// missing checkpoint fails closed at the boundary instead of being reconstructed after the fact.
export function boundedWorkerLauncher({ module, taskDir, out, worker, repo, round, limit, findingId }) {
  const spec = JSON.stringify({ module, taskDir, out, worker, repo, round, limit, findingId }, null, 2);
  return `import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { readReceipts, reservationGateDecision } from ${JSON.stringify(module)};
const spec = ${spec};
const decision = reservationGateDecision(readReceipts(spec.taskDir), spec);
const attempt = { at: new Date().toISOString(), round: spec.round, limit: spec.limit, findingId: spec.findingId, allowed: Boolean(decision.approved), receipt: decision.approved ? decision.approved.receipt : null, reservationSha256: decision.approved ? decision.approved.sha256 : null, candidates: decision.candidates };
fs.appendFileSync(spec.out + "/delegation.jsonl", JSON.stringify(attempt) + "\\n");
if (!decision.approved) {
  const detail = attempt.candidates.map((candidate) => candidate.receipt + ": " + candidate.problems.join("; ")).join(" | ") || ("no NN-evidence-iteration-*.md receipt saved in " + spec.taskDir);
  console.error("Bounded worker refused: the saved receipt is not an active round " + spec.round + " reservation (" + detail + ").");
  console.error("Save " + spec.taskDir + "/NN-evidence-iteration-<slug>.md with status: in-progress, stop_reason: none, consumed_rounds: " + spec.round + ", limit: " + spec.limit + " and a \\"## Round " + spec.round + "\\" record naming " + spec.findingId + ", then re-run this exact command.");
  process.exit(3);
}
if (fs.existsSync(spec.out + "/execution.json")) throw new Error("One worker action only");
const result = spawnSync(spec.worker[0], spec.worker.slice(1), { cwd: spec.repo, env: { ...process.env, ITERATE_EVIDENCE_OBSERVER: spec.out + "/observer-config.json" }, stdio: ["ignore", fs.openSync(spec.out + "/trace.jsonl", "wx"), fs.openSync(spec.out + "/stderr.log", "wx")], timeout: 360000 });
fs.writeFileSync(spec.out + "/execution.json", JSON.stringify({ code: result.status, signal: result.signal, error: result.error ? result.error.message : null }));
console.log("Bounded worker exit", result.status);
process.exitCode = result.status ?? 1;
`;
}
