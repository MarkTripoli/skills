---
type: code-review
date: 2026-09-18
branch: herdr-plugin-delivery-flow
base_branch: main
base_sha: 31d9b0ffce0773d00b37011a3dab0ed9e1c366e1
head_sha: 3497cbb14a4974ab69417e1e878803154e4ca21f
status: findings
summary: "Reviewed the 11 changed code and documentation files that add the `herd-next` skill, its three terminal replies, the opt-in Claude Code Stop hook, and the registration rows, at commit 3497cbb plus the uncommitted fix round on `SKILL.md` and `stop_hook.sh`. All three findings of round 11 are fixed, and the round's `herdr tab close`/`pane close` calls and the `.result.tab.tab_id` key were confirmed against the live CLI. One new major finding: the hook's `agent_not_ready` recovery branch cannot run, because `herdr agent start` reports that code as a server error, JSON on stderr with exit status 1, so `|| exit 0` fires first and `2>/dev/null` has already discarded the text the `case` matches on; the blocked-startup path the script exists to handle therefore closes its pane and gives up, and the 90 second install budget the same fix round documented covers a wait that never happens. Six advisories cover the EXIT-only trap, a reply template that still names the `gates: none` branch step 8 dropped, unbounded pane accumulation across a chain, and three documentation drifts. `npm test` passes 61/61 with 42 skills, `node scripts/check-commits.mjs main..HEAD` reports `ok: 15 subjects`, and `shellcheck` and `bash -n` are clean on the hook."
---

# Code Review

## Scope

- merge base: `31d9b0ffce0773d00b37011a3dab0ed9e1c366e1` (`main`; no pull request exists for this branch and `task.md` carries no `base:`, so the repository default branch resolved the target)
- reviewed HEAD: `3497cbb14a4974ab69417e1e878803154e4ca21f` plus the working tree
- commits: 15 after the merge base, 9 of them `docs(task):` artifact commits; the code commits are `fb95578`, `cd54aa8`, `1037f28`, `c45c8c0`, `3432996`
- staged and unstaged changes: none staged; two unstaged files, `skills/delivery/herd-next/SKILL.md` (16 lines) and `skills/delivery/herd-next/references/stop_hook.sh` (50 lines), which are round 12's fixes and are reviewed here as part of the scope
- task-owned untracked files: `.agents/tasks/herdr-plugin-delivery-flow/11-code-review-herdr-plugin.md`, `12-code-review-fixes-herdr-plugin.md`
- excluded changes: the 11 task artifacts under `.agents/tasks/`, and the untracked `.backups/` and `.ignore` paths, which no commit in this branch introduces

## Previous Round

- previous artifact: `.agents/tasks/herdr-plugin-delivery-flow/11-code-review-herdr-plugin.md`
- CR-001 The Stop hook abandons the pane or tab it created when a later herdr call fails: fixed
- CR-002 The documented hook timeout is shorter than the herdr waits the hook performs: fixed
- CR-003 The gate mode splits and labels with slug and dir that no step in that block computes: fixed

CR-001 is decided from `stop_hook.sh:19-34,107,111,138`: `created_pane` and `created_tab` are set at the point of creation, `trap cleanup EXIT` is installed before the first `exit 0`, and `done=1` is reached only after `pane send-text` succeeds. The teardown calls are real and correctly shaped: `herdr tab close --help` and `herdr pane close --help` both take the id positionally, and `herdr --skill` line 89 states that `tab create` returns `.result.tab` and `.result.root_pane`, with `herdr tab list` showing `tab_id` as the key on a tab object, so `created_tab` reads a key that exists. One gap remains on the signal path and is raised as ADV-006 rather than as CR-001 still open, because every `exit` in the script now runs the trap.

CR-002 is decided from `stop_hook.sh:4-9` and `herdr agent start --help`, which documents `--timeout <MS>` as "Wait for interactive readiness (default: 30000; max: 300000)": the documented 90 second install budget is no longer shorter than the waits the script can perform. That the second of those waits is unreachable is a separate defect in the code rather than in the number, and is raised below as CR-004.

CR-003 is decided from `SKILL.md:104-115`: `$phase`, `$artifact`, and `$slug` are each derived in the block before first use, and `$kind`, `$pane`, and `$name` come from a named reuse of steps 4 through 6 with the `$cwd`-for-`$PWD` substitution stated. The `pane split` line carrying the undefined `$dir` is gone. Every variable the final fence expands is now defined in the same section.

## Requirements and Standards

