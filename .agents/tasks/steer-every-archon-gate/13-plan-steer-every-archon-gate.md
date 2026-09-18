---
task: steer-every-archon-gate
type: plan
summary: "Implements design 12's five recommendations in five phases: guard the `archon workflow get` exit status in `deliver` step 6 and carry `--cwd \"$cwd\"` on every later call, repeat the guard in `herd-next`'s gate mode so a pane never opens at the literal path `null`, add `tests/steward.test.mjs` extracting step 6's bash fences and running them against a fake `archon` on PATH, state in `workflows/delivery.md` that Archon owns its run worktrees and the person removes them, then run a written checklist against a live run to prove acceptance (a), (b), and (c) and record it in that phase's implementation receipt. Phases 1, 2, and 4 are prose edits proved by `npm test` and the acceptance (d) grep; phase 3 is the only new file and adds five tests to the 64 passing at `4ff7078`; phase 5 is the only phase needing a live Herdr workspace and it never blocks a phase. No skill directory and no answer template is added, so `EXPECTED_SKILL_COUNT` stays 42 and `ANSWER_INVENTORY` is unchanged."
repo: skills
branch: herdr-plugin-delivery-flow
sha: 4ff7078587601f7fdbd2cb3ceb1fd73dd9d377ef
---

# Steer every Archon gate through prompts Implementation Plan

## Overview

Close the four gaps research 11 found in the steward loop shipped by phases 05-09: a failed `archon workflow get` read as a running run, a review pane opened at the literal path `null`, zero automated coverage of the loop, and undocumented ownership of abandoned-run worktrees. Acceptance (a), (b), and (c) get a written checklist and one live pass.

Design 12 left five questions open with a recommendation each. This plan implements the recommendations: DQ 1 Option C (manual checklist for the agent behavior, automated test for the bash under it), DQ 2 Option A (fence extraction from `deliver/SKILL.md`, no file moves), DQ 3 Option A (exit-status guard, report as cause and fix, no retry, plus `--cwd "$cwd"`), DQ 4 Option A (state the guard in both skills), DQ 5 Option A (out of scope, one sentence in `workflows/delivery.md`).

## Current State Analysis

The loop lives in prose in `skills/delivery/deliver/SKILL.md:65-112`, and `skills/delivery/herd-next/SKILL.md:88-100` repeats its seven-line state read.

### Key Discoveries:

- `deliver/SKILL.md:69-77` reads the run without checking the exit status. Outside a git work tree the CLI exits 1 and prints an `ok: false` body whose raw newlines `jq` cannot parse, so `$status` is empty, matches none of `completed`, `failed`, `cancelled`, or `paused`, and the loop takes its running-run branch at `:79` and waits in silent ten-minute chunks forever (design 12, the console block at `12:51-59`).
- `herd-next/SKILL.md:91-98` has the same unguarded read, and `$cwd` supplies the pane's directory at `:104`, so the same failure opens a pane at the literal string `null`.
- `deliver/SKILL.md:52` already fixes how a broken Archon call is handled: "Any other failure is reported as cause and fix, verbatim from Archon's output, and nothing is retried." The guard follows that sentence rather than inventing a second convention.
- `archon workflow get` is not constrained to the run's own worktree; the boundary is a git work tree, and `--cwd <any repo path>` returns the full response from `/tmp` (design 12, third Resolved Design Question). That makes `--cwd "$cwd"` the fix for the only cause the loop can remove on its own once the first read succeeds.
- `tests/dispatch.test.mjs:11-33` extracts a bash body from a document by regex and runs it under `/bin/bash` with a controlled environment; `tests/wave.test.mjs:125-150` writes a fake `archon` into a temp `bin`, prepends it to `PATH`, and asserts on the argv it logged. The new test needs both and invents neither.
- `npm test` passes 64/64 at `4ff7078` (`node scripts/validate.mjs && node scripts/sync-plugin.mjs --check && node scripts/build-packs.mjs --check && node --test tests/`).
- `scripts/validate.mjs:279` holds `EXPECTED_SKILL_COUNT = 42` and `:37` holds `ANSWER_INVENTORY`. No phase here adds a skill or an answer template, so neither changes.
- `grep -rn 'archon workflow' skills/` returns 14 lines across five files today. Every one is a command the steward or an epic skill runs itself; none addresses a person, which is acceptance (d).

## Desired End State

