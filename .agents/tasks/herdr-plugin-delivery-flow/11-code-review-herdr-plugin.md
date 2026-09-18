---
type: code-review
date: 2026-09-17
branch: herdr-plugin-delivery-flow
base_branch: main
base_sha: 31d9b0ffce0773d00b37011a3dab0ed9e1c366e1
head_sha: 3497cbb14a4974ab69417e1e878803154e4ca21f
status: findings
summary: "Reviewed the 261 changed code and documentation lines that add the `herd-next` skill, its three terminal replies, the opt-in Claude Code Stop hook, and the registration rows in `scripts/validate.mjs`, `workflows/delivery.md`, `README.md`, `docs/getting-started.md`, and the plugin manifest. `npm test` passes at 61/61 with 42 skills and `shellcheck` is clean, but three major findings remain: the Stop hook abandons the pane or tab it created whenever a later `herdr` call fails, including the agent-name collision its own comment predicts for the review loop; the hook's documented 30 second install timeout is shorter than the two 30 second `herdr` waits it performs on the blocked-startup path it handles; and the Archon gate mode splits and labels with `$slug` and `$dir` that no step in that block computes, on the one path verification recorded as untested. Five advisories cover a `task.md` key that does not exist, a citation this same diff made stale, and the duplicated statement of steps 3 to 7."
---

# Code Review

## Scope

- merge base: `31d9b0ffce0773d00b37011a3dab0ed9e1c366e1` (`main`; no pull request exists for this branch and `task.md` carries no `base:`, so the target is the repository default branch)
- reviewed HEAD: `3497cbb14a4974ab69417e1e878803154e4ca21f`
- commits: 15 after the merge base, 9 of them `docs(task)` artifact commits. Code commits: `fb95578` handoff mode, `cd54aa8` gate mode, `1037f28` Stop hook, `c45c8c0` and `3432996` hook fixes.
- staged and unstaged changes: none; `git status --short` reports no tracked file modified.
- task-owned untracked files: none. Two untracked paths exist, `.backups/` and `.ignore`; neither is a task artifact.
- excluded changes: the 11 files under `.agents/tasks/herdr-plugin-delivery-flow/`, read as inputs rather than reviewed. Reviewed scope is 11 files, 261 insertions, 4 deletions.

## Previous Round

None.

## Requirements and Standards

- task or ticket: `.agents/tasks/herdr-plugin-delivery-flow/task.md`, `workflow: full`. The request asks for a Herdr plugin for the delivery flow that opens panes automatically and keeps context across sessions. It lists no acceptance criteria, so the criteria come from the plan's Desired End State.
- implementation source: `04-plan-herdr-plugin.md` (newest `plan`), three phases; its Desired End State is the four sentences graded as A1, A2, A4 and C1 in `10-verification-herdr-plugin.md`.
- repository instructions: `AGENTS.md:19-23`. A skill change must pass `scripts/validate.mjs`, `npm test` must pass, commit subjects must pass `scripts/check-commits.mjs`, and a user-facing change adds a `.changeset/` entry. `shared/WRITING.md` and `shared/CONVENTIONS.md` govern the prose and the task-directory contract; `SKILL.md:6` links both as required.

## Change Profile

- intent and expected behavior: one new skill parses the `/<skill> @<file>` handoff line a finishing phase already printed, opens a sibling Herdr pane at the same working directory, starts an agent of the caller's kind, labels it `<slug>/<phase>`, and stages the command without pressing Enter. A second mode blocks on an Archon run, notifies at a gate pause, and opens a review pane at the run's `working_path`. An opt-in Claude Code `Stop` hook does the first mode unprompted.
- change description quality: the `.changeset/herd-next-skill.md` entry names the skill, what it does, and the manual step it removes; the package name matches `package.json:2`. Commit subjects pass `node scripts/check-commits.mjs main..HEAD` with `ok: 15 subjects`. No pull request exists yet, so there is no PR body to judge.
- implementation model and review model: not recorded in any artifact. This review ran on `claude-opus-5`.
- changed-line size and logical cohesion: 261 changed lines across 11 files, one concern. Below the ~300-line coherent-change threshold; no split needed.
- resulting large-file concerns: none. The largest new file is `SKILL.md` at 129 lines.
- dependency or lockfile changes: none. `package-lock.json` is untouched by this diff; the version staleness `10-verification-herdr-plugin.md:100` records is pre-existing and not part of this change.