- task or ticket: `.agents/tasks/herdr-plugin-delivery-flow/task.md`, "Herdr plugin for the delivery flow ... one that can automatically open new panels for us and similar features to make it easy to continue these sessions and maintain context really well". No acceptance-criteria list; the plan's Desired End State is the criteria source.
- implementation source: `04-plan-herdr-plugin.md`, three phases, Desired End State at line 35. Every clause of it is decided below under Verification Story.
- repository instructions: `AGENTS.md:19,23` require `scripts/validate.mjs` to pass for a new skill, `npm test` to pass, commit subjects to satisfy `scripts/check-commits.mjs`, and a user-facing change to add a `.changeset/` entry. All four hold: the validator raises `EXPECTED_SKILL_COUNT` to 42 and registers the three replies as `TERMINAL_ANSWER`, `npm test` is 61/61, `check-commits` reports `ok: 15 subjects`, and `.changeset/herd-next-skill.md` declares a `minor` bump. `shared/CONVENTIONS.md` governs the artifact and commit shapes, which the branch follows.

## Change Profile

- intent and expected behavior: inside Herdr, end a delivery phase by opening the next phase in its own pane with the handoff command staged but not submitted, and, with `--run`, watch an Archon run and open a review pane at its pause. Outside Herdr, print one terminal reply and change nothing.
- change description quality: the five code commit subjects stand alone and their bodies state motivation (`c45c8c0` "make the herd-next Stop hook open the pane itself", `3432996` "keep the phase in the herd-next agent name"). No pull request exists yet, so no description was inspected.
- implementation model and review model: not recorded in the implementation receipts; this review ran on Claude Opus 5.
- changed-line size and logical cohesion: 261 lines across 11 code and documentation files, one skill and its registration rows. Cohesive and within the ~300-line band.
- resulting large-file concerns: none. `SKILL.md` is 132 lines and `stop_hook.sh` 139; the largest touched file is `workflows/delivery.md` at 2 changed lines.
- dependency or lockfile changes: none. `package.json` and `package-lock.json` are untouched by this branch; the lockfile staleness `05-implementation-herdr-plugin.md:72` records is pre-existing.

## Tests Reviewed First

- behavior claimed by tests: no test file is added or changed. `npm test` proves only registration: the scanner discovers 42 skills, `sync-plugin.mjs --check` finds the manifest in sync, and the validator's `TERMINAL_ANSWER` contract holds for the three new replies, which is what keeps a terminal answer free of a handoff fence. No test exercises a `herdr` or `archon` call.
- missing or misleading coverage: the runtime behavior is unreachable by this suite, since it depends on a live Herdr server, and `10-verification-herdr-plugin.md:98` says so. The substitute is the verification session's own live probes, A16 and A19 through a `herdr` stub and A32 through a real Claude Code Stop event. That substitute has one hole this review found: a stub that exits 0 for every call cannot distinguish the `agent_not_ready` branch from the failure branch, which is why CR-004 survived both the receipts and A16.

## Five-Axis Assessment

- helper axis-coverage: model `unavailable`, tokens `unavailable` (the helper exited 3 with `judge: unavailable: TYPESAFE_API_KEY is not set`)

### Correctness

- assessment and evidence: one reachability defect, CR-004. `stop_hook.sh:132` runs `start=$(herdr agent start ... 2>/dev/null) || exit 0` and `:133-135` then matches `$start` against `*agent_not_ready*`. Probed against the installed CLI, `herdr agent start zzz-review-probe --kind claude --pane 'zz:p99'` exits 1 with an empty stdout and `{"error":{"code":"agent_pane_not_found",...}}` on stderr, and `herdr --skill` line 202 states the rule: "CLI server errors are JSON on stderr with exit status 1." `agent_not_ready` sits in the binary's error-code table beside `agent_blocked`, which the same document calls a rejection. The `case` is therefore dead on both counts. Every other path checked out: `herdr tab close`, `pane close`, `.result.tab.tab_id`, and `--kind`'s accepted values were confirmed against the live CLI; the four accepted kinds match the four files in `runtimes/`; the `set -u` root walk at `:52-57` terminates at `/` and its `//.agents/tasks` probe resolves; `stem=$((32 - ${#phase} - 1))` with the `cut -c1-32` and trailing-dash strip satisfies herdr's documented `[a-z][a-z0-9_-]{0,31}`, which A18 exercised on four payloads; the `[a-z]*` guard rejects a name that cannot be started; the busy filter is safe on the live pane shape, since `herdr pane list` returns no `label` key on an unlabelled pane, so `.label // empty` yields nothing and the hook splits rather than opening a tab, which is what A32 observed.
- helper coverage: unavailable

### Readability and Simplicity

