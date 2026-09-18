---
type: code-review
date: 2026-09-18
branch: herdr-plugin-delivery-flow
base_branch: main
base_sha: 31d9b0ffce0773d00b37011a3dab0ed9e1c366e1
head_sha: 3497cbb14a4974ab69417e1e878803154e4ca21f
status: clean
summary: "Reviewed the 11 changed code and documentation files that add the `herd-next` skill, its three terminal replies, the opt-in Claude Code Stop hook, and the registration rows (307 inserted lines) at commit 3497cbb plus the uncommitted round-16 fixes. Round 15's only major finding, CR-005, is fixed and proved fixed by an independent mock-`herdr` harness: with `agent wait --until idle --until done` failing inside the timeout the hook now stops before `pane rename` and `pane send-text` and closes the pane it made, where the pre-fix script staged the handoff into a blocked agent. No critical- or major-severity finding replaces it. Every `herdr` subcommand and flag the skill and the hook invoke exists in the installed CLI (herdr 0.9.0), `agent wait --until` accepts `idle` and `done`, and the live JSON from `pane list`, `pane layout`, and `pane current` matches every jq filter, including the absence of a `label` key on an unrenamed pane, which is what keeps the busy check from sending a first run into a new tab. Six hook branches were executed end to end against a stub: happy path from a repository subdirectory, `agent_not_ready` recovered, `agent_not_ready` still blocked, busy tab, `pane rename` failure with tab teardown, and the three no-op guards. Four advisories remain, none blocking: an untracked `.backups/` tree this task created at the repository root, a one-character off-by-one between step 6's prose and the hook's `stem` guard, `--until done` accepting an exited agent before the stage, and step 5's prose calling the hook's line match a fence match when it matches any standalone command line. `npm test` passes 61/61, `validate.mjs` reports 42 skills, `sync-plugin.mjs --check` reports the manifest in sync, `check-commits.mjs main..HEAD` reports 15 subjects, and `shellcheck` and `bash -n` are clean."
---

# Code Review

## Scope

- merge base: `31d9b0ffce0773d00b37011a3dab0ed9e1c366e1`. No pull request exists for this branch (`gh pr view` reports none) and `task.md` carries no `base:`, so the target is the repository default branch, `main` (`git symbolic-ref refs/remotes/origin/HEAD` is `refs/remotes/origin/main`).
- reviewed HEAD: `3497cbb14a4974ab69417e1e878803154e4ca21f` plus the uncommitted working tree.
- commits: 15 after the merge base, `4c7cdb2` through `3497cbb`; six are code or documentation, nine are `docs(task)` artifact commits.
- staged and unstaged changes: none staged. Unstaged: `skills/delivery/herd-next/SKILL.md`, `references/herd_next_answer.md`, `references/herd_next_gate_answer.md`, `references/stop_hook.sh` (the round-14 and round-16 fixes), and `.agents/tasks/herdr-plugin-delivery-flow/04-plan-herdr-plugin.md`.
- task-owned untracked files: `11-code-review-`, `12-code-review-fixes-`, `13-code-review-`, `14-code-review-fixes-`, `15-code-review-`, and `16-code-review-fixes-herdr-plugin.md`.
- excluded changes: everything under `.agents/tasks/`, which is task memory rather than a review subject; `.ignore`, an untracked pre-existing ripgrep configuration for graft that this task did not touch; `.backups/`, untracked scratch this task created, excluded as a review subject but recorded as ADV-015 because it sits in the repository root and no ignore rule covers it.

Reviewed as the change: `.changeset/herd-next-skill.md`, `.claude-plugin/plugin.json`, `README.md`, `docs/getting-started.md`, `scripts/validate.mjs`, `workflows/delivery.md`, `skills/delivery/herd-next/SKILL.md`, and the four files under `skills/delivery/herd-next/references/`. 11 files, 307 insertions, 4 deletions.

## Previous Round

- previous artifact: `.agents/tasks/herdr-plugin-delivery-flow/15-code-review-herdr-plugin.md`
- CR-005 The blocked-startup wait has no `--until`, so it returns at once: fixed