## Tests Reviewed First

- behavior claimed by tests: no test file is added or modified by this diff. `scripts/validate.mjs` is the contract that covers the change: `EXPECTED_SKILL_COUNT` moves 41 to 42 (`scripts/validate.mjs:20`) and the three new replies are declared `TERMINAL_ANSWER` in `ANSWER_INVENTORY` (`:57-59`), which routes them through `checkHandoff(..., {terminal: true})` at `:273-279`, asserting zero fenced blocks, no `Next action:` label, and no `Open a new session, then run:` sentence. All three satisfy that: `herd_next_answer.md` and `herd_next_gate_answer.md` use inline backticks only, and `herd_next_skipped_answer.md` writes "open a new session and run it there" in prose. Nothing was removed, relaxed, or skipped.
- missing or misleading coverage: every claim about `herdr` and `archon` runtime behavior rests on commands run by hand in the verification session, not on the suite. `npm test` proves the skill is discovered and counted and that its replies are terminal; it proves nothing about pane behavior. Three verification items are `untested` (A2 the whole gate mode, A25 the kind read outside `omp`, A30 a pack-authored decision id) and eight rows were hand-decided because the typed-judgment helper had no API key. Within that gap, no item covers any failure path after the hook creates a pane, which is CR-001 and CR-002, and A2's gap is where CR-003 sits.

## Five-Axis Assessment

- helper axis-coverage: `unavailable`

### Correctness

- assessment and evidence: the registration half is correct and proven. `npm test` re-run in this session exits 0 with `ok: 42 skills, 57 answer templates, 20 human-review templates, 0 banned tokens`, `plugin in sync (version 2.1.0, 35 skills, 7 agents)`, and `tests 61 / pass 61 / fail 0`; `shellcheck skills/delivery/herd-next/references/stop_hook.sh` and `bash -n` on the same file are both clean. The hook's parsing is sound on the paths the verification exercised: `${cmd#/}`, `${cmd%% *}` and `${cmd#* @}` split `/create-plan @04-plan-herdr-plugin.md` correctly, the two-task-directory case exits before touching a pane (`stop_hook.sh:43`), and the `${slug:0:stem}` cut keeps the phase in every name A18 measured. Three defects survive. The hook creates a pane or a tab and then abandons it on any of four later failures, one of which its own comment predicts (CR-001). Its documented install timeout is shorter than the waits it performs (CR-002). The gate mode uses `$slug` and `$dir` that no step in that block derives, on the path the verification could not run (CR-003). Two smaller correctness gaps are advisories: `task.md` never carries the `gates: none` key step 8 branches on (ADV-001), and neither mode checks the parsed skill name against the collection (ADV-003).
- helper coverage: `unavailable`

### Readability and Simplicity

- assessment and evidence: the skill body is numbered steps, each with the exact command and its JSON read, which is the shape the other delivery skills use; the hook mirrors those step numbers in its comments (`stop_hook.sh:28,59,64,82,97`) so the two can be read side by side. Names are direct: `busy`, `dir`, `stem`, `cmd`. The hook's failure style is uniform, every unresolvable branch `exit 0` with nothing changed, and `:10-12` states that rule once. One readability defect: the gate mode's cross-reference at `SKILL.md:121` says the tab-versus-split rule is "already stated" while `:109` unconditionally splits, so the reader cannot tell whether the busy-tab branch applies there. That is part of CR-003. One citation is stale (ADV-002). No dead code, no unnecessary abstraction, no repeated branching on unrelated paths.
- helper coverage: `unavailable`

### Architecture

- assessment and evidence: the skill sits where the repository puts skills, one directory under `skills/delivery/` holding `SKILL.md` and `references/`, so `scanSkills()` finds it with no manifest code (`scripts/lib/layout.mjs:12-51`), and the four registration edits are the minimum the contract requires: the count, the inventory rows, the workflow phase-table row, and the manifest entry. Ownership is right: the skill reads the handoff line the phase skills already print rather than rebuilding the phase chain, so nothing in `shared/CONVENTIONS.md` or the pack YAML changed, matching the plan's "What We're NOT Doing". Boundaries are respected: every identifier is read out of JSON, no pane id, kind, worktree path or decision id is predicted. The one structural cost is that steps 3 to 7 now exist twice, as prose in `SKILL.md:41-67` and as bash in `stop_hook.sh:64-104`. The change names two deliberate differences at `SKILL.md:127-129`; a third already exists and is not recorded (ADV-004), which is the drift this shape invites.
- helper coverage: `unavailable`