- assessment and evidence: steps 3 to 7 exist twice, as prose with fences in `SKILL.md:22-66` and as code in `stop_hook.sh:59-137`, which `10-verification-herdr-plugin.md:54` accepted as a known duplication with two stated differences. Round 12 closed one drift (the `dir` fallback now appears in both) and opened two more, both documentation-only and raised as ADV-010 and ADV-011. The hook's own structure is direct: one guard chain, one lookup, one branch per decision, no helper indirection, and a comment on each step naming the skill step it mirrors. `done` as a variable name shadows a bash reserved word; it parses and shellcheck passes, so it is left unraised.
- helper coverage: unavailable

### Architecture

- assessment and evidence: the skill sits outside the delivery chain, which is the right ownership: `workflows/delivery.md:239` records its artifact type as `none` and no pack invokes it, so nothing in the chain gains a dependency on Herdr, and `04-plan-herdr-plugin.md:39-40` holds that boundary by changing no phase skill, no answer template, and no pack. The hook is opt-in and installed by hand, and `SKILL.md:131` states that this collection ships no `hooks` block, which keeps the installer's promise not to write settings the user owns. The duplication between the skill body and the hook is the one architectural cost, and it is the cost of a hook that cannot call a model. One undesigned consequence, ADV-008: because step 7 labels every new pane `<slug>/<phase>` and step 5's busy filter treats a same-slug label as not busy, a full chain splits one more pane into the same tab at every phase with no bound; `03-design-discussion-herdr-plugin.md:109` decided only the other-task case.
- helper coverage: unavailable

### Security

- assessment and evidence: no finding. The hook's only untrusted input is the Stop payload. `$cmd` is cut from `last_assistant_message` by `grep -oE '^/[a-z0-9-]+( @[^ ]+)?$'`, so it cannot carry a space or a shell metacharacter, and it reaches `herdr pane send-text` as a single quoted argv element that is staged without Enter, never evaluated; that is the same protection `SKILL.md:70` states for the skill. `$artifact` can carry `..` and the `*/*` branch would then read a `task.md` outside the repository, but the only value taken from that file is `slug`, which `tr -c 'a-z0-9-' '-'` sanitizes before it becomes a pane label and an agent name, so the reachable effect is a mislabelled pane. `$artifact` is a quoted glob operand at `:72`, so a `*` inside it is not expanded. The script writes no file, adds no dependency, holds no secret, and `herdr pane close`/`tab close` are called only with ids the script itself created.
- helper coverage: unavailable

### Performance

- assessment and evidence: no finding. The hook runs on every Claude Code Stop event, and the common path is one `jq` over the payload followed by `exit 0` when no handoff line matches, so the per-turn cost is negligible. The expensive path is entered only by a message ending in a fence and costs seven `herdr` round trips plus up to 30 seconds inside `agent start`'s readiness wait, which blocks the end of the turn; `stop_hook.sh:6-9` now documents that budget. The gate mode holds its pane for the life of the run by design, since `archon workflow wait` has no detached form (A28). No loop, query, or allocation concern applies to a 139-line script and a prose skill.
- helper coverage: unavailable

## Verification Story

