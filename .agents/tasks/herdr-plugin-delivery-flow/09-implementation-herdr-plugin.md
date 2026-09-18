---
type: implementation
completed_phase: 3
summary: "Two reviewer fixes on the Phase 3 `Stop` hook. The step 6 comment no longer opens with a stray word, and the agent name now cuts the slug rather than the phase, so `/create-plan` inside this task starts `herdr-plugin-deliver-create-plan` instead of the old `herdr-plugin-delivery-flow-creat`, which said nothing about the phase. The same rule is now stated in `SKILL.md` step 6 and in both plan sections that specify it, so the skill and the hook agree. `npm test` passes at 61/61 and the stub `herdr` check was re-run; Phase 3 is the plan's terminal phase, so the next consumer is the pull request description."
---

# Implementation Iteration Receipt

## Source
- task: `.agents/tasks/herdr-plugin-delivery-flow/task.md`
- plan or outline: `.agents/tasks/herdr-plugin-delivery-flow/04-plan-herdr-plugin.md`, Phase 3, sections 1.1 and 3.1 revised in place by this iteration
- feedback (message or named file): reviewer message on the Phase 3 pass, decision `reject`, intent `revise`, two items

## Current State
- branch: `herdr-plugin-delivery-flow`
- previous implementation point: `c45c8c0 fix(delivery): make the herd-next Stop hook open the pane itself`, receipt `08-implementation-herdr-plugin.md`
- relevant diff: three files, 15 insertions and 7 deletions, all inside step 6 of the agent-name rule and its two prose statements

## Feedback Verified Before Applying

Both items were checked against the file before editing, not taken on trust.

Item 1. `stop_hook.sh:83` did open with `# ponytail: no -2 / -3 collision walk here`. The word is from a session persona, not from this repository: `git grep -n "ponytail"` over the tracked tree returns nothing else, so the comment was the only occurrence and it read as a term of art the reader cannot look up. Correct, applied verbatim as the reviewer worded it.

Item 2. The old line was `name=$(printf '%s-%s' "$slug" "$phase" | ... | cut -c1-32)`. With this task's own slug, `herdr-plugin-delivery-flow` is 26 characters, so `/create-plan` produced `herdr-plugin-delivery-flow-creat`: the cut landed inside the phase and the agent name lost the one part that distinguishes one pane's agent from the next. The prior receipt records exactly that string at `08-implementation-herdr-plugin.md:59`, so the defect shipped. Correct, applied.

## Changes Made

- `skills/delivery/herd-next/references/stop_hook.sh:82-94`, step 6. The comment now reads "No -2 / -3 collision walk here: a name already in use fails the start below and the hook stops. Run /herd-next by hand for that case.", preceded by two lines stating why the slug is the part that gets cut. The name is built as `stem=$((32 - ${#phase} - 1))`, then `"${slug:0:stem}-$phase"` when `stem` is at least 1 and the unchanged `"$slug-$phase"` otherwise, which is the fallback for a phase longer than 31 characters. The existing cleanup is unchanged and still runs over the result: lower-case, every character outside `a-z0-9-` to `-`, runs of `-` collapsed, `cut -c1-32`, trailing `-` stripped. The collapse matters, because a stem that ends on the slug's own `-` would otherwise produce `--` at the join.
- `skills/delivery/herd-next/SKILL.md:57`, step 6. States the cut-the-slug-first rule, the `32 - (length of the phase + 1)` arithmetic, and the over-31-character fallback, ahead of the unchanged `-2` / `-3` collision walk that the skill has and the hook does not.
- `.agents/tasks/herdr-plugin-delivery-flow/04-plan-herdr-plugin.md:123`, section 1.1 step 6, the specification `SKILL.md` step 6 is written from: same wording as the skill, so the plan and the skill do not disagree about the rule.
- `.agents/tasks/herdr-plugin-delivery-flow/04-plan-herdr-plugin.md:378`, section 3.1 step 6, the specification the hook is written from: the slug is cut to `32 - (length of the phase + 1)` first, with the joined-name cut as the fallback.
- `.agents/tasks/herdr-plugin-delivery-flow/08-implementation-herdr-plugin.md`: one `Known limits` line added pointing at this receipt, because that receipt records the superseded agent name.

Nothing else changed. The hook's control flow, its exit-0 contract, the pane logic, and the `send-text` staging are untouched.

## Verification

- command: `npm test`
- result: pass
- evidence: `tests 61 / pass 61 / fail 0`, three suites, 26.4s

- command: `bash -n skills/delivery/herd-next/references/stop_hook.sh`
- result: pass
- evidence: `exit=0`, no diagnostics

- command: `shellcheck skills/delivery/herd-next/references/stop_hook.sh`
- result: pass
- evidence: `exit=0`, clean; `${slug:0:stem}` draws no warning and the one `SC2012` disable is the pre-existing `ls -t` line

- command: guard check re-run, the stub `herdr` from plan section 3.1 first on `PATH`, `HERDR_ENV` unset, payload `{"last_assistant_message":"/create-plan @04-plan-herdr-plugin.md","cwd":"<repo>"}`
- result: pass
- evidence: `exit=0` and `$HERD_LOG` was never created, so no `herdr` command ran

