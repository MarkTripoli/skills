---
type: code-review
date: 2026-09-18
branch: herdr-plugin-delivery-flow
base_sha: ef969cddee3ae80975a5d2665ea501b8a329a95f
base_branch: main
head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd
status: findings
summary: "Reviewed the whole 23-file non-artifact diff against `main` (561 insertions, 30 deletions): the steward loop in `deliver`, the `herd-next` skill and its Stop hook, the TypeSafe key file, and their tests. `npm test` passes 69/69 in this session. The steward's shape is sound and the two guards it adds are load-bearing and pinned by tests. Seven major findings, each a one-line or one-paragraph edit: `herd_next_gate_answer.md` has no variant for the running run that the inside-Herdr flow always produces, so the headline reply states a pause and a notification that did not happen; `epic_delivery_final_answer.md` still tells a person to run the child `archon workflow run` commands in two sentences; acceptance (a) and (b) are decided by nothing in the change or the verification; `archon workflow abandon` is the one steward call left without `--cwd`; `deliver/SKILL.md:79` states a cause the CLI does not produce and contradicts `herd-next/SKILL.md:100`, which states it correctly; the branch's headline behavior change ships with no changeset; and the `Archon gate ask` convention added in this diff is broken by all three replies that carry it. None of them touches the loop's shape."
---

# Code Review

## Scope

- merge base: `ef969cddee3ae80975a5d2665ea501b8a329a95f`, from `git merge-base origin/main HEAD`. Base branch `main`, the base of pull request #19 per `gh pr view --json baseRefName`. The local `main` ref is stale (`3fafa25`, 20 commits behind `origin/main`); `origin/main` is the branch GitHub names, so its merge base is the one pinned here.
- reviewed HEAD: `89ea95e75c8691136557826fa24f64b08ac80ecd`
- commits: 45 after the merge base, 15 carrying code or documentation and 30 `docs(task)` artifact commits
- staged and unstaged changes: none. `git status --short --branch` reports `## herdr-plugin-delivery-flow...origin/herdr-plugin-delivery-flow [ahead 25]` with no tracked modification
- task-owned untracked files: `.agents/tasks/steer-every-archon-gate/20-code-review-steer-every-archon-gate.md`, an artifact left by an interrupted earlier run of this same phase. It was never committed, no fix round followed it, and HEAD has not moved since, so it is not a previous round: it is backed up at `.backups/20-code-review-steer-every-archon-gate.orphan-run.md` and replaced by this file at the same number, so the review loop counts one round rather than two. `.backups/` and `.ignore` are untracked and predate this work.
- excluded changes: `.agents/tasks/**`, 68 artifact files across four task directories

Reviewed: `.changeset/herd-next-skill.md`, `.changeset/typesafe-key-file.md`, `.claude-plugin/plugin.json`, `README.md`, `docs/getting-started.md`, `scripts/validate.mjs`, `shared/CONVENTIONS.md`, `skills/delivery/deliver/SKILL.md` with its four references, `skills/delivery/herd-next/**` (five files), `skills/delivery/start-epic-delivery/references/epic_delivery_final_answer.md`, `skills/delivery/typed-judgment/SKILL.md` and `judge.mjs`, `tests/build-packs.test.mjs`, `tests/judge.test.mjs`, `tests/steward.test.mjs`, `workflows/delivery.md`.

The diff carries three concerns: the `herd-next` skill and its Stop hook (task `herdr-plugin-delivery-flow`, reviewed to clean in its own directory through `17-code-review-herdr-plugin.md`), the steward loop (this task), and the TypeSafe key file (commit `743bc73`). All three are in the pinned scope and all three were read. `herd-next` is re-read here in full because this task added its whole Archon gate mode.

## Previous Round

- previous artifact: none. The `20-code-review-*.md` on disk is an interrupted run of this phase, not a completed round; see Scope.
- `None.`

## Requirements and Standards