- command or inspection: `npm test`
- result: exit 0. `ok: 42 skills, 57 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`; `plugin in sync (version 2.1.0, 35 skills, 7 agents)`; `tests 61 / pass 61 / fail 0`.
- command or inspection: `node scripts/check-commits.mjs main..HEAD`
- result: exit 0, `ok: 15 subjects`.
- command or inspection: `shellcheck skills/delivery/herd-next/references/stop_hook.sh` and `bash -n` on the same file
- result: both exit 0 with no output, on the working-tree version that carries round 12's fixes.
- command or inspection: `herdr agent start zzz-review-probe --kind claude --pane 'zz:p99'` with stdout and stderr captured separately, plus `herdr tab close --help`, `herdr pane close --help`, `herdr agent start --help`, `herdr tab list`, `herdr pane list`, and `herdr --skill`
- result: the evidence for CR-004 and for the three previous-round dispositions. Exit 1, empty stdout, error JSON on stderr; `tab close <tab_id>` and `pane close <pane_id>` take the id positionally; `--kind` accepts 23 values, of which the skill's four match `runtimes/`; a tab object carries `tab_id`; an unlabelled pane carries no `label` key. No pane, tab, or agent was created by this review.
- manual, screenshot, or before-and-after evidence: none taken here. `10-verification-herdr-plugin.md` items A1 and A32 are the live evidence for the handoff mode, A32 having run the shipped hook under a real Claude Code Stop event, and both cleaned up after themselves. Every clause of the plan's Desired End State (`04-plan-herdr-plugin.md:35`) is decided: the handoff mode by A1 and A32, "outside Herdr ... changes nothing" by A4 and A15, and `npm test` above. The gate-mode clause stays unproven for want of a paused run and is recorded under Review Limits, not as a finding: its field shapes are live-verified by A11, its pane target by A31, and the round-12 read-through leaves no undefined variable in that block.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-004 The hook's agent_not_ready recovery branch cannot run, so a blocked startup closes the pane instead of waiting

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/herd-next/references/stop_hook.sh:132-135`
- failure mode: when `herdr agent start` reports `agent_not_ready`, the hook exits before its own recovery branch. `herdr agent start ... 2>/dev/null` sends the error JSON to `/dev/null` and returns exit status 1, so `|| exit 0` fires on line 132 and the `case "$start" in *agent_not_ready*)` on lines 133 to 135 is never evaluated. With round 12's trap now installed, the consequence is stronger than before: the EXIT trap closes the pane the hook just created and the session gets nothing, on exactly the blocked-startup path the script documents itself as handling. `SKILL.md:68` states the intended behavior ("on that response, wait with `herdr agent wait`"), and `stop_hook.sh:6-9` budgets 90 seconds for "up to another 30s in the `herdr agent wait` fallback", a leg that cannot execute. Two of the three statements about this path are now false.
- evidence or reproduction: `out=$(herdr agent start zzz-review-probe --kind claude --pane 'zz:p99' 2>/tmp/hr.err); echo "exit=$?"` prints `exit=1` with `stdout=[]` and the error JSON in `/tmp/hr.err`. `herdr --skill` line 202: "CLI server errors are JSON on stderr with exit status 1. CLI syntax errors exit with status 2." `agent_not_ready` appears in the installed binary's error-code string table directly beside `agent_blocked`, which line 133 of the same document describes as a rejection ("It rejects an agent already waiting at an approval or question dialog with `agent_blocked` before sending any input"). `10-verification-herdr-plugin.md` A16 could not catch this: its stub exits 0 for every call, so the `||` never fired and the `case` never had to match.
- fix direction: capture both streams and branch on the code rather than on the exit status, keeping the pane while the agent is merely slow: `start=$(herdr agent start "$name" --kind "$kind" --pane "$pane" 2>&1)` followed by `case "$start" in *agent_not_ready*) herdr agent wait "$name" --timeout 30000 >/dev/null 2>&1 || exit 0 ;; *) test "$rc" = 0 || exit 0 ;; esac` with `rc=$?` taken immediately after the assignment. Whichever shape is chosen, `2>/dev/null` cannot stay on that one call, since stderr carries the only copy of the code the branch reads. Then either keep the 90 second budget, which the reachable worst case now needs, or restate it.

## Advisories

### ADV-006 The trap covers EXIT only, so a hook killed at its timeout still abandons its pane

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `skills/delivery/herd-next/references/stop_hook.sh:34`
- evidence: `trap cleanup EXIT` does not fire when bash is terminated by an untrapped signal, and Claude Code kills a hook that exceeds its configured timeout. The install snippet documents 90 seconds; a user who omits `timeout` gets Claude Code's own default instead, which is shorter than the worst case the header describes. The window is narrow while CR-004 keeps the second wait unreachable, and widens as soon as CR-004 is fixed and the `agent wait` leg can run.
- suggestion: `trap cleanup EXIT INT TERM HUP`. One line, and it closes the last path on which the hook leaves behind what CR-001 was raised about.

### ADV-007 The handoff reply template still names the `gates: none` branch step 8 dropped

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `skills/delivery/herd-next/references/herd_next_answer.md:5`
- evidence: round 12 removed the `gates: none` clause from `SKILL.md:70`, so `--submit` is now the only way the skill submits. The reply template still instructs the model to add "One line when the command was submitted because the task declares `gates: none` or `--submit` was passed", a condition half of which the skill no longer implements and which no `task.md` key supports (`shared/CONVENTIONS.md:11` lists the frontmatter keys and `gates` is not among them). `SKILL.md:72` requires every `<...>` slot to be filled, so the contradiction is reachable in a printed reply.
- suggestion: cut "because the task declares `gates: none` or" from that slot, leaving `--submit` as its only trigger.

### ADV-008 A full chain accumulates one pane per phase in the same tab with no bound

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `skills/delivery/herd-next/SKILL.md:36-48`
- evidence: step 7 labels every pane it opens `<slug>/<phase>`, and step 5's busy filter selects labels that do *not* start with `$slug + "/"`, so a pane this skill created never counts as busy. Each phase therefore splits again from the caller's pane into the same tab, and a full chain of about ten phases ends with about eleven panes on one tab, each smaller than the last. `03-design-discussion-herdr-plugin.md:109` decided only the other-task case ("it creates a tab for the new task instead of crowding the current one"); same-task crowding was not decided anywhere, and `SKILL.md:74` rightly forbids the skill from closing a pane it did not create, so nothing reclaims the finished ones.
- suggestion: state the accumulation and who clears it in the Optional Stop hook section or in the handoff reply, one sentence. If the behavior should change instead, the smallest version is to count same-slug panes on the tab in step 5 and open a tab past a stated limit, reusing the branch that already exists.

### ADV-009 The gate mode watches exactly one pause and neither reply nor skill says a later gate needs another run

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `skills/delivery/herd-next/SKILL.md:86-90`
- evidence: `archon workflow wait "$run_id" --json` returns at the first pause, and the mode then opens its review pane and prints its reply, so the watch is over. The reply's last line, "Rejecting reopens the gate after the iterate skill revises the artifact" (`references/herd_next_gate_answer.md:5`), describes a cycle nothing is watching by then, and a pack with several gates pauses again with no notification.
- suggestion: one line in the gate reply saying the watch ended at this pause and that the next one needs `/herd-next --run <run-id>` again.

### ADV-010 The skill's hook section does not state the ancestor walk the hook now performs

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/herd-next/SKILL.md:129`
- evidence: that sentence says the hook "runs steps 3 to 7 itself: the task directory from the artifact in the fence ... It takes its working directory from the payload's `cwd`". Round 12 added a walk up from `cwd` to the nearest ancestor holding `.agents/tasks/` (`stop_hook.sh:49-57`), which no step 3 to 7 states, so the hook now does something the skill body does not describe while the same paragraph claims equivalence.
- suggestion: add the walk to that paragraph's list of differences, beside the payload `cwd` and the missing collision walk.