- command: ordered-call check re-run, same stub with `HERDR_ENV=1 HERDR_WORKSPACE_ID=w1 HERDR_TAB_ID=t1 HERDR_PANE_ID=p1` and payload `{"last_assistant_message":"done\n\n/create-plan @04-plan-herdr-plugin.md","cwd":"<repo>"}`
- result: pass
- evidence: `exit=0` and `$HERD_LOG` held exactly seven lines in order: `pane current --current`, `pane list --workspace w1`, `pane layout --pane p1`, `pane split --current --direction right --cwd <repo> --no-focus`, `agent start herdr-plugin-deliver-create-plan --kind omp --pane p2`, `pane rename p2 herdr-plugin-delivery-flow/create-plan`, `pane send-text p2 /create-plan @04-plan-herdr-plugin.md`. The agent start line is the one the reviewer asked to be recorded: `agent start herdr-plugin-deliver-create-plan --kind omp --pane p2`, 32 characters, phase intact, against the old `herdr-plugin-delivery-flow-creat`.

- command: agent-name branch checks against the same stub, one payload per case
- result: pass
- evidence: `/describe-pr` gave `herdr-plugin-deliver-describe-pr` at 32; `/implement-plan-abc`, whose 18-character phase cuts the slug at its own `-`, gave `herdr-plugin-implement-plan-abc` at 31 with the double dash collapsed; the 38-character `/a-very-long-phase-name-that-exceeds-31` took the fallback and gave `herdr-plugin-delivery-flow-a-ver` at 32. All four names, including the ordered-call one, match `^[a-z][a-z0-9-]{0,31}$`.

- command: `git grep -n "ponytail"` over the tracked tree
- result: pass
- evidence: no matches, `exit=0` with empty output

- command: `ls "${TMPDIR:-/tmp}"/herd-next-pending` and `git grep -n "herd-next" README.md docs/getting-started.md`
- result: pass
- evidence: no such file after every run above; `README.md:82` and `docs/getting-started.md:164` unchanged

- deferred human evidence: unchanged from `08-implementation-herdr-plugin.md`. The hook installed in a real `~/.claude/settings.json` and observed opening a pane at the end of a phase against a live `herdr`; confirming a Claude Code `Stop` payload really carries `last_assistant_message` and `cwd`; the Phase 1 scratch-pane run of `/herd-next`; the Phase 2 gate-mode run against a scratch `delivery-lean` run.

## Remaining Work

None. Both feedback items are applied, neither was declined, and Phase 3 is the plan's highest numbered phase. Every open item is deferred human evidence, listed above and in the plan's Phase 3 deferred evidence line.

## Human Review

### Review targets

- `skills/delivery/herd-next/references/stop_hook.sh:87-92`, the name build. `${slug:0:stem}` is a bash substring expansion, so this file is bash-only where the rest of it is close to POSIX; the shebang is already `#!/usr/bin/env bash`, and the alternative was two more subshells.
- The rule is now stated in four places: the script, `SKILL.md:57`, and plan sections 1.1 and 3.1. They agree today. This is the same drift risk the previous receipt flagged for the pane logic.
- The skill keeps the `-2` / `-3` collision walk and the hook still does not have one. With the phase preserved, two runs of the same phase for the same slug now collide on an identical name more readily than a phase-truncated name did, and the hook still answers that by failing `agent start` and stopping, leaving the split pane open.

### Verify

- Install `stop_hook.sh` in a real `~/.claude/settings.json` under `hooks` -> `Stop`, end a phase that prints a handoff fence inside Herdr, and confirm a sibling pane opens at the payload's `cwd` with the command staged, focus unchanged, and the agent named `<cut slug>-<phase>`.
- Confirm a Claude Code `Stop` payload carries both `last_assistant_message` and `cwd`. Both field names came from the plan and the feedback, not from a captured payload on this machine.
- Confirm `npm test` passes on a clean checkout of this branch at 61/61 with 42 skills.

### Known limits

- The `Stop` hook covers Claude Code and Codex only. Oh My Pi and Pi expose in-process extension callbacks, so their users invoke the skill by hand.
- The hook cannot ask a question, so an unreadable agent kind, an artifact held by two task directories, and an agent name already in use all end in a silent `exit 0` with nothing logged anywhere.
- A slug longer than `32 - (length of the phase + 1)` is still cut, so two tasks sharing a long slug prefix produce the same agent name for the same phase. The trade is deliberate: the phase is what the name is read for.
- `last_assistant_message` and `cwd` are unverified against a live payload, so a Claude Code release that renames either silently turns the hook into a no-op that still exits 0.
- A fence with no `@file` picks the newest `.agents/tasks/*/task.md` by mtime, which is wrong when two tasks are in flight in one checkout and the other one was touched more recently.
- Every check above drives a stub `herdr`. Nothing in the test suite or in this receipt exercises a real Herdr pane, a real `agent start`, or a real Archon gate.