`stop_hook.sh:139` now reads `herdr agent wait "$name" --until idle --until "done" --timeout 30000`, and `SKILL.md:68` carries the same two flags with the sentence naming `blocked` as the state the branch exists to sit out. Decided from the current diff and from executing the branch, not from the fix round's claim: see the third harness run under [Verification Story](#verification-story).

## Requirements and Standards

- task or ticket: `.agents/tasks/herdr-plugin-delivery-flow/task.md`. Free-form request, no acceptance-criteria list, so the plan's Desired End State stands in for one.
- implementation source: `04-plan-herdr-plugin.md` (type `plan`, newest of that type). Its Desired End State asks for four things: `/herd-next` opens the next phase in its own pane at the same working directory with the exact command staged and focus unchanged; `/herd-next --run <run-id>` blocks on a run, notifies at the pause, and opens a review pane at the run's worktree; outside Herdr one terminal reply and no change; `npm test` green at the end of every phase. The first, third, and fourth are proved below. The second is prose only, and stays unproved for the reason `10-verification-herdr-plugin.md` row A2 gives: no Archon run on this machine is parked at a gate.
- repository instructions: `shared/CONVENTIONS.md` (artifact numbering, terminal replies, Conventional Commits), `shared/WRITING.md` (no em dashes, no praise words), `scripts/validate.mjs` (skill count, answer inventory, the `workflows/delivery.md` phase-table row). All enforced mechanically and all green.

## Change Profile

- intent and expected behavior: one new by-hand skill in `skills/delivery/herd-next/` that turns the `/<skill> @<file>` line a finishing phase already prints into a live Herdr pane, plus an optional Claude Code `Stop` hook that does the same unprompted, plus the six registration edits a new skill requires.
- change description quality: the six code commit subjects are imperative, scoped, under 72 characters, and one type each; `check-commits.mjs main..HEAD` accepts all 15. The bodies say why (`c45c8c0` "make the herd-next Stop hook open the pane itself", `3432996` "keep the phase in the herd-next agent name"), not what the diff shows.
- implementation and review model: not recorded in the artifacts. Review model: Opus 5.
- changed-line size and logical cohesion: 307 inserted lines over 11 files, one coherent feature plus its registration. Inside the "~300 coherent" band, no split warranted.
- resulting large-file concerns: none. The largest changed file is `SKILL.md` at 136 lines.
- dependency or lockfile changes: none. `package.json` and the lockfile are untouched; the hook depends only on `jq` and `herdr`, and checks for both with `command -v` before doing anything.

## Tests Reviewed First

- behavior claimed by tests: the repository has no unit test for this skill and adds none. What the suite does assert about it is registration: `scripts/validate.mjs` fails unless `EXPECTED_SKILL_COUNT` matches the directory count (41 to 42), unless every `*answer.md` under the skill appears in `ANSWER_INVENTORY` with a matching declared handoff, unless the three new replies satisfy `TERMINAL_ANSWER` (zero fenced blocks, no `Next action:`, no fresh-session sentence), and unless a skill placed in `skills/delivery/` has a row in the `workflows/delivery.md` phase table. All three new templates were read against that rule and hold no fence.
- missing or misleading coverage: the skill body is prose a model executes and the hook is a shell script, so neither is reachable from `node --test`. The hook is the part that could carry a unit test and does not. That gap is not new to this change and is covered instead by the executed harness below, which is what a test would have asserted; recording it as a finding would be enforcing a convention this repository does not have, since no other shipped script under `skills/` carries one either.

## Five-Axis Assessment

- helper axis-coverage: unavailable. `node /Users/marktripoli/.agents/skills/typed-judgment/judge.mjs axis-coverage .agents/tasks/herdr-plugin-delivery-flow/17-code-review-herdr-plugin.md --json` exits 3 with `judge: unavailable: TYPESAFE_API_KEY is not set`, so every axis below is decided by hand.

### Correctness