### ADV-011 One line-number citation was converted to a heading reference and an identical one left behind

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/herd-next/SKILL.md:86`
- evidence: round 12 replaced `workflows/delivery.md:252` with `workflows/delivery.md`, "Running skills by hand" on line 18, for the stated reason that a heading survives future insertions. `SKILL.md:86` still cites `workflows/delivery.md:147` for `interactive: true`. That line is currently correct, verified by reading it, and the nearest heading above it is "Steering a run" at line 132.
- suggestion: cite the section the same way, or leave both as line numbers; the mixed form is what makes the next drift silent.

## Dead Code and Dependency Review

- newly orphaned code: `stop_hook.sh:133-135`, the `case` on `agent_not_ready`, is unreachable as written. It is task-caused and is raised as CR-004 rather than as a deletion, because the branch is the behavior `SKILL.md:68` requires; the fix is to make the guard above it reachable. Nothing else in the change is orphaned: all three answer templates are referenced from `SKILL.md` and registered in `scripts/validate.mjs`, and `$decisions` (`SKILL.md:100`) is consumed by the gate reply's optional line.
- dependency findings: none. No dependency was added and no lockfile line changed; the change depends only on `jq`, `herdr`, and `archon`, each of which the hook probes with `command -v` before use, and the skill behind the `HERDR_ENV` guard.

## Verdict

- decision: request_changes
- overall code-health change: positive. The branch adds a self-contained, opt-in skill that touches no phase skill and no pack, registers itself through the checks the repository already enforces, and round 12 closed all three findings of round 11 with the CLI shapes those fixes depend on now confirmed against the live binary.
- rationale: one major finding blocks. The hook's blocked-startup recovery cannot execute, so on that path the session gets no pane and the trap removes the one it made, while both the skill body and the hook's own timeout comment state that it waits. The fix is local to `stop_hook.sh:132-135`.

## Review Limits

- blocked or unavailable checks: the typed-judgment helper exited 3 with `judge: unavailable: TYPESAFE_API_KEY is not set`, so every `helper coverage` line reads `unavailable` and all five axes were decided by reading the changed code against the pinned scope. The gate mode was not executed: no Archon run on this machine is paused at a gate, which is the same limit `10-verification-herdr-plugin.md:96` records for A2, and this review created no pane, tab, or agent, so nothing in the live workspace was mutated to test one.
- residual manual verification: the gate mode end to end at a live pause (verification A2, whose code changed in round 12 and has still never run), the kind read in the `claude`, `codex`, and `pi` runtimes rather than only `omp` (A25), and a gate declaring a decision id beyond `approve` and `reject` (A30). Each is an environment limit rather than a defect in the diff: A11 confirms the field shapes the gate mode reads, A31 confirms its pane target, the four accepted kinds match the four files in `runtimes/`, and `archon workflow respond` covers any authored id by construction.
