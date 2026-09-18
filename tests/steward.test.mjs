import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = (name) => fs.readFileSync(path.join(REPO, "skills", "delivery", name, "SKILL.md"), "utf8");

// One fenced bash body, by a marker only that fence carries. Piece 0 is the prose before the first
// fence, where the skill names its own commands in sentences; it is never a fence body.
function fence(source, marker) {
  const body = source.split("```bash").slice(1).find((piece) => piece.split("```")[0].includes(marker));
  assert.ok(body, `no bash fence carries ${marker}`);
  return body.split("```")[0];
}

const READ = fence(skill("deliver"), "approval.nodeId");
const RESPOND = fence(skill("deliver"), 'respond "$run_id"');
const HERD_READ = fence(skill("herd-next"), "approval.nodeId");

const PAUSED = JSON.stringify({
  status: "paused",
  working_path: "/runs/verbose-flag",
  metadata: { approval: { nodeId: "design__cycle", message: "Review .agents/tasks/verbose-flag", decisions: [{ id: "approve" }, { id: "reject" }] } },
});

// The primary inside-Herdr shape: a running run, no gate live yet, so no approval metadata at all.
const RUNNING = JSON.stringify({ status: "running", working_path: "/runs/x", metadata: {} });

// A fake `archon`: logs its argv one line per argument, answers `get` with the fixture and `wait` with
// an attention result, or fails the way the CLI fails outside a git work tree when FAKE_FAIL is set.
// FAKE_FAIL_ON narrows the failure to one subcommand (`$2`, e.g. "respond" or "get"); unset, FAKE_FAIL
// fails every call, the shape a run outside a git work tree takes since every call hits the same repo check.
const FAKE_ARCHON = `#!/bin/bash
printf '%s\\n' "$@" >> "$FAKE_LOG"
if [ -n "\${FAKE_FAIL:-}" ] && { [ -z "\${FAKE_FAIL_ON:-}" ] || [ "$2" = "\${FAKE_FAIL_ON:-}" ]; }; then
  printf '{ "ok": false, "error": "Error: Not in a git repository.\\\\nThe Archon CLI must be run from within a git repository." }\\n'
  exit 1
fi
case "$2" in
  get) printf '%s\\n' "$FAKE_RUN" ;;
  wait) printf '{"result":"attention"}\\n' ;;
esac
exit 0
`;

function bash(script, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-steward-"));
  fs.writeFileSync(path.join(dir, "archon"), FAKE_ARCHON, { mode: 0o755 });
  const log = path.join(dir, "argv.log");
  fs.writeFileSync(log, "");
  return new Promise((resolve) => {
    const child = spawn("/bin/bash", ["-c", script], {
      env: { PATH: `${dir}${path.delimiter}${process.env.PATH}`, FAKE_LOG: log, FAKE_RUN: PAUSED, run_id: "r1", ...env },
    });
    let out = ""; let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("close", (code) => {
      const argv = fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
      fs.rmSync(dir, { recursive: true, force: true });
      resolve({ code, out: out.trim(), err: err.trim(), argv });
    });
    child.stdin.end();
  });
}

const REPORT = '\nprintf "%s|%s|%s|%s\\n" "$run_status" "$cwd" "$node" "$(echo $decisions)"\n';

test("the state read takes status, working_path, the node, and every decision id from a paused run", async () => {
  const result = await bash(READ + REPORT);
  assert.equal(result.code, 0, result.err);
  assert.equal(result.out, "paused|/runs/verbose-flag|design__cycle|approve reject");
});

test("a get that fails ends the read instead of leaving an empty status the loop reads as running", async () => {
  const result = await bash(READ + REPORT, { FAKE_FAIL: "1" });
  assert.notEqual(result.code, 0, "an unguarded read exits 0 and the loop waits forever");
  assert.equal(result.out, "", "nothing downstream of the failed read runs");
  assert.match(result.err, /Not in a git repository/, "Archon's own output is what gets reported");
});

test("herd-next's gate-mode read carries the same guard, so no pane is opened at the path `null`", async () => {
  const ok = await bash(HERD_READ + REPORT);
  assert.equal(ok.out, "paused|/runs/verbose-flag|design__cycle|approve reject");
  const failed = await bash(HERD_READ + REPORT, { FAKE_FAIL: "1" });
  assert.notEqual(failed.code, 0);
  assert.equal(failed.out, "");
});

test("both reads survive a running run with no approval metadata, the primary inside-Herdr shape", async () => {
  const deliver = await bash(READ + REPORT, { FAKE_RUN: RUNNING });
  assert.equal(deliver.code, 0, deliver.err);
  assert.equal(deliver.out, "running|/runs/x||");
  const herdNext = await bash(HERD_READ + REPORT, { FAKE_RUN: RUNNING });
  assert.equal(herdNext.code, 0, herdNext.err);
  assert.equal(herdNext.out, "running|/runs/x||");
});

test("respond and the wait chunk name the run's own worktree, and the fence holds one shell call", async () => {
  const result = await bash(RESPOND, { decision: "approve", text: "", cwd: "/runs/verbose-flag" });
  assert.equal(result.code, 0, result.err);
  const calls = result.argv.join(" ");
  assert.match(calls, /respond r1 approve.*--detach --cwd \/runs\/verbose-flag/s);
  assert.match(calls, /wait r1 --json --timeout 600 --cwd \/runs\/verbose-flag/s);
  assert.equal(result.argv.filter((a) => a === "wait").length, 1, "the fence is straight-line: one respond and one wait, never a loop");
});

test("a get that fails inside the wait loop ends the steward instead of spinning", async () => {
  const result = await bash(RESPOND, { decision: "approve", text: "", cwd: "/runs/verbose-flag", FAKE_FAIL: "1", FAKE_FAIL_ON: "get" });
  assert.notEqual(result.code, 0);
  assert.equal(result.argv.filter((a) => a === "wait").length, 1, "respond and wait both ran; only the trailing get failed");
});

test("a failing respond ends the steward before the wait, instead of dropping the decision silently", async () => {
  const result = await bash(RESPOND, { decision: "approve", text: "", cwd: "/runs/verbose-flag", FAKE_FAIL: "1", FAKE_FAIL_ON: "respond" });
  assert.notEqual(result.code, 0, "a dropped respond must not exit 0 and fall through to the wait");
  assert.equal(result.argv.filter((a) => a === "wait").length, 0, "a failed respond never reaches the wait");
  assert.match(result.err, /Not in a git repository/, "Archon's own output is what gets reported");
});