- assessment and evidence: every `herdr` call in both statements resolves against the installed CLI, herdr 0.9.0. `herdr pane --help` lists `list`, `current`, `layout`, `split`, `rename`, `send-text`, and `close`; `herdr tab --help` lists `create` and `close`; `herdr agent --help` lists `start`, `wait`, `prompt`, and `list`. `herdr agent wait --help` declares `--until` as repeatable over `idle, working, blocked, done, unknown` and states that a bare wait "matches idle, done, or blocked", which is the contract CR-005 turned on; `--until idle --until done` is therefore both valid and the correct exclusion. `herdr agent start --help` accepts `claude`, `codex`, `omp`, and `pi` among its kinds, so `SKILL.md:28` and `stop_hook.sh:94` filter to a subset of real values. `herdr notification show --help` accepts `--body` and `--sound request`; `tab create` accepts `--workspace`, `--cwd`, `--label`, `--no-focus`; `pane split` accepts `--current`, `--direction right|down`, `--cwd`, `--no-focus`.
  Live JSON matches every jq filter: `herdr pane list` returned panes carrying `tab_id` and, for an unrenamed pane, no `label` key at all, so `.label // empty` yields nothing and the busy check does not misread a fresh tab as occupied by another task; `herdr pane layout --pane $HERDR_PANE_ID` returned `.result.layout.panes[].rect` with `width` and `height`; `herdr pane current --current` returned `.result.pane.agent`. `herdr tab list` shows tabs do carry a default `label`, which is why the busy check reads pane labels and not tab labels.
  The hook's own control flow was executed against a stub `herdr` in a temporary repository, six branches, call logs in [Verification Story](#verification-story). The `rc=$?` immediately after `start=$(...)` captures the command substitution's status correctly, and the `*agent_not_ready*` case reads the code rather than the status, which is what makes an error printed on stderr with exit 1 reach the recovery branch. `set -u` is on with no `set -e`, and every variable the script reads is either initialized (`task=""`, `created_pane=""`) or defaulted (`${HERDR_TAB_ID:-}`).
  The ancestor walk at `stop_hook.sh:53-58` terminates: `root=${root%/*}` shortens on every iteration, the empty result is rewritten to `/`, and the loop condition stops at `/`. A `cwd` outside any repository ends at `test -d "$root/.agents/tasks" || exit 0`, which the fourth harness run confirms makes zero `herdr` calls.
- helper coverage: unavailable

### Readability and Simplicity

- assessment and evidence: the hook is linear, 145 lines, one commented block per numbered step of the skill it mirrors, and its comments state the reason rather than the action ("a Stop hook must never block a session", "submitting the handoff would record approval"). `shellcheck` exits 0 with one justified inline disable (`SC2329` on `cleanup`, which is reached through the trap). `bash -n` exits 0. No dead code: the only unreferenced construct is `created_tab`, which the tab branch sets and the fifth harness run exercises.
  Two places where the prose and the script disagree by a hair are recorded as ADV-016 and ADV-018. Neither changes behavior at any reachable input.
- helper coverage: unavailable

### Architecture

- assessment and evidence: steps 3 to 7 now exist twice, once as prose a model executes and once as bash. `10-verification-herdr-plugin.md` row A29 names this and leaves a re-decide checkbox. It is the right call rather than a defect: a `Stop` hook receives JSON on stdin and cannot call a model, so the hook cannot delegate to the skill, and the skill cannot delegate to the hook because it must ask questions the hook has no way to ask. The duplication is bounded (five herdr calls and two jq filters), the skill body names each divergence explicitly at `SKILL.md:131-133`, and I re-read `SKILL.md:22-74` against `stop_hook.sh:60-143`: the sequence, the kind filter, the busy filter, the rect comparison, and the name construction agree, with the two stated differences (`cwd` for `$PWD`, no `-2`/`-3` collision walk) and the one unstated one in ADV-016.
  Registration touches only inventory lists that already existed for this purpose: the plugin manifest array, the README utilities row, the getting-started by-hand list, the delivery phase table, and the by-hand sentence in `workflows/delivery.md:253`. I grepped every file naming another utility skill (`review-artifact-comments`) and found no inventory that still omits `herd-next`. `sync-plugin.mjs --check` reports 35 skills and 7 agents, which reconciles with `validate.mjs`'s 42.