### Security

- assessment and evidence: no untrusted input reaches a shell. The hook's only external input is the Stop payload on stdin; `jq -r` extracts `last_assistant_message` and `cwd`, and the command is then narrowed by `grep -oE '^/[a-z0-9-]+( @[^ ]+)?$'` (`stop_hook.sh:21`), so `$cmd` cannot hold a space, a quote, a backtick, or `$`. Every later use is quoted, including `herdr pane send-text "$pane" "$cmd"` (`:104`), `herdr pane rename "$pane" "$slug/$phase"` (`:103`) and the `tab create --label "$slug"` (`:77`), so none of them can inject. `$slug` comes from an arbitrary file's first `slug:` line (`:53`) and is unsanitized before reaching the pane label, but quoted and only ever a label; the agent name built from it is filtered to `[a-z0-9-]` at `:93` and rejected unless it starts with a letter at `:95`. `$artifact` can hold `../`, which only redirects a `test -f` and a read of a `task.md`; no write happens anywhere, which `10-verification-herdr-plugin.md:45` confirms by observation. The hook stages with `send-text` and never calls `agent prompt`, so it cannot record approval of an artifact on the user's behalf. It ships no `hooks` block and the installer never writes `~/.claude/settings.json`, so installing it stays the user's explicit act (`SKILL.md:129`). No secret, credential, token, or network call appears in the diff. `set -u` without `set -e` is deliberate and correct here, since a Stop hook must not block a session.
- helper coverage: `unavailable`

### Performance

- assessment and evidence: the hook runs once per Claude Code Stop and exits at `:22` without spawning anything when the last message holds no handoff line, so the common case costs one `jq` and one `grep`. On the acting path it makes at most six `herdr` calls, each a single socket round trip, plus one `ls -t` over `.agents/tasks/*/task.md`. No loop is unbounded: the `for` at `:41` iterates one glob expansion and exits on the second hit. The only blocking call is the gate mode's `archon workflow wait`, which holds the caller's pane for the life of the run; that is a known limit the plan recorded and A28 confirmed against `archon workflow wait --help`, and it is stated in the skill at `SKILL.md:85`. No N+1, no unbounded query, no hot-path allocation. The one performance-shaped defect is the timing mismatch in CR-002, recorded there rather than here.
- helper coverage: `unavailable`

## Verification Story