- task or ticket: `.agents/tasks/steer-every-archon-gate/task.md`. Six acceptance items, (a) through (f), and one rule for the whole flow: a person never types or pastes an `archon` command.
- implementation source: `13-plan-steer-every-archon-gate.md`, the newest `plan` artifact, with `19-verification-steer-every-archon-gate.md` (`status: passed`) as the verification of record. Its `pass` rows with a command and quoted output are taken as proven and not re-run: C1, C2, T1 to T5, A3 to A14. Its three `untested` rows (A1, A2, A15) are carried into CR-003. Its `## Findings` is `None.`; its `### Review targets` named `deliver/SKILL.md`'s cause sentence and `epic_delivery_final_answer.md`, which this review decides as CR-005 and CR-002.
- repository instructions: `shared/WRITING.md`, `shared/CONVENTIONS.md`, `README.md` (releases add a file under `.changeset/` for any user-visible change), `docs/testing.md`. `scripts/validate.mjs` is the collection's own structural check and runs inside `npm test`.

## Change Profile

- intent and expected behavior: replace every place the delivery flow handed a person an `archon` command with an agent that runs it. `deliver` gains step 6, a steward loop that reads run state, announces each pause from the gated artifact, maps a plain-language answer through `judge.mjs feedback-intent`, and calls `archon workflow respond` itself. `herd-next` gains an Archon gate mode that opens a review pane at the run's `working_path` and submits `/deliver --run <run-id>` into it.
- change description quality: subjects are conventional and scoped; each stands alone. `ca42dc1` and `cd7de29` name the guard and the run they fix, `a41e81a` names the test. `feat(delivery): ask for words at every archon gate` reads as the headline change it is.
- implementation model and review model: not recorded in the implementation artifacts. Review model: Opus 5.
- changed-line size and logical cohesion: 561 insertions, 30 deletions, 23 files. Above the ~300-line coherent band and below the ~1000-line split signal. Three concerns share the branch, but they are separately committed, separately tested, and the first was already reviewed clean in its own task directory. Splitting now would cost more than it buys; no split is required.
- resulting large-file concerns: `skills/delivery/deliver/SKILL.md` grows from 66 to 128 lines and now holds both routing and the steward loop. Still one readable document; the loop is one numbered step with its own fences.
- dependency or lockfile changes: none. `package.json` and `package-lock.json` are untouched.

## Tests Reviewed First

- behavior claimed by tests: `tests/steward.test.mjs` (new, 102 lines) extracts three bash fences out of the two SKILL.md files by a marker only that fence carries, then runs them against a fake `archon` on `PATH`. Five cases: the state read pulls `status`, `working_path`, the node, and every decision id out of a paused run; a failing `get` ends the read instead of leaving a status the loop reads as running; `herd-next`'s gate-mode read carries the same guard; `respond` and every `wait` chunk carry `--cwd`, and the loop breaks after one chunk on a terminal status; a `get` that fails inside the wait loop ends the steward. `tests/judge.test.mjs` adds the key-file precedence chain (`TYPESAFE_API_KEY_FILE` over `$XDG_CONFIG_HOME` over `$HOME`, and a wrong first line rejected by the service). `tests/build-packs.test.mjs` tightens its no-key case by naming a missing key file so this machine's real key cannot satisfy it.
- missing or misleading coverage: the fences are the executable part of a prose skill, and pinning them by extraction is the right instrument; the verification's A9 shows all three assertions fail when the guard or `--cwd` is reverted, so none is decorative. Two gaps. The fake `archon` emits a raw newline inside a JSON string when `FAKE_FAIL` is set, which the real CLI does not do (ADV-002); the assertions ride on the exit status, so they still hold, but the fixture teaches the wrong failure. Nothing covers the branch selection in step 6 itself: no test decides that a `running` status takes the wait branch, or that `paused` with a non-empty `resolved` does. That branch is prose only, and CR-001 is a direct consequence of it.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `10681` in / `73` out

### Correctness

