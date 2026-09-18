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

// A fake `archon`: logs its argv one line per argument, answers `get` with the fixture and `wait` with
// an attention result, or fails the way the CLI fails outside a git work tree when FAKE_FAIL is set.
const FAKE_ARCHON = `#!/bin/bash
printf '%s\\n' "$@" >> "$FAKE_LOG"
if [ -n "\${FAKE_FAIL:-}" ]; then
  printf '{ "ok": false, "error": "Error: Not in a git repository.\\nThe Archon CLI must be run from within a git repository." }\\n'
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

const REPORT = '\nprintf "%s|%s|%s|%s\\n" "$status" "$cwd" "$node" "$(echo $decisions)"\n';

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

test("respond and every wait chunk name the run's own worktree, and the loop breaks on a terminal status", async () => {
  const result = await bash(RESPOND, { decision: "approve", text: "", cwd: "/runs/verbose-flag" });
  assert.equal(result.code, 0, result.err);
  const calls = result.argv.join(" ");
  assert.match(calls, /respond r1 approve.*--detach --cwd \/runs\/verbose-flag/s);
  assert.match(calls, /wait r1 --json --timeout 600 --cwd \/runs\/verbose-flag/s);
  assert.equal(result.argv.filter((a) => a === "wait").length, 1, "a paused status breaks the loop after one chunk");
});

test("a get that fails inside the wait loop ends the steward instead of spinning", async () => {
  const result = await bash(RESPOND, { decision: "approve", text: "", cwd: "/runs/verbose-flag", FAKE_FAIL: "1" });
  assert.notEqual(result.code, 0);
  assert.equal(result.argv.filter((a) => a === "wait").length, 1);
});