- command or inspection: `npm test`; `node scripts/check-commits.mjs main..HEAD`; `shellcheck skills/delivery/herd-next/references/stop_hook.sh`; `bash -n` on the same file; `git diff --stat main...HEAD -- ':!.agents/tasks'`; `herdr agent start --help`, `herdr agent wait --help`, `herdr pane split --help`, `herdr pane close --help`, `herdr tab --help`; `archon workflow get d428fde0-6d62-45e0-80ec-16d6fd565727 --json`; `grep -n "Every skill still works in a plain agent session" workflows/delivery.md`; `git grep -n "gates" -- .archon workflows shared`.
- result: `npm test` exit 0, `tests 61 / pass 61 / fail 0`, `ok: 42 skills, 57 answer templates, 20 human-review templates, 0 banned tokens`. `check-commits` exit 0, `ok: 15 subjects`. `shellcheck` exit 0 with no output; `bash -n` exit 0. Code-only diff is 11 files, 261 insertions, 4 deletions. `herdr agent start --help` documents `--timeout <MS>` "Wait for interactive readiness (default: 30000; max: 300000)" and "Success means the expected agent was detected in the same terminal and is ready for input". `herdr pane split --help` shows `--direction <DIRECTION> [possible values: right, down]`, so an empty value is rejected. `herdr pane close <pane_id>` and `herdr tab close` both exist. `archon workflow get` returns `working_path` and `metadata.approval.message` naming `.agents/tasks/herdr-plugin-delivery-flow`. The by-hand paragraph in `workflows/delivery.md` is at line 253; line 252 is blank. `gates` appears only as an Archon run input in the pack YAML, never as a `task.md` key.
- manual, screenshot, or before-and-after evidence: none taken in this session. Pane behavior was not exercised here, because `herdr agent start`, `pane split` and `tab create` mutate the live workspace and this phase makes no edits. The pane evidence on record is A1 and A32 in `10-verification-herdr-plugin.md:27,57`, both of which exercised success paths only.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 The Stop hook abandons the pane or tab it created when a later herdr call fails

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `skills/delivery/herd-next/references/stop_hook.sh:74-104`
- failure mode: the pane is created at `:74`, or a whole tab at `:77`, before any of the four calls that configure it. `agent start` (`:99`), `agent wait` (`:101`), `pane rename` (`:103`) and `pane send-text` (`:104`) each `exit 0` on failure without removing what the script already created, so every failure leaves an empty or half-configured pane, or an empty tab, that the user closes by hand. The script's own comment at `:85-86` names a recurring trigger: "a name already in use fails the start below and the hook stops." The name is `<slug>-<phase>`, so a phase that runs twice for one task collides. The review loop does exactly that: `review-code` and `fix-code-review` alternate until the review is clean (`skills/delivery/review-code/SKILL.md:10`), so the second `/review-code` handoff collides on `<slug>-review-code` and leaks one pane per round, which is precisely the workspace crowding the tab-versus-split branch at `:64-79` exists to prevent.
- evidence or reproduction: read of `stop_hook.sh:74-104`; no branch between pane creation and `:105` calls `pane close` or `tab close`, and the script installs no `trap`. `herdr agent start --help` on this machine gives a second, name-independent trigger: it waits for interactive readiness with a 30000 ms default and success requires the agent to be detected and ready, so a slow start fails after the pane exists. `10-verification-herdr-plugin.md:57` (A32) exercised only the success path, and no item in that table covers a failure after pane creation.
- fix direction: record what the script created and remove it on every exit after that point, for example set `created_pane=$pane` (or `created_tab`) and add a `trap` that runs `herdr pane close "$created_pane"` or `herdr tab close "$created_tab"` unless the run reached `:104`. Both subcommands exist on the installed CLI (`herdr pane close <pane_id>`, `herdr tab close`), and closing is permitted here because the rule at `SKILL.md:73` forbids closing only what the skill did not create.

### CR-002 The documented hook timeout is shorter than the herdr waits the hook performs

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `skills/delivery/herd-next/references/stop_hook.sh:4`, with `:99` and `:101`
- failure mode: the install snippet the file documents is `{"hooks":[{"type":"command","command":"<path to this file>","timeout":30}]}`, and that value is seconds. On the blocked-startup path the script waits inside `herdr agent start` for up to 30 s, then inside `herdr agent wait "$name" --timeout 30000` for up to another 30 s, before it renames the pane and stages the command. Claude Code kills the hook at its own 30 s, so the branch the script explicitly handles ends with the pane created, the agent not confirmed, no label, and no staged command. A Stop hook that is killed reports nothing to the session, so the user sees an unlabeled empty pane and no explanation. This compounds CR-001: the kill happens after pane creation, so the leaked pane is the normal outcome of a slow start.
- evidence or reproduction: `stop_hook.sh:4` against `:99` and `:101`. `herdr agent start --help` on this machine: `--timeout <MS>  Wait for interactive readiness (default: 30000; max: 300000)`; the script passes no `--timeout` to `agent start`, so it takes that default. `herdr agent wait --help` confirms `--timeout <MS>` is a millisecond value, and `:101` passes 30000. Worst case is therefore about 60 s of herdr waits plus four other round trips, against a 30 s budget.
- fix direction: either raise the snippet's `timeout` above the sum the script can spend, for example 90, or bound both waits well inside 30 s by passing an explicit `--timeout` to `agent start` and lowering the `agent wait` value, and state the relationship between the two numbers in the comment so a later edit to one does not silently break the other.

