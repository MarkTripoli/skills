---
type: implementation
completed_phase: 3
summary: "Phase 3's `Stop` hook now opens the pane itself instead of recording a line for a later `/herd-next`, which is what the design's resolved trigger question and the plan's Desired End State both state. `skills/delivery/herd-next/references/stop_hook.sh` runs steps 3 to 7 of the handoff mode directly against the payload's `cwd`, writes no file, never submits, and exits 0 on every branch the skill would resolve by asking the user. The pending-file read is gone from `SKILL.md` step 2, the fixed-path race is gone with it, and plan section 3.1 plus Phase 3's automated checks were rewritten to the stub-driven guard and ordered-call checks. `npm test` passes at 61/61 and this is the plan's terminal phase, so the next consumer is the pull request description."
---

# Implementation Iteration Receipt

## Source
- task: `.agents/tasks/herdr-plugin-delivery-flow/task.md`
- plan or outline: `.agents/tasks/herdr-plugin-delivery-flow/04-plan-herdr-plugin.md`, Phase 3, revised in place by this iteration
- feedback (message or named file): reviewer message on the Phase 3 pass, decision `reject`, intent `revise`

## Current State
- branch: `herdr-plugin-delivery-flow`
- previous implementation point: `1037f28 feat(delivery): add the opt-in herd-next Stop hook`, receipt `07-implementation-herdr-plugin.md`
- relevant diff: `c45c8c0 fix(delivery): make the herd-next Stop hook open the pane itself`, two files, 93 insertions and 8 deletions

## Feedback Verified Before Applying

The feedback names a design decision, so it was checked against the artifacts rather than taken on trust. `03-design-discussion-herdr-plugin.md:93` resolves the trigger question with "`references/stop_hook.sh` holds a Claude Code `Stop` hook that does the same thing unprompted", and the plan's Desired End State (`04-plan-herdr-plugin.md:35`) has ending a phase inside Herdr open the next phase in its own pane. The shipped hook wrote `${TMPDIR:-/tmp}/herd-next-pending` and stopped, so it did not do the same thing: a human still had to type `/herd-next`, and the fixed path had no per-pane key. The feedback is correct and was applied in full. No part of it was declined.

## Changes Made

- `skills/delivery/herd-next/references/stop_hook.sh` rewritten. After the `HERDR_ENV` guard, the `jq` and `herdr` presence checks, and the fence parse, it performs steps 3 to 7 of the skill's handoff mode itself:
  - working directory from the payload's `.cwd`, falling back to `$PWD`, and refused when it is not a directory;
  - task directory from the artifact in the fence: a `@dir/NN-artifact.md` takes that directory, a bare `@NN-artifact.md` matches `$cwd/.agents/tasks/*/<artifact>` and exits 0 when two directories hold it, and a fence with no `@file` takes the newest `.agents/tasks/*/task.md` by mtime; the slug is that file's `slug` key with the directory name as fallback;
  - kind from `herdr pane current --current | jq -r '.result.pane.agent'`, accepted only as `claude`, `codex`, `omp` or `pi`, and exiting 0 otherwise because a hook cannot ask;
  - the `busy` read over `$HERDR_WORKSPACE_ID` and `$HERDR_TAB_ID`, then either the `herdr pane layout --pane "$HERDR_PANE_ID"` direction read and `herdr pane split`, or `herdr tab create` when another task holds the tab;
  - the agent name `<slug>-<phase>` reduced to `[a-z][a-z0-9-]{0,31}`;
  - `herdr agent start`, `herdr agent wait` only on an `agent_not_ready` response, `herdr pane rename "$pane" "$slug/$phase"`, and `herdr pane send-text "$pane" "$cmd"`.
- The script never runs `herdr agent prompt`, writes nothing under `$TMPDIR` or anywhere else, and exits 0 on every path, including a missing `HERDR_ENV`, a missing `jq` or `herdr`, a malformed payload, no matching fence line, an ambiguous artifact, an unreadable kind, an unreadable pane id, and a failed `agent start`.
- Two deliberate omissions are marked in the file: no `-2` / `-3` name-collision walk (`stop_hook.sh:80-82`), so a name already in use fails `agent start` and the hook stops, and the `ls -t` mtime sort carries a `shellcheck disable=SC2012` with its reason.
- `skills/delivery/herd-next/SKILL.md` step 2: the `${TMPDIR:-/tmp}/herd-next-pending` read and its delete-after-read are removed. Step 2 is back to the caller's argument or the finishing reply in this session.
- `skills/delivery/herd-next/SKILL.md` `## Optional Stop hook`: rewritten to state that the hook opens the pane, which steps it runs, that it takes `cwd` from the payload, that it stages and never submits, that it writes no file, and that the branches needing a question exit 0 with `/herd-next` as the way through.
- `.agents/tasks/herdr-plugin-delivery-flow/04-plan-herdr-plugin.md` section 3.1: the pending-file snippet and its prose are replaced by the guard-and-parse lines verbatim plus the step 3 to 7 specification, with the design and Desired End State citations that make the pane the hook's job. Section 3.2's diff, the Phase 3 automated checks, the Phase 3 deferred evidence line, and the Phase 3 `Human Review` review target were updated to match.
- `.agents/tasks/herdr-plugin-delivery-flow/07-implementation-herdr-plugin.md`: the two `Known limits` bullets describing the pending file and its race are replaced by one line pointing at this receipt as the shipped Phase 3.

## Verification

- command: `npm test`
- result: pass
- evidence: `tests 61 / pass 61 / fail 0`, three suites, 27.8s

- command: `bash -n skills/delivery/herd-next/references/stop_hook.sh`
- result: pass
- evidence: `exit=0`, no diagnostics