- helper coverage: unavailable

### Security

- assessment and evidence: the hook consumes model-produced text. `$cmd` is constrained by `grep -oE '^/[a-z0-9-]+( @[^ ]+)?$'` to a whole line of the form `/<skill>` or `/<skill> @<token>`, and is then passed as one quoted argv element to `herdr pane send-text`. There is no `eval`, no unquoted expansion into a command position, and no `sh -c` anywhere in the file. `$artifact` reaches only `test -f`, a quoted glob in a `for`, and parameter expansion, never execution; shell metacharacters inside it can at worst fail to match a path.
  The stage-not-submit rule is the security-relevant one and it holds: `send-text` places the line on the next agent's input without Enter, so nothing derived from model output runs unattended, and the one submitting call (`agent prompt`) is gated on an explicit `--submit` from the caller. Round 14 removed the `gates: none` auto-submit path from `SKILL.md:70` and from `herd_next_answer.md`, which narrows this correctly.
  No secrets are read or written. The hook writes no file anywhere, which its header states and the diff confirms: no redirection to any path, only `>/dev/null`. It reads `~/.claude/settings.json` only in the sense that the user installs it there by hand; the collection ships no `hooks` block and the installer never writes that file.
- helper coverage: unavailable

### Performance

- assessment and evidence: at most seven `herdr` round trips per invocation, each a local socket call over `$HERDR_SOCKET_PATH`. The two bounded waits are `agent start`'s own `--timeout` default of 30000 ms and the recovery `agent wait --timeout 30000`; the header now documents the 90 s hook timeout as covering both plus the remaining round trips, and points at the two numbers to raise together. The only filesystem scan is `ls -t "$root"/.agents/tasks/*/task.md`, one directory listing on the fence-without-artifact path. No loop is unbounded, no query is unpaginated, nothing blocks on a network call.
  The one unbounded quantity is panes, not time: `SKILL.md:135` states that a full chain splits one pane per phase into the same tab with nothing closing the finished ones. That is a stated limit of the shipped behavior rather than a defect the diff introduces.
- helper coverage: unavailable

## Verification Story