### CR-003 The gate mode splits and labels with slug and dir that no step in that block computes

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/herd-next/SKILL.md:108-111`
- failure mode: the gate block derives `status`, `cwd`, `node`, `msg`, `decisions` and `resolved` at `:93-101`, the phase from `nodeId` at `:103`, and `$artifact` from `metadata.approval.message` resolved against `$cwd` at `:115`. It then uses `$slug`, `$dir` and `$name`, none of which it derives. Step 3's rule reads the slug from `task.md` in the caller's own task directory, which this mode deliberately does not use: the pane opens at the run's `working_path` (`:96,109`), a different checkout from `$PWD` whenever the caller is not already inside the run's worktree, and A31 was recorded precisely to hold that distinction (`10-verification-herdr-plugin.md:56`). Following the skill as written names the wrong task in the notification title and the pane label, and in the agent name that step 6 builds from the same slug, or produces nothing at all when `$PWD` holds no task directory. `$dir` is empty in this block, and `herdr pane split --direction` accepts only `right` or `down`, so the split is rejected, `$pane` is empty, and `herdr agent start --pane ""` runs against an empty id. The cross-reference at `:121` names the tab-versus-split rule as already stated while `:109` splits unconditionally, so the reader cannot recover the missing derivation from it.
- evidence or reproduction: `archon workflow get d428fde0-6d62-45e0-80ec-16d6fd565727 --json` on this machine returns `working_path` and `metadata.approval.message` reading "…the newest implementation artifact in .agents/tasks/herdr-plugin-delivery-flow…", so the slug is available from the same string the skill already parses for `$artifact`; nothing in the skill says to take it from there. `herdr pane split --help` shows `--direction <DIRECTION> [possible values: right, down]`. `10-verification-herdr-plugin.md:28` records A2, the gate mode end to end, as `untested` because no run was parked at a gate, and A31 was decided by reading `SKILL.md:96,109` rather than by running the mode, so no check in the change would catch this.
- fix direction: derive the slug in this block from the task directory named in `metadata.approval.message` resolved against `$cwd`, the same source and the same line as `$artifact`, and compute `dir` here with step 5's `pane layout` read. If the intent is that the block reuses steps 5 and 6 verbatim, say so at `:121` naming the variables it inherits and the one substitution it makes (`$cwd` for `$PWD`), rather than listing the rules by name.

## Advisories

### ADV-001 task.md never carries the gates key the submit branch reads

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `skills/delivery/herd-next/SKILL.md:69`
- evidence: step 8 submits "when the task's `task.md` carries `gates: none`, because that chain was already declared unattended". `shared/CONVENTIONS.md:11` enumerates the `task.md` frontmatter keys as `slug`, `title`, `workflow`, `created`, plus `parent`, `base`, `depends_on` for epic children and the optional `issue`, `routed_by`, `route_confidence`; `gates` is not among them. `gates` is an Archon run input (`archon workflow run ... --input gates=none`, `.archon/workflows/delivery-omp/full/delivery-full-omp.yaml:8`) and no pack node writes it into `task.md`. The branch therefore never fires, so an unattended chain still stages rather than submits; and a user who hand-adds the key, reasoning from the Archon flag name, silently converts a human gate into an auto-approval through an undocumented key that nothing validates.
- suggestion: key the submit on `--submit` alone, or read the run's `gates` input in the gate mode where it actually exists, and drop the `task.md` sentence.

### ADV-002 The delivery.md citation is off by one after this change

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/herd-next/SKILL.md:18`
- evidence: the guard's explanation cites `workflows/delivery.md:252` for the documented paste-by-hand flow. The same diff inserted the `herd-next` phase-table row at `workflows/delivery.md:239`, which moved "Every skill still works in a plain agent session without Archon" to line 253; line 252 is now blank.
- suggestion: cite `:253`, or cite the section heading "Running skills by hand" so the reference survives the next insertion.

### ADV-003 Neither mode checks that the parsed skill name is a skill in this collection

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `skills/delivery/herd-next/SKILL.md:20`, `skills/delivery/herd-next/references/stop_hook.sh:21`
- evidence: both accept any line matching `^/[a-z0-9-]+( @[^ ]+)?$`. An assistant message whose last such line is `/clear`, `/compact`, or any unrelated slash command opens a pane labelled `<slug>/clear` with that text staged, and with no `@file` the hook falls back to the most recently touched task directory (`stop_hook.sh:50`), so the pane is attributed to whatever task was touched last. `scripts/validate.mjs:290` already rejects a fence naming an unknown skill, but only at build time against the answer templates; nothing checks the name at run time.
- suggestion: reject a parsed name that is not a skill directory in the installed tree before anything is created, and in the hook exit 0 on that branch like the other unresolvable cases.