- command: `shellcheck skills/delivery/herd-next/references/stop_hook.sh`
- result: pass
- evidence: `exit=0`, clean; the two `tr` character-class notices were fixed to `[:upper:]` / `[:lower:]` and SC2012 carries an inline disable with its reason

- command: guard check, the stub `herdr` from plan section 3.1 first on `PATH`, `HERDR_ENV=` unset, payload `{"last_assistant_message":"/create-plan @04-plan-herdr-plugin.md","cwd":"<repo>"}`
- result: pass
- evidence: `exit=0` and `$HERD_LOG` was never created, so no `herdr` command ran

- command: ordered-call check, same stub with `HERDR_ENV=1 HERDR_WORKSPACE_ID=w1 HERDR_TAB_ID=t1 HERDR_PANE_ID=p1` and payload `{"last_assistant_message":"done\n\n/create-plan @04-plan-herdr-plugin.md","cwd":"<repo>"}`
- result: pass
- evidence: `exit=0` and `$HERD_LOG` held exactly seven lines in order: `pane current --current`, `pane list --workspace w1`, `pane layout --pane p1`, `pane split --current --direction right --cwd <repo> --no-focus`, `agent start herdr-plugin-delivery-flow-creat --kind omp --pane p2`, `pane rename p2 herdr-plugin-delivery-flow/create-plan`, `pane send-text p2 /create-plan @04-plan-herdr-plugin.md`

- command: branch checks with the same stub, recorded beyond the plan's list because the rewrite added branches
- result: pass
- evidence: a fence with no `@file` (`/describe-pr`) resolved the slug by mtime and staged `pane send-text p2 /describe-pr` under the label `herdr-plugin-delivery-flow/describe-pr`; a `pane list` answer carrying `other-task/create-plan` on the caller's tab took the tab path (`tab create ... --label herdr-plugin-delivery-flow`, then `agent start ... --pane p9`) and never called `pane split`; a stub answering `{}` to everything stopped after `pane current --current` with `exit=0`; the payload `not json` produced `exit=0` with no `herdr` call at all

- command: `ls "${TMPDIR:-/tmp}"/herd-next-pending`
- result: pass
- evidence: no such file after every run above, so nothing is written under `$TMPDIR`

- command: `git grep -n "herd-next" README.md docs/getting-started.md`
- result: pass
- evidence: unchanged from Phase 3, `README.md:82` and `docs/getting-started.md:164`

- deferred human evidence: the hook installed in a real `~/.claude/settings.json` and observed opening a pane with the command staged at the end of a phase, against a live `herdr` rather than a stub. Also carried forward: confirming a Claude Code `Stop` payload really carries `last_assistant_message` and `cwd`; the Phase 1 scratch-pane run of `/herd-next`; the Phase 2 gate-mode run against a scratch `delivery-lean` run.

## Remaining Work

None in this phase. Phase 3 is the plan's highest numbered phase and all three phases are implemented. Every remaining item is deferred human evidence, listed above and in the plan's Phase 3 deferred evidence line.

## Human Review

### Review targets

- `skills/delivery/herd-next/references/stop_hook.sh:29-56`, the task-directory resolution. This is the one piece of logic the skill body states in prose and the script has to decide alone: confirm that matching a bare `@NN-artifact.md` against `$cwd/.agents/tasks/*/` and stopping on two hits is the behaviour you want, rather than preferring the newest.
- `skills/delivery/herd-next/references/stop_hook.sh:80-90`, the agent name and `agent start`. There is no collision walk, so a second run for the same slug and phase fails the start and stops after the pane has already been split, leaving an empty pane the hook does not close. Closing it would mean a hook deleting a pane, which is why it does not.
- The pane logic now exists twice, in `SKILL.md` steps 3 to 7 and in the script. They agree today; a change to one needs the other.
- `04-plan-herdr-plugin.md` section 3.1: the snippet is no longer reproduced whole, because the script is around ninety lines. The section carries the guard and parse verbatim and specifies the rest by step. Confirm that is the level of detail the plan should hold.

### Verify

- Install `stop_hook.sh` in a real `~/.claude/settings.json` under `hooks` -> `Stop`, end a phase that prints a handoff fence inside Herdr, and confirm a sibling pane opens at the payload's `cwd` with the command staged and focus unchanged.
- Confirm a Claude Code `Stop` payload carries both `last_assistant_message` and `cwd`. Both field names came from the plan and the feedback, not from a captured payload on this machine; `cwd` falling back to `$PWD` means a missing key degrades to the hook process's own directory rather than failing loudly.
- Confirm `npm test` passes on a clean checkout of this branch at 61/61 with 42 skills.

### Known limits

- The `Stop` hook covers Claude Code and Codex only. Oh My Pi and Pi expose in-process extension callbacks, so their users invoke the skill by hand.
- The hook cannot ask a question, so an unreadable agent kind, an artifact held by two task directories, and an agent name already in use all end in a silent `exit 0`. Nothing is logged anywhere, so a hook that declines leaves no trace in the session; the design's rule that a `Stop` hook must never block a session is what buys that silence.
- `last_assistant_message` and `cwd` are unverified against a live payload, so a Claude Code release that renames either silently turns the hook into a no-op that still exits 0.
- A fence with no `@file` picks the newest `.agents/tasks/*/task.md` by mtime, which is wrong when two tasks are in flight in one checkout and the other one was touched more recently.
- Every check above drives a stub `herdr`. Nothing in the test suite or in this receipt exercises a real Herdr pane, a real `agent start`, or a real Archon gate.
- Superseded in part by `09-implementation-herdr-plugin.md`: the agent name now cuts the slug rather than the phase, so the `agent start herdr-plugin-delivery-flow-creat` line recorded above is no longer what the hook produces.