- command or inspection: `npm test`
- result: exit 0, `tests 61 / pass 61 / fail 0`.
- command or inspection: `node scripts/validate.mjs`
- result: exit 0, `ok: 42 skills, 57 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command or inspection: `node scripts/sync-plugin.mjs --check`
- result: exit 0, `plugin in sync (version 2.1.0, 35 skills, 7 agents)`.
- command or inspection: `node scripts/check-commits.mjs main..HEAD`
- result: exit 0, `ok: 15 subjects`.
- command or inspection: `shellcheck skills/delivery/herd-next/references/stop_hook.sh` and `bash -n` on the same file
- result: both exit 0, no output.
- command or inspection: `herdr --version`, then `herdr pane --help`, `herdr agent --help`, `herdr tab --help`, `herdr agent wait --help`, `herdr agent start --help`, `herdr notification show --help`, `herdr tab create --help`, `herdr pane split --help`
- result: herdr 0.9.0. Every subcommand and flag the skill and hook use is present; `agent wait --until` accepts `idle` and `done` and documents the bare wait as matching `idle, done, or blocked`; `agent start --kind` accepts all four kinds the filter allows.
- command or inspection: `herdr pane list`, `herdr tab list`, `herdr pane layout --pane $HERDR_PANE_ID`, `herdr pane current --current` against the live server in this session
- result: the unrenamed caller pane carries no `label` key, so the busy filter yields nothing and a first run splits rather than opening a tab; `rect` carries `width` 120 and `height` 40; `.result.pane.agent` is `omp`. Tabs do carry a default `label` (`"1"`), which the skill correctly does not read.
- command or inspection: the shipped `stop_hook.sh` run under a stub `herdr` on `PATH` in a temporary repository, six payloads. Happy path with `cwd` in a subdirectory and an artifact named in the fence; `agent_not_ready` then a recovered wait; `agent_not_ready` then a wait that fails inside the timeout; a tab holding another task's labelled pane; the same with `pane rename` failing; and the three no-op guards (no task directory anywhere, no handoff line, `HERDR_ENV` unset).
- result: happy path logged `pane current`, `pane list`, `pane layout`, `pane split --cwd <the subdirectory>`, `agent start demo-task-create-plan --kind claude --pane pNEW`, `pane rename pNEW demo-task/create-plan`, `pane send-text pNEW /create-plan @04-plan-demo-task.md`, resolving the task directory from the repository root two levels above `cwd` while still opening the pane at `cwd`. Recovered wait inserted `agent wait demo-task-describe-pr --until idle --until done --timeout 30000` and then staged as normal. **Still-blocked wait logged `agent start`, `agent wait ... --until idle --until done`, `pane close pNEW` and nothing else: no `pane rename`, no `pane send-text`. That is CR-005 fixed, executed rather than accepted.** Busy tab called `tab create --workspace w1 --cwd <repo> --label demo-task --no-focus` and `agent start ... --pane pTAB` with zero `pane split` calls; with `pane rename` failing it logged `tab close tNEW`, so the tab branch tears down through `created_tab`. All three guards exited 0, and the `HERDR_ENV` guard made zero `herdr` calls.
- manual, screenshot, or before-and-after evidence: none taken in this session. The live-pane evidence this change rests on is in `10-verification-herdr-plugin.md` rows A1, A22, and A32: a real Claude Code `Stop` payload carries `last_assistant_message` and `cwd` (Claude Code 2.1.258), and the shipped hook installed as a real Stop hook opened pane `w3F:pD` labelled `herdr-plugin-delivery-flow/describe-pr` at the payload's `cwd` with `/describe-pr` staged and focus unchanged. Those are recorded as `pass` with commands and quoted output and are not re-run here.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-015 An untracked `.backups/` tree this task created sits in the repository root with no ignore rule

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `.backups/`
- evidence: `git status --short` lists `?? .backups/`, and `git check-ignore -v .backups` exits 1, so no rule in `.gitignore` covers it. The tree holds 11 `.bak` files and four subdirectories, about 170 KB, including `.backups/iterate-phase3/04-plan-herdr-plugin.md` and `.backups/stop_hook.sh.bak-round15`, which are this task's own iterate and fix rounds. `shared/CONVENTIONS.md` forbids `git add -A` for code, so the committed history is safe, but a person running `git add .` before the pull request sweeps the whole tree in.
- suggestion: add `.backups/` to `.gitignore` in the same commit that opens the pull request, or delete the tree once the review loop closes. Nothing in the change reads from it.

### ADV-016 Step 6's prose takes the joined-name fallback one character later than the hook does

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/herd-next/SKILL.md:58`, `skills/delivery/herd-next/references/stop_hook.sh:121`
- evidence: the prose says "A phase longer than 31 characters leaves no room for a stem", so it switches to cutting the joined name at phase length 32 and above. The hook computes `stem=$((32 - ${#phase} - 1))` and takes the fallback whenever `stem` is below 1, which is phase length 31 and above. At exactly 31 the prose prescribes `${slug:0:0}-$phase`, a name starting with `-`, which the leading-lowercase check the same step now states would then reject. No skill name in the collection comes close: the longest is `create-research-questions` at 25 characters, so no reachable input reaches the branch.
- suggestion: change the prose to "A phase of 31 characters or more leaves no room for a stem", matching the `stem >= 1` guard the hook already uses.

### ADV-017 `--until done` lets the recovery proceed against an agent that has exited