### ADV-004 A third difference between the skill body and the hook is not recorded

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `skills/delivery/herd-next/SKILL.md:41-46,127-129`, `skills/delivery/herd-next/references/stop_hook.sh:70-73`
- evidence: steps 3 to 7 are stated twice, once as prose and once as bash. `SKILL.md:127-129` records two deliberate differences, the payload's `cwd` in place of `$PWD` and the absent collision walk. A third exists and is not listed: `stop_hook.sh:73` falls back to `down` when `pane layout` yields nothing, while step 5 has no fallback, so an empty read makes the skill's `herdr pane split --direction ""` fail against a CLI that accepts only `right` or `down`. A29 confirmed the two statements agree today (`10-verification-herdr-plugin.md:54`) without catching this one, which is the drift the duplication invites.
- suggestion: add the same `case "$dir" in right|down) ;; *) dir=down ;; esac` fallback to step 5 and list it as the third recorded difference, or make the hook the single statement of steps 3 to 7 and have step 5 point at it.

### ADV-005 The hook resolves task directories only against the payload cwd

- type: Nitpick
- severity: trivial
- category: Stability and availability
- location: `skills/delivery/herd-next/references/stop_hook.sh:41,50,52`
- evidence: both lookups glob `"$cwd"/.agents/tasks/*/`, where `$cwd` is the Stop payload's working directory. When a session is started in a subdirectory of the repository, neither glob matches, `task` stays empty, and `:52` exits 0. The hook is silent by design, so the feature simply appears not to work with no way to tell why.
- suggestion: walk up from `$cwd` to the first directory holding `.agents/tasks/`, or `.git`, before the lookup.

## Dead Code and Dependency Review

- newly orphaned code: none. Every file the change adds is reachable: the three answer templates are named in `SKILL.md:18,71,123` and registered in `scripts/validate.mjs:57-59`, and `references/stop_hook.sh` is named at `SKILL.md:127`, which `scripts/validate.mjs:250-256` enforces must exist. No existing file was left without callers; the four registration edits add rows and change one constant, removing nothing.
- dependency findings: none. No package was added, removed, or upgraded, and `package-lock.json` is not in the diff. The change introduces two runtime prerequisites for the hook rather than package dependencies, `jq` and `herdr`, and both are checked before anything runs (`stop_hook.sh:16-17`).

## Verdict

- decision: request_changes
- overall code-health change: positive. The skill lands in the place the repository's own layout and validator expect, adds no pack or convention change, reads every identifier out of JSON rather than predicting it, and comes with a changeset and the four registration rows the contract requires. The three findings are all in failure handling on paths the verification could not or did not exercise, not in the design.
- rationale: CR-001 and CR-002 leave the user's workspace worse on the exact failures the hook was written to survive, and CR-001's recurring trigger is the review loop this same collection runs. CR-003 leaves the gate mode's split and labels resting on variables that block never computes, on the one acceptance item the verification recorded as untested. Each is a small, local edit.

## Review Limits

- blocked or unavailable checks: typed judgments were skipped. `node /Users/marktripoli/.agents/skills/typed-judgment/judge.mjs axis-coverage .agents/tasks/herdr-plugin-delivery-flow/11-code-review-herdr-plugin.md --json` exited 3 with `judge: unavailable: TYPESAFE_API_KEY is not set`, so every `helper coverage` line reads `unavailable` and all five axes were decided by reading the pinned diff directly. The gate mode could not be exercised: the only Archon run on this machine, `d428fde0`, reports `status: "running"` with `metadata.approval.resolved` already `"approved"`, so no gate is live to open a review pane against. No `herdr` call that creates or mutates a pane, tab, or agent was made, because this phase makes no edits; pane behavior is taken from `10-verification-herdr-plugin.md` A1 and A32, both success paths.
- residual manual verification: reproduce CR-001 by firing the hook twice for the same `<slug>-<phase>` and confirming the second run leaves a pane behind; reproduce CR-002 against an agent kind that is slow to reach readiness, or by lowering the install `timeout` and watching the pane survive the kill. CR-003 needs a run parked at a gate to observe end to end, which is the same evidence `10-verification-herdr-plugin.md:89` still lists as open for A2. A25 and A30 from that table also remain open and are unaffected by this review.