- A steward that cannot read its run prints Archon's output as cause and fix and stops. No branch waits on a read that failed.
- Every call after the first successful read names the run's own directory with `--cwd "$cwd"`, so the steward works from wherever the person started it.
- `tests/steward.test.mjs` fails when the state read stops guarding its exit status, when the respond call loses `--cwd`, or when the wait loop stops breaking on a terminal status.
- `workflows/delivery.md` states who removes an abandoned run's worktree.
- Acceptance (a), (b), and (c) have a checklist a person runs once, and the observed output is recorded in that phase's implementation receipt.

## What We're NOT Doing

- No new skill, no new answer template, no new `archon` subcommand. `archon workflow cleanup` does not exist (research 11, finding 6).
- No move of the loop's bash into `references/steward.sh` (DQ 2 Option B, rejected in design 12).
- No automated harness faking Herdr's pane primitives (DQ 1 Option B alone, rejected); `herdr` stays absent from `tests/`.
- No retry on a failed Archon call, and no deletion of any run worktree by any skill (DQ 3 Option B and DQ 5 Option B, both rejected).
- No change to the by-hand handoff fence, the Stop hook, `herd-next`'s handoff mode, or the loop's settled shape (turn-driven pauses, bounded waits, `judge.mjs feedback-intent`, `deliver` owning the loop).

## Execution Strategy

Phases 1 and 2 are the two guards, one file each, independently readable and independently checkable by grep. Phase 3 is the test and asserts the behavior phases 1 and 2 introduce, so it runs after them. Phase 4 is one sentence in `workflows/delivery.md` and depends on nothing. Phase 5 is the live pass and is proved by a receipt, never by a command.

---

## Phase 1: Guard `deliver`'s state read and name the run's directory

### Goal

`deliver` step 6 stops on a failed `archon workflow get` instead of reading it as a running run, and every call after the first successful read carries `--cwd "$cwd"`.

### Required Edits:

#### 1.1 The state read

**File**: `skills/delivery/deliver/SKILL.md`
**Changes**: In step 6's first fence (`:69-77`), guard the `get`. The failure body goes to stderr because the CLI prints its `ok: false` error on stdout, which the assignment captures.

```diff
-run=$(archon workflow get "$run_id" --json)
+run=$(archon workflow get "$run_id" --json) || { printf '%s\n' "$run" >&2; exit 1; }
 status=$(jq -r '.status' <<<"$run")
 cwd=$(jq -r '.working_path' <<<"$run")
```

Add one sentence to the paragraph that follows the fence (`:79`), before the branch table sentence:

```diff
+A `get` that exits nonzero ends the steward: report Archon's output as cause and fix, and retry nothing, the rule step 4 already applies to a failed dispatch. Outside a git work tree the body is an `ok: false` error whose raw newlines `jq` cannot parse, so an unguarded read leaves `$status` empty and the loop waits on a run it cannot see.
 A gate is live only when `status` is `paused` and `resolved` is empty.
```

#### 1.2 The resolve-and-wait fence

**File**: `skills/delivery/deliver/SKILL.md`
**Changes**: In step 6's last fence (`:103-110`), add `--cwd "$cwd"` to every call and guard the in-loop read the same way. `$cwd` is set by 1.1's read, which has already succeeded whenever this fence runs.

```diff
-archon workflow respond "$run_id" "$decision" "$text" --detach
+archon workflow respond "$run_id" "$decision" "$text" --detach --cwd "$cwd"
 while :; do
-  archon workflow wait "$run_id" --json --timeout 600 || true
-  status=$(archon workflow get "$run_id" --json | jq -r '.status')
+  archon workflow wait "$run_id" --json --timeout 600 --cwd "$cwd" || true
+  run=$(archon workflow get "$run_id" --json --cwd "$cwd") || { printf '%s\n' "$run" >&2; exit 1; }
+  status=$(jq -r '.status' <<<"$run")
   case "$status" in paused|completed|failed|cancelled) break ;; esac
 done
```

Extend the paragraph after the fence (`:112`):

```diff
-A chunk that expires is not a failure; the loop re-reads and re-issues.
+A chunk that expires is not a failure; the loop re-reads and re-issues. `--cwd "$cwd"` names the run's own worktree on every call once the first read has returned it, so the steward reads the same run from whatever directory the person started it in; a read that still fails ends the steward, as above.
```

### Success Criteria:

#### Automated Verification:

- [x] `grep -c 'archon workflow get "$run_id" --json' skills/delivery/deliver/SKILL.md` is 2, and `grep -c '|| { printf' skills/delivery/deliver/SKILL.md` is 2
- [x] `grep -c -- '--cwd "$cwd"' skills/delivery/deliver/SKILL.md` is 4: the three calls at `:106`, `:108`, and `:109`, plus the prose sentence 1.2 adds at `:115`, which restates the flag in backticks. The count was written as 3 before that sentence was part of the edit.
- [x] `grep -rn 'archon workflow' skills/delivery/deliver/SKILL.md` shows no line telling a person to run a command (acceptance (d))
- [x] `npm test`

human-gated: false

---

## Phase 2: Guard `herd-next`'s state read

### Goal

A run `herd-next` cannot read produces the skipped reply, not a review pane opened at the literal path `null`.

### Required Edits:

#### 2.1 The gate mode's read

**File**: `skills/delivery/herd-next/SKILL.md`
**Changes**: Same guard in the gate mode's fence (`:91-98`). This skill reads once and does not loop, so nothing else changes.

```diff
-run=$(archon workflow get "$run_id" --json)
+run=$(archon workflow get "$run_id" --json) || { printf '%s\n' "$run" >&2; exit 1; }
 status=$(jq -r '.status' <<<"$run")
 cwd=$(jq -r '.working_path' <<<"$run")
```

Add one sentence to the paragraph after the fence (`:100`), before the live-gate sentence:

```diff
+A `get` that exits nonzero opens no pane: print `references/herd_next_skipped_answer.md` with the reason `the run could not be read`, followed by Archon's output as cause and fix. Without the guard `$cwd` is the literal string `null` and the pane opens there.
 A gate is live when `status` is `paused` and `resolved` is empty;
```

### Success Criteria:

#### Automated Verification:

- [x] `grep -n '|| { printf' skills/delivery/herd-next/SKILL.md` prints one line, inside the gate mode's fence
- [x] `grep -n 'the run could not be read' skills/delivery/herd-next/SKILL.md` prints one line
- [x] `npm test` (`validate.mjs:313-318` still resolves `references/herd_next_skipped_answer.md`, which exists and is unchanged)

human-gated: false

---

## Phase 3: Automated coverage of the steward loop

### Goal

`npm test` fails when step 6's state read stops guarding its exit status, when the respond call loses `--cwd`, or when the wait loop stops breaking on a terminal status.

### Required Edits:

#### 3.1 The test file

**File**: `tests/steward.test.mjs` (new)
**Changes**: Extract the fences from the two SKILL.md files by marker and run them under `/bin/bash` against a fake `archon` on `PATH`. The first `split("```bash")` piece is the prose before any fence and is dropped, because `archon workflow respond` appears in the skill's own prose at `deliver/SKILL.md:10`. Both markers were checked against `4ff7078`: each selects exactly the intended fence. `deliver`'s fences sit inside step 6's list item and come out with three leading spaces per line, which bash ignores.

```javascript
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
```

### Success Criteria:

#### Automated Verification:

- [x] `node --test tests/steward.test.mjs` passes 5 tests
- [x] Reverting phase 1's guard makes `a get that fails ends the read` fail; reverting phase 1's `--cwd` makes `respond and every wait chunk` fail (check by hand, restore the file, do not commit the revert)
- [x] `npm test` passes with 69 tests, the 64 at `4ff7078` plus these 5

human-gated: false

---

## Phase 4: State who removes an abandoned run's worktree

### Goal

The gap research 11 found, that nothing documents who reclaims `~/.archon/workspaces/` directories, is closed in prose. No skill deletes anything.

### Required Edits:

#### 4.1 The Dead run bullet

**File**: `workflows/delivery.md`
**Changes**: Extend the existing bullet at `:151`, beside the other run-lifecycle bullets under "Steering a run".

```diff
-- Dead run: `archon workflow abandon <run-id>` marks it cancelled without stopping host work. `archon workflow cancel <run-id>` stops a detached continuation only.
+- Dead run: `archon workflow abandon <run-id>` marks it cancelled without stopping host work. `archon workflow cancel <run-id>` stops a detached continuation only. An abandoned run's worktree stays under `~/.archon/workspaces/`: Archon owns its workspace directories and no skill removes one, the same ownership `shared/CONVENTIONS.md` states for by-hand task worktrees. Remove one with `git worktree remove <path>` once its branch is merged or dropped.
```

### Success Criteria:

#### Automated Verification:

- [x] `grep -n 'archon/workspaces' workflows/delivery.md` prints the new line
- [x] `npm test`

human-gated: false

---