- type: Potential issue
- severity: trivial
- category: Stability and availability
- location: `skills/delivery/herd-next/references/stop_hook.sh:139`, `skills/delivery/herd-next/SKILL.md:68`
- evidence: `herdr agent wait --help` lists `done` alongside `idle` as a terminal state. The branch exists because `agent start` reported `agent_not_ready`, meaning the agent is blocked at a startup dialog; if the user answers that dialog by quitting, the agent reaches `done` rather than `idle`, the wait returns 0, and the script proceeds to `pane rename` and `pane send-text`. The command then lands on a bare shell prompt in a pane the hook labels as a live phase. Nothing is submitted and nothing is lost, so the cost is a misleading pane rather than a wrong action.
- suggestion: drop `--until done` and wait on `idle` alone in both statements, which is the only state that means "ready for input". Keeping `done` is defensible as parity with the bare wait minus `blocked`; if it stays, one clause in the skill body saying an exited agent still gets the stage would close the gap.

### ADV-018 The hook matches any standalone command line, not only one inside a fence

- type: Nitpick
- severity: info
- category: Functional correctness
- location: `skills/delivery/herd-next/SKILL.md:131`, `skills/delivery/herd-next/references/stop_hook.sh:43`
- evidence: `SKILL.md:131` says the hook "parses the fence out of the payload's `last_assistant_message`". The script runs `grep -oE '^/[a-z0-9-]+( @[^ ]+)?$' | tail -1` over the whole message with no fence context, so any assistant turn whose text contains a line that is exactly `/<skill>` opens a pane. In practice only a handoff fence produces such a line, since a mention inside a sentence or a bullet fails the anchors, which is why this is recorded as information rather than a defect.
- suggestion: reword `SKILL.md:131` to "parses the last standalone `/<skill> @<file>` line out of the payload's `last_assistant_message`", so a later reader does not add fence handling the script does not have.

## Dead Code and Dependency Review

- newly orphaned code: none. Every file the change adds is reachable: `SKILL.md` through the plugin manifest and the `workflows/delivery.md` row, the three reply templates through `ANSWER_INVENTORY` in `scripts/validate.mjs:54-56`, and `stop_hook.sh` through the install instructions in its own header and `SKILL.md:133`. Nothing existing became unreferenced; the `gates: none` auto-submit path round 14 removed was deleted from both the skill body and the answer template, leaving no stranded mention (`grep -n 'gates: none' skills/delivery/herd-next/` returns nothing).
- dependency findings: none. No package was added, upgraded, or removed. The two runtime dependencies, `jq` and `herdr`, are external tools the hook probes with `command -v` and declines on, not declared dependencies.

## Verdict

- decision: approve
- overall code-health change: improves. The change adds one skill in the directory and shape the repository already uses for by-hand skills, registers it in every inventory that exists for that purpose, and ships its one executable artifact with a teardown path, a bounded timeout, and no writes. Round 15's major finding is fixed and the fix is proved by execution rather than accepted from the fix artifact.
- rationale: the pinned scope is 307 inserted lines across 11 files, all reviewed. No critical- or major-severity finding survived. The four advisories are a repository-hygiene item outside the diff, a one-character prose mismatch at an unreachable input, a narrow case where a waited-on agent has exited, and a wording drift; none blocks the merge, and `code_review_clean_answer.md` applies.

## Review Limits

- blocked or unavailable checks: the typed-judgment helper was not run to completion. `TYPESAFE_API_KEY` is unset in this environment, so `judge.mjs axis-coverage` cannot reach the model and every `helper coverage` line reads `unavailable`. The five axes were decided by reading the changed code against the pinned scope and by the commands listed above; judgments were skipped.
- residual manual verification: the Archon gate mode has never been executed. Its field reads were confirmed against a live `archon workflow get` in `04-plan-herdr-plugin.md:30` and its pane target is the same code path the handoff mode exercises, but the end-to-end behavior needs a run parked at a gate, which no run on this machine provides (`10-verification-herdr-plugin.md` rows A2 and A30). The agent-kind read has been observed returning `omp` only; `claude`, `codex`, and `pi` panes need a person in each runtime (row A25). Both limits predate this round and neither is a defect in the diff.