The steward loop's state machine is right where it is stated. A gate is live only on `paused` with an empty `resolved`, which is the correct reading of Archon's metadata: `archon workflow get` leaves `metadata.approval.resolved` absent while a gate waits and fills it after a decision, so an answered-but-not-yet-advanced run correctly falls to the wait branch rather than being re-announced. The `|| { printf '%s\n' "$run" >&2; exit 1; }` guard on both reads is load-bearing: I ran `archon workflow get 00000000-... --json` from `/tmp` and the CLI exits 1 with an `ok: false` body, so the guard fires on the real failure and the loop cannot proceed on unread state. The `--cwd "$cwd"` on `respond`, `wait`, and the in-loop `get` is confirmed by the verification's A8 against a live paused run from outside the run's worktree. `abandon` is the one call that did not get it (CR-004). I checked `archon workflow abandon --help`: `--cwd <path>` is a global option, so the flag is available there.

The feedback-intent fallback is sound, against the earlier run's claim. I ran `a=''; jq -r '.intent // "revise"' <<<"${a:-{\}}"` under `/bin/bash`: the parameter expansion yields `{}` and jq prints `revise`, and `suggested` defaults to `unclear`, which routes to the clarifying question and sends no decision. A helper that dies therefore cannot resolve a gate, which is the safe direction.

`judge.mjs`'s `apiKey()` reads correctly and its precedence matches both the SKILL.md prose and the tests. Attach by run id is not scoped to the run's project: I ran `archon workflow get <live-run-id> --json` from a throwaway git repo with no `--cwd` and it returned the full run, so step 1's re-entry path works from any checkout, as claimed.

What is not right: `herd_next_gate_answer.md` has exactly one shape and the inside-Herdr flow always reaches it on a `running` run, so the reply asserts a pause and a notification that did not happen (CR-001). `deliver/SKILL.md:79` names a cause the CLI does not produce (CR-005). Acceptance (a) and (b) are decided by nothing (CR-003).

- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

The steward reads as one loop with one exit, and every variable in the read fence is derived rather than guessed, which is the property the skill states and the test pins. `herd-next`'s gate mode reuses steps 4 through 6 by naming one substitution (`$cwd` for `$PWD`) instead of restating them, and it says so explicitly; the same discipline appears where it declines to restate the `agent_not_ready` handling. `stop_hook.sh` is the densest file in the diff and carries its reasoning inline: the `done`/`cleanup` trap pair, the `2>&1` on `agent start` with the branch reading the error code rather than the exit status, and the two `shellcheck disable` lines each with a reason. All of it is legible.

One gap: `deliver` step 6's notification fence at `:86` interpolates `$slug`, which the step never defines, while `herd-next` defines the same variable explicitly at `:104` (ADV-001). Every other variable in that step is traceable to the `get` read.

- helper coverage: covered, level 3, confidence 0.98

### Architecture

Ownership lands in the right place. The steward is one loop in `deliver`, and `herd-next`'s gate mode delegates to it by submitting `/deliver --run <run-id>` rather than reimplementing the wait: the gate mode reads the run once and never holds the pane, which keeps one owner for the run's lifecycle and makes `/deliver --run` the single re-entry point. `--run` on `deliver` doubles as the pane's entry and the person's recovery path, so one mechanism serves both. The guard is duplicated in two SKILL.md files rather than factored, which is correct here: these are prose documents an agent reads in isolation, not modules, and the test asserts the two copies agree.

The new `Archon gate ask` section in `shared/CONVENTIONS.md` is the right home for the rule, but nothing in `validate.mjs` enforces it and all three replies that carry the sentence break it (CR-007). The collection enforces its Handoff convention mechanically; this one is prose-only, which is what let it drift inside a single commit.

- helper coverage: covered, level 3, confidence 0.98

### Security

The key-file read is the one new credential path. `apiKey()` prefers the environment, then `TYPESAFE_API_KEY_FILE`, then `$XDG_CONFIG_HOME` or `$HOME`, takes the first line, and returns `""` on any read error, so a missing or unreadable file degrades to the documented unavailable path rather than throwing. The key is still used only as a bearer token to `TYPESAFE_BASE_URL`, unchanged. The SKILL.md tells the reader to write the file under `umask 077`; the helper does not check the mode on read, which is acceptable for a file the user owns. One edge: with both `HOME` and `XDG_CONFIG_HOME` empty, `path.join("", ".config")` yields the relative `.config/typesafe/api_key`, so the helper would read a key out of the current working directory (ADV-003).