## Phase 5: Prove acceptance (a), (b), and (c) against a live run

### Goal

One person runs the checklist once and the observed output is recorded. This phase writes no code and blocks nothing.

### Required Edits:

#### 5.1 The checklist

**File**: none; run against a scratch `delivery-start` run forced to pause the way receipt 09 forced one (point `skills_dir` at a nonexistent path to drive `delivery-start.yaml:80` down the `confident=false` branch), with the bare-remote scratch repository from plan 04's phase 5.1.

1. Acceptance (b), outside Herdr: in a plain agent session in the scratch repository, `/deliver 'Make the thing better somehow'`. The session prints the gate reply (`references/deliver_gate_answer.md`) naming the run, the gate, the artifact summary, the Verify and Known limits lines, and ending `Say `approve`, or say what should change.`. No reply names an `archon` command for the person.
2. Acceptance (c), outside Herdr: answer `approve`. The gate resolves and the session announces the next pause or the run's end. Then on a later gate answer in a sentence describing a change, and confirm the steward sends `reject` with those words as the text.
3. Acceptance (a), inside Herdr: in a Herdr workspace, `/deliver` on the same request. A review pane opens at the run's `working_path`, labelled `<slug>/<phase> gate`, and its agent announces the first pause without being asked.
4. Acceptance (c), inside Herdr: answer `approve` in that pane. The gate resolves and the pane announces the next pause or the end.
5. The unverified flag from design 12's Known limits: confirm `archon workflow respond <run-id> approve --detach --cwd <the run's working_path>` exits 0 at a live gate, run from a directory that is not the run's worktree.
6. Clean up: `archon workflow abandon "$run_id"`, then remove the scratch repository and its bare remote.

#### 5.2 Where it is recorded

**File**: the phase's implementation receipt in the task directory, `NN-implementation-steer-every-archon-gate.md`.
**Changes**: Record, verbatim, the gate reply printed in step 1, the pane label and first message from step 3, the `respond` call and its exit status from steps 2 and 5, and the run status after each. The receipt is the verification artifact design 12's DQ 1 names; this collection has no separate verification template, and receipt 09 already recorded live-run evidence this way.

### Success Criteria:

#### Automated Verification:

- [ ] `grep -rn 'archon workflow' skills/` shows no line that tells a person to run a command (acceptance (d); 14 lines across five files today, all commands a skill runs itself)
- [ ] `npm test` (acceptance (e))

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- Acceptance (b) and (c) outside Herdr: checklist steps 1, 2, and 5. Recorded in this phase's implementation receipt.
- Acceptance (a) and (c) inside Herdr: checklist steps 3 and 4. Recorded in the same receipt; needs a live Herdr workspace.

---

## Human Review

### Review targets

- Phase 1's guard shape: `|| { printf '%s\n' "$run" >&2; exit 1; }` is runnable bash in a fence a test extracts, where design 12 wrote the branch as prose. Check that it still reads as the skill's instruction to report and stop.
- Phase 1.2 rewrites the in-loop read to reuse `$run`, which design 12 did not show. Check the widened scope.
- Phase 3's marker strings (`approval.nodeId`, `respond "$run_id"`) tie the test to fence contents; reordering step 6's prose is safe, renaming those lines is not.
- Phase 5 treats the implementation receipt as the verification artifact DQ 1 names. Check that no separate artifact type is wanted.

### Verify

- [ ] `npm test` passes at `4ff7078` before any phase lands (64 tests) and after phase 3 (69 tests).
- [ ] `grep -rn 'archon workflow' skills/` shows 14 lines across five files, none addressed to a person, before and after every phase.
- [ ] Phase 1 and phase 2 leave `deliver/SKILL.md` and `herd-next/SKILL.md` with the same guard line, so the two readers stay independently readable (DQ 4 Option A).
- [ ] `tests/steward.test.mjs` fails when phase 1's guard or `--cwd` is reverted.

### Known limits

- Acceptance (a), (b), and (c) stay unproved until phase 5 runs; phase 3 proves the CLI sequence under them, not the agent behavior they describe.
- `--cwd` on `respond` at a live gate is unverified (design 12, Known limits); phase 5 step 5 is where it is answered, and a failure there means phase 1.2 drops the flag from `respond` only.
- Phase 3 asserts against a fake `archon`, so it proves the loop's argv and branching, not the CLI's behavior.
- `judge.mjs` was not called while writing this plan: `TYPESAFE_API_KEY` is unset. Judgments were skipped.