`stop_hook.sh` takes its input from the session's own last assistant message, which is not a trust boundary in the usual sense, but the handling is still tight: the command is matched against an anchored `^/[a-z0-9-]+( @[^ ]+)?$`, every interpolation into a `herdr` call is quoted, and the command is staged with `send-text` and never submitted, so nothing it parses can execute on its own. The `@[^ ]+` half admits `../`, so a crafted artifact path can walk out of the repository to a `task.md` whose `slug` the hook then uses; the slug is sanitized to `[a-z0-9-]` before it reaches the agent name, reaches `pane rename` and `tab create --label` only as a quoted label, and the hook writes no file, so the reachable effect is a mislabelled pane. Not a finding.

No secrets, tokens, or repository content are added to any outbound payload by this change.

- helper coverage: covered, level 3, confidence 0.99

### Performance

Nothing in the change sits on a hot path. The steward's cost is one `get` per iteration plus a bounded `wait --timeout 600`, which replaces a single foreground call held for the length of a phase; that is strictly less shell occupancy, and the loop re-issues rather than spinning, since `wait` blocks server-side. `archon workflow status --json` is called once after dispatch, not polled. `stop_hook.sh`'s documented worst case is 90 seconds (30s in `agent start`'s readiness wait plus 30s in the `agent wait` fallback plus round trips), and the install comment ties the hook's timeout to those two numbers. `apiKey()` reads one small file once per process. `npm test` runs in 28.1s, unchanged in character from before.

- helper coverage: covered, level 3, confidence 0.99

## Verification Story

- command or inspection: `npm test` in this session; `git diff ef969cd...HEAD -- . ':(exclude).agents/tasks'` read in full (877 lines raw); `archon workflow get 00000000-0000-0000-0000-000000000000 --json` from `/tmp`; `archon workflow get <live-run-id> --json` from a throwaway git repo with no `--cwd`; `archon workflow abandon --help`; `a=''; printf '[%s]' "${a:-{\}}"` and `jq -r '.intent // "revise"' <<<"${a:-{\}}"` under `/bin/bash`; `grep -rn 'archon workflow' skills/` and `grep -rn 'say what should change' skills/ shared/ workflows/`, every hit read; `sed -n '375,412p' scripts/validate.mjs` for what `TERMINAL_ANSWER` actually enforces.
- result: `npm test` exits 0, `tests 69 / suites 3 / pass 69 / fail 0 / skipped 0 / todo 0`, duration 28116ms, with all five steward cases in the pass list. `archon workflow get` from `/tmp` exits 1 and prints a well-formed JSON body whose newlines are escaped, so `jq -r '.status'` parses it and prints `null`, not an empty string. The same call from a foreign git repo returns the full run, exit 0. `abandon` accepts the global `--cwd <path>`. The `${a:-{\}}` expansion yields `{}` and jq returns the documented defaults. `grep` finds 14 `archon workflow` lines across five skill files, every one a command a skill runs itself. `validate.mjs` checks only that a `TERMINAL_ANSWER` carries no handoff fence; it does not check the gate-ask sentence.
- manual, screenshot, or before-and-after evidence: none in this change, and none required by its interfaces. The Herdr pane behavior that acceptance (a) and (b) describe has no recorded evidence anywhere in the task directory, which is CR-003.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 The gate reply has no variant for the running run the inside-Herdr flow always produces

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/herd-next/references/herd_next_gate_answer.md:1`
- failure mode: `deliver/SKILL.md:53` runs `herd-next`'s gate mode "at once, without waiting for a pause", so on the primary inside-Herdr path the run is `running` and no gate is live. `herd-next/SKILL.md:102` handles that: it opens the pane, sets `$phase` to `run`, and skips the notification. But the only reply it can print opens `Run <run-id> (<workflow name>) paused at <nodeId>. A notification was raised and a review pane is open.` and the template offers no `<...>` slot for the alternative, unlike every other optional clause in the collection's templates. The person is told a gate is waiting when none is, told a notification fired when `[ -n "$node" ]` suppressed it, and given an empty `<nodeId>`. This is what acceptance (a) produces on every first `/deliver` inside Herdr, so it is the common case, not the edge.
- evidence or reproduction: `herd-next/SKILL.md:102` ("`running`, or `paused` with a non-empty `resolved`, still opens the pane: `$phase` is `run`, the notification is skipped because there is no gate to name"); `herd-next/SKILL.md:109` (`[ -n "$node" ] && herdr notification show ...`); `herd-next/SKILL.md:115` names `references/herd_next_gate_answer.md` as the reply for both branches; `deliver/SKILL.md:53`. No test covers the branch, and the verification recorded A1 as `untested`, so nothing caught it.
- fix direction: give the template's first line the same `<...>` shape the rest of the collection uses, covering both states in one slot: paused at `<nodeId>` with the notification sentence, or `is running; no gate is waiting yet` with the notification sentence omitted. The pane-pointer paragraph and the closing paragraph already read correctly on both branches.

### CR-002 The epic answer still tells a person to run the child start commands

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/start-epic-delivery/references/epic_delivery_final_answer.md:9`
- failure mode: `task.md`'s rule is that a person never types or pastes an `archon` command, and that every answer template naming one is revised so the person is told what to say instead. `{child_start_command}` is filled with `archon workflow run delivery-<workflow> --base <epic branch> ...` (`start-epic-delivery/SKILL.md:34`). Line 14 was rewritten to say the commands are "not ... something for you to type", but line 9 still introduces them as "their start commands (run each from the project root ...)" and line 12 still says "run the commands above only with `children=manual` or when starting a child by hand". The template now instructs the person twice and un-instructs them once, so the shipped reply contradicts itself and the task's rule on the one path it governs.
- evidence or reproduction: the three lines above, read in the file. Acceptance (d)'s literal grep cannot see it because the template holds the `{child_start_command}` placeholder rather than the string `archon workflow`; the verification named this under `### Review targets` as "the one place left where the task's whole-flow rule and the shipped text disagree" and recorded no failing item for it.
- fix direction: rewrite lines 9 and 12 in the same voice as line 14. Line 9 introduces the commands as the record of what the wave block runs; line 12 says that with `children: manual`, or to start one child by hand, the person asks their agent, after `git push -u origin <epic branch>`. Then fold line 14 into line 12 so the template says it once.

### CR-003 Acceptance (a) and (b) are decided by nothing in the change or the verification

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `.agents/tasks/steer-every-archon-gate/19-verification-steer-every-archon-gate.md:A1`
- failure mode: acceptance (a) is that `/deliver` inside Herdr leaves the person with a review pane whose agent announces the first pause and asks for a decision; (b) is the same outside Herdr, in the starting session. The verification records both as `untested`, and A15 records plan 13's checklist steps 3 and 4 as not executed with no observed output in receipt 18. The CLI half is proven (A3, A4, A6, A8) and the template half is proven to exist (A10, A14), but nothing decides that the pane opens at the run's `working_path`, that its agent announces unprompted, or that the outside-Herdr session reaches the ask. CR-001 is exactly the kind of defect that check would have caught, and it survived to review because the check was never run.
- evidence or reproduction: A1, A2, and A15 in the verification's items table, all `untested`; its `### Verify` list already carries the checkbox and notes that `HERDR_ENV` is `1` on this machine, so both halves can be run here; receipt `18-implementation-steer-every-archon-gate.md` holds the checklist as not executed.
- fix direction: run plan 13's checklist steps 1 to 4 in this Herdr workspace, against a scratch `delivery-start` run of the kind the verification already used for A3 and A4, and record the pane id, the pane label, and the pane agent's first message verbatim in receipt 18 (edited in place per the Iteration convention) and as items in the verification. Opening a pane and starting an agent in the person's live workspace is an outward-facing action, so confirm before running it; if the person declines, record the refusal and the residual risk in the verification's `### Known limits` rather than leaving the items silent.

### CR-004 `abandon` is the one steward call left without `--cwd`

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `skills/delivery/deliver/SKILL.md:99`
- failure mode: plan 13's Desired End State is that every call after the first read names the run's own directory, and `respond`, `wait`, and the in-loop `get` all carry `--cwd "$cwd"`. The stop path does not: `archon workflow abandon "$run_id"` runs against whatever directory the steward sits in. The steward is documented to be re-enterable from anywhere (`/deliver --run <run-id>` at step 1), and `deliver/SKILL.md:115` states the rule this call breaks. When the call fails, the very next instruction is to "print the ended reply", so the person is told the run was abandoned while it is still alive, holding its worktree against the next `archon workflow run --branch` on that branch.
- evidence or reproduction: `grep -F '--cwd "$cwd"' skills/delivery/deliver/SKILL.md` returns `:106` (respond), `:108` (wait), `:109` (get), and `:115` (the prose rule); `:99` is not among them. `archon workflow abandon --help` lists `--cwd <path>` as a global option, and the verification's A7 shows the same class of call failing with exit 1 outside a git work tree.
- fix direction: write the call as `archon workflow abandon "$run_id" --cwd "$cwd"`, and state in the same sentence that a nonzero exit prints Archon's output as cause and fix instead of the ended reply, matching the guard the two reads already use.

### CR-005 The stated cause of the read guard is not what the CLI does, and contradicts `herd-next`

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `skills/delivery/deliver/SKILL.md:79`
- failure mode: the sentence reads "Outside a git work tree the body is an `ok: false` error whose raw newlines `jq` cannot parse, so an unguarded read leaves `$status` empty and the loop waits on a run it cannot see." Both halves are false. The CLI escapes the newlines, `jq` parses the body without error, and `.status` is absent, so `jq -r '.status'` prints the literal string `null`. `herd-next/SKILL.md:100` describes the same failure correctly ("Without the guard `$cwd` is the literal string `null` and the pane opens there"), so the two skills now give a reader opposite accounts of one mechanism. In a collection whose product is prose an agent executes, a maintainer who checks the claim finds `jq` parsing fine and can reasonably conclude the guard is redundant; it is not, because it keys on the exit status, which is 1 either way.
- evidence or reproduction: from `/tmp`, `run=$(archon workflow get 00000000-0000-0000-0000-000000000000 --json 2>&1)` exits 1 and prints `{ "ok": false, "error": "Error: Not in a git repository.\nThe Archon CLI must be run from within a git repository...` with the newlines escaped; `jq -r '.status' <<<"$run"` prints `null` and exits 0. The verification named this under `### Review targets` and left the decision to this phase.
- fix direction: replace the sentence with what the CLI does: the body is a well-formed `ok: false` error with no `status` key, so an unguarded read leaves `$status` as the literal `null`, the loop takes the running-run branch, and it waits forever on a run it cannot read. The guard fires on the nonzero exit, not on a parse error. The same sentence is restated in `13-plan` and in receipts `14` and `16`; correct them in place per the Iteration convention, and fix the fake `archon` in `tests/steward.test.mjs` at the same time (ADV-002), so the fixture and the prose agree.

### CR-006 The branch's headline behavior change ships with no changeset

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `.changeset/herd-next-skill.md:5`
- failure mode: `README.md:89` states the rule: a user-visible change adds a file under `.changeset/`. Two changesets are in scope, for the `herd-next` skill and for the TypeSafe key file. Neither covers the change this task exists for: `deliver` no longer prints `archon workflow approve|reject|wait` for a person to run, it stewards the run, takes the decision in words, and gained `/deliver --run <run-id>`. That is the most visible behavior change on the branch and it would ship with no release note. The `herd-next` changeset compounds it: it describes only the handoff mode ("opens the next delivery phase in its own pane with the handoff command staged"), written before this task added the Archon gate mode, so the one note that does exist now understates the skill it names.
- evidence or reproduction: `.changeset/` holds only `herd-next-skill.md` and `typesafe-key-file.md` in the pinned scope (`.changeset/describe-pr-title-rule.md` and `review-loop-judgment.md` predate the merge base). No changeset names `deliver`, the steward, or `--run`. `npm test` does not check changeset coverage, so nothing failed.
- fix direction: add `.changeset/deliver-steward.md` as a `minor` bump describing the behavior a user sees: every Archon gate is now answered in plain language in the session or pane that announces it, `deliver` runs `archon workflow respond` itself, and `/deliver --run <run-id>` attaches to a run whose steward was lost. Extend `.changeset/herd-next-skill.md` with one clause for the Archon gate mode, since its current text now describes half the skill.

### CR-007 The `Archon gate ask` convention is broken by all three replies that carry it

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `shared/CONVENTIONS.md:94`
- failure mode: the convention added in this diff says a reply that announces a paused Archon gate "ends with this sentence, byte-exact". None of the three replies that carry the sentence does. `herd_next_gate_answer.md:5` puts it mid-paragraph with two more sentences after it, unconditionally. `deliver_gate_answer.md:13` and `deliver_archon_answer.md:14` both append an optional judgments-skipped sentence after the ask, so they end with it only when that clause is omitted. `validate.mjs` checks a `TERMINAL_ANSWER` only for the absence of a handoff fence, so nothing catches the drift, and the collection now ships a normative rule that its own first three consumers break. An agent reading `CONVENTIONS.md` and the template together gets contradictory instructions about what its reply must end with.
- evidence or reproduction: `grep -rn 'say what should change' skills/ shared/ workflows/` returns exactly those four lines; `sed -n '375,412p' scripts/validate.mjs` shows `TERMINAL_ANSWER` routing to `checkHandoff(raw, null, ..., { terminal: true })` and nothing else.
- fix direction: pick one and make all four agree. The cheaper direction is to loosen the convention to what the templates actually do, "carries this sentence, byte-exact, as its ask", and keep the byte-exactness that makes the ask recognizable; the stricter direction is to move the two trailing sentences in `herd_next_gate_answer.md` above the ask and put the judgments-skipped clause before it in the other two. Either way, add the check to `validate.mjs` beside the handoff check so the next template cannot drift, keyed on the answer files the inventory already lists.

## Advisories

### ADV-001 `$slug` is interpolated in the steward's notification but never defined

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `skills/delivery/deliver/SKILL.md:86`
- evidence: the fence reads `herdr notification show "Gate: $slug/$phase" --body "$msg" --sound request`. Step 6 derives `status`, `cwd`, `node`, `msg`, `decisions`, `resolved`, and states that `$phase` is `$node` with a trailing `__cycle` stripped, but `$slug` appears nowhere else in the skill. `herd-next/SKILL.md:104` defines the same variable explicitly, as the basename of the task directory `$msg` names resolved against `$cwd`. Unset, the notification title reads `Gate: /design`. The effect is cosmetic, and inside Herdr this notification is raised by the pane's own `deliver`, so it is the one the person actually sees.
- suggestion: add the one clause `herd-next` already has, deriving `$slug` from the task directory `$msg` names, in the sentence that introduces the fence.

### ADV-002 The fake `archon` fails in a way the real CLI does not

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `tests/steward.test.mjs:32`
- evidence: under `FAKE_FAIL` the stub prints `{ "ok": false, "error": "Error: Not in a git repository.\nThe Archon CLI must..." }` through `printf`, so the `\n` becomes a raw newline inside a JSON string and the body is not parseable. The real CLI escapes it; I read the actual body from `/tmp`. The two failing-read tests assert on the exit status, which the stub also gets right, so they still prove the guard, but the fixture encodes the same wrong model as CR-005 and would mislead the next person who extends it.
- suggestion: escape the newline in the fixture so it matches the CLI (`\\\\n` in the template literal), and keep the assertions as they are.

### ADV-003 With no `HOME` and no `XDG_CONFIG_HOME`, the key is read from a repo-relative path

- type: Potential issue
- severity: minor
- category: Security and privacy
- location: `skills/delivery/typed-judgment/judge.mjs:85`
- evidence: `path.join(env.XDG_CONFIG_HOME || path.join(env.HOME || "", ".config"), "typesafe", "api_key")` yields the relative `.config/typesafe/api_key` when both are empty, so the helper reads a credential out of the current working directory. The change's own motivation is environments that do not inherit an interactive shell's exports, which is exactly where `HOME` is most likely to be missing. The reachable harm is small (a planted file supplies a wrong bearer token, the service rejects it, and the caller falls back), but reading a secret from a path a repository can control is worth closing.
- suggestion: return `""` when neither `HOME` nor `XDG_CONFIG_HOME` is set, so a missing home degrades to the documented unavailable path rather than to a relative read.

### ADV-004 `apiKey`'s `env` parameter has no caller

- type: Refactor suggestion
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/typed-judgment/judge.mjs:83`
- evidence: `export function apiKey(env = process.env)` is called once, at `:94`, with no argument; the tests spawn the CLI rather than importing it, so nothing passes an env. The parameter is an extension point with one implementation.
- suggestion: drop the parameter and read `process.env` directly, or add the unit test that would justify it.

### ADV-005 The Stop hook's tab teardown reads a field shape nothing pins

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `skills/delivery/herd-next/references/stop_hook.sh:112`
- evidence: `created_tab=$(jq -r '.result.tab.tab_id // empty' <<<"$created")` guesses a sibling of `.result.root_pane.pane_id`, which the skill's own step 5 fence reads from the same response. `herdr tab list` returns `.result.tabs[].tab_id`, so the field name is plausible, but no test or check exercises `tab create`'s response and the verification's A14 confirmed only that the subcommands exist. If the path is wrong, `created_tab` stays empty, the `elif` branch closes the pane instead, and a failure after tab creation leaves an empty tab behind, which is the outcome the trap exists to prevent.
- suggestion: confirm the field against one real `herdr tab create --no-focus` response and record it in the receipt, or fall back to `created_pane` when the tab id does not parse so the cleanup still closes something.

## Dead Code and Dependency Review

- newly orphaned code: none. The removed lines in `deliver/SKILL.md` (the foreground-wait paragraph and the approve/reject/wait line in `deliver_archon_answer.md`) are replaced in place by the steward loop and the ask. `deliver_hand_answer.md` and the without-Archon path are untouched and still reachable from step 5. Every new answer template is registered in `ANSWER_INVENTORY` and named by its skill's `## References`, and `validate.mjs` fails on either half being missing, so none of the five new files is unreferenced.
- dependency findings: none. No dependency added, removed, or upgraded; `package.json` and the lockfile are outside the diff.

## Verdict

- decision: request_changes
- overall code-health change: an improvement. The steward replaces a foreground call held for the length of a phase with a bounded loop, moves three commands off the person and onto the agent, and adds the first tests in this collection that execute a SKILL.md's own bash fences, which raises the floor for every prose skill after it. The two guards it adds are real and pinned. What it does not yet have is a reply that tells the truth on its own primary path, a check that the primary path works at all, and the release note for the change it exists to make.
- rationale: seven major findings, none structural. CR-001 and CR-002 are wrong text on paths the change owns; CR-004 is one missing flag on the stop path; CR-005, CR-006, and CR-007 are the change's own record disagreeing with itself. CR-003 is the one that matters most: the acceptance items that describe the headline behavior have no evidence anywhere in the task directory, and CR-001 is the proof that the missing check would have paid for itself. Every fix is a single line or a single paragraph, and none of them touches the loop's shape.

## Review Limits

- blocked or unavailable checks: the Herdr pane behavior that acceptance (a) and (b) describe was not exercised here. Opening a review pane and starting an agent in the person's live workspace is an outward-facing action this review was not asked to take, which is the same reason the verification recorded A1, A2, and A15 as `untested`; it is raised as CR-003 rather than performed. `herdr tab create`'s JSON response shape (ADV-005) was not confirmed for the same reason: reading it means creating a tab in the live workspace. `herdr tab list` was read and shows `tab_id` on a listed tab.
- residual manual verification: CR-003's checklist, in a live Herdr workspace, with the pane id, pane label, and the pane agent's first message recorded verbatim. `evals/` was not run; it needs a live model and this change touches no eval-graded chain.
