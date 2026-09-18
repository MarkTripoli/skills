---
type: code-review
date: 2026-09-18
branch: herdr-plugin-delivery-flow
base_branch: main
base_sha: ef969cddee3ae80975a5d2665ea501b8a329a95f
head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd
status: findings
summary: "Reviewed the whole diff against the merge base with origin/main, 24 product files plus the uncommitted round-23 fixes. The three majors the last round fixed are all genuinely fixed and reproduced. Two new majors remain: the steward's `respond` is the one Archon call with no exit guard, so a failed decision is dropped and the same gate is re-announced ten minutes later with no error; and `herd-next` submits a `/`-prefixed `/deliver --run` into a pane whose kind may be `codex`, which this collection documents as taking `$`, so the steward never attaches while the reply claims it did. The fix round must guard `respond` and make the submitted and staged commands carry the prefix the target kind uses."
---

# Code Review

## Scope

- merge base: `ef969cd` (`git merge-base origin/main HEAD`; `origin/main` is `a50132a`, and the worktree's local `main` ref at `3fafa25` is 25 commits stale, so it is not the target)
- reviewed HEAD: `89ea95e` plus the uncommitted working tree
- commits: 46 after the merge base
- staged and unstaged changes: 16 modified tracked files, of which 12 are product files (`.gitignore`, `.changeset/herd-next-skill.md`, `scripts/validate.mjs`, `shared/CONVENTIONS.md`, `skills/delivery/deliver/SKILL.md`, `skills/delivery/deliver/references/deliver_archon_answer.md`, `skills/delivery/herd-next/SKILL.md`, `skills/delivery/herd-next/references/herd_next_gate_answer.md`, `skills/delivery/herd-next/references/stop_hook.sh`, `skills/delivery/start-epic-delivery/references/epic_delivery_final_answer.md`, `skills/delivery/typed-judgment/judge.mjs`, `tests/steward.test.mjs`); these are round 23's fixes, not yet committed
- task-owned untracked files: `.changeset/deliver-steward.md` (reviewed), `.ignore` (reviewed), and artifacts `20`, `21`, `22`, `23` under the task directory
- excluded changes: everything under `.agents/tasks/`, which is artifact, not review subject

Product scope is 24 files, +596/-33. `.agents/tasks/` adds 5320 lines of artifact on top of that.

## Previous Round

- previous artifact: `.agents/tasks/steer-every-archon-gate/22-code-review-steer-every-archon-gate.md`
- CR-101 The wait loop is unbounded inside one shell call: fixed
- CR-102 `status` is a read-only parameter in zsh: fixed
- CR-103 `deliver` announces a review pane that `herd-next` may never have opened: fixed
- CR-104 Acceptance (a) and (b) are still decided by nothing: declined

CR-101: `deliver/SKILL.md:106-111` is now `respond`, `wait`, `get`, `run_status`, once each, with no `while` and no `break`; `:113` moves the repetition into fresh shell calls. CR-102: `run_status` is the variable at `deliver/SKILL.md:71`, `:110` and `herd-next/SKILL.md:92`; `tests/steward.test.mjs:52` reads it. CR-103: `deliver/SKILL.md:54` falls through to step 6 on a `No pane was opened` reply, and `deliver_archon_answer.md:11` now selects on whether a pane was opened rather than on `HERDR_ENV`. CR-104 is recorded as declined and is not re-raised: the fix round's reason (the proof needs an outward-facing action in a live Herdr workspace, which an automated phase has no turn to confirm) is a standing constraint no fix round can clear, so raising it a third time would make the loop non-terminating. Its residual risk is carried in `## Review Limits` and `ADV-206`.

## Requirements and Standards

- task or ticket: `.agents/tasks/steer-every-archon-gate/task.md`, six acceptance items (a) to (f)
- implementation source: `13-plan-steer-every-archon-gate.md` (newest `plan`); `19-verification-steer-every-archon-gate.md` (newest `verification`, `status: passed`, 15 items, 13 `pass` and 2 `untested`)
- repository instructions: `shared/CONVENTIONS.md` (Archon gate ask, Handoff, Typed judgments, Answer template placeholders), `shared/WRITING.md`, `workflows/delivery.md`, `docs/cheatsheet.md:98`

Acceptance decided against the diff: (c) proven by verification A3, A4, A6 against live paused runs `6bd7f01d` and `6d86fa7a`, so not re-run here. (d) re-run here: `grep -rn 'archon workflow' skills/delivery/*/references skills/delivery/*/SKILL.md` returns 14 lines in 5 files, every one either a command a skill runs itself, past-tense provenance (`deliver_archon_answer.md:7` under `Started from the project root:`), or a `{child_start_command}` placeholder the reply now calls "the record of what runs, not something for you to type". (e) re-run here: `npm test` is 70/70. (f) proven by verification A11. (a) and (b) are proven by nothing in the change, the tests, or the verification; see `## Previous Round` and `ADV-206`.

## Change Profile

- intent and expected behavior: a person never types an `archon` command. `deliver` starts the run and then stewards it (announce, take words, `respond`, wait); `herd-next` gate mode opens the review pane and attaches that steward; every answer template that named a command for a person is rewritten.
- change description quality: `.changeset/deliver-steward.md`, `.changeset/herd-next-skill.md`, and `.changeset/typesafe-key-file.md` each state the behavior and the motivation. The pull request body on #19 still describes only the `herd-next` half and does not mention the steward, `/deliver --run`, or the three rewritten answer templates; `describe-pr` is the phase that owns that.
- implementation model and review model: not recorded in the implementation artifacts; this review ran on `claude-opus-5`.
- changed-line size and logical cohesion: 596 added, 33 removed across 24 product files. Coherent: one behavior (the steward) plus its registration. No split required.
- resulting large-file concerns: `deliver/SKILL.md` step 6 is now 49 lines with four fences, the longest step in the skill. Still one subject.
- dependency or lockfile changes: none. No `package.json` or lockfile edit in scope.

## Tests Reviewed First

- behavior claimed by tests: `tests/steward.test.mjs` extracts the three bash fences from the two skills by marker and runs them against a fake `archon`. It proves the state read parses `status`, `working_path`, `nodeId`, and every decision id; that a nonzero `get` ends the read in both skills rather than leaving `null`; that both reads survive a `running` run with no approval metadata; that `respond` and `wait` both carry `--cwd`; and that a `paused` status breaks after exactly one `wait` chunk. Verification A9 showed each of those assertions fails when its guard is reverted. `tests/judge.test.mjs` covers the key-file precedence (`TYPESAFE_API_KEY_FILE` over `XDG_CONFIG_HOME` over `HOME`) and that a wrong key still exits 3; `tests/build-packs.test.mjs:109` pins the unkeyed case to a missing key file so this machine's real key cannot satisfy it.
- missing or misleading coverage: `tests/steward.test.mjs` exercises `FAKE_FAIL` on `get` only. No test drives a failing `respond`, which is the gap CR-201 sits in; adding one is a three-line change to `FAKE_ARCHON`. Nothing tests either skill's non-bash prose, which is where CR-202 lives; the collection has no mechanism for that and `validate.mjs` covers registration only.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `8061` in / `73` out

### Correctness

- assessment and evidence: the three fences are correct under both bash and zsh and each guard is load-bearing, re-proved by the 70/70 suite and by verification A9's reverts. Two correctness defects remain, both outside the fences the tests reach. `deliver/SKILL.md:107` runs `archon workflow respond` with no exit check while `:70`, `:109`, and `:100`'s `abandon` all guard theirs; I reproduced the consequence with the suite's own fake-`archon` shape made to fail `respond`: the fence exits 0 with `run_status=paused` and `resolved` empty, which `:81` reads as a live gate, so step 6 re-announces the identical gate and the person's decision is gone (CR-201). `herd-next/SKILL.md:112` submits `/deliver --run $run_id` into a pane started with `--kind "$kind"` where `$kind` may be `codex`, which `shared/CONVENTIONS.md:106` and `docs/cheatsheet.md:98` both say takes `$`, so the steward never starts while `herd_next_gate_answer.md:5` asserts it did (CR-202). `deliver/SKILL.md:51` treats a run absent from `archon workflow status --json` as a start failure with no poll bound (ADV-202).
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: step 6 reads in the order it runs and each fence is preceded by the sentence that names its variables; ADV-103's `$judge` and `$reply` clause at `:91` closed the last unnamed pair except `$text` (ADV-203). `deliver/SKILL.md:79` and `:113` carry three clauses of rationale each (the zsh `status` alias, the `null` status, why `--detach` is accepted) that earn their length because each records a failure already hit. `deliver_ended_answer.md:1` offers a fourth variant, `has no gate waiting`, that no step in `deliver` ever selects (ADV-201). No dead code, no unnecessary abstraction.
- helper coverage: covered, level 3, confidence 0.99

### Architecture

- assessment and evidence: ownership is right. `herd-next` opens the pane and reads the run once; `deliver` owns every wait and every decision; the pane-opening geometry is stated once in steps 4 to 6 and referenced by the gate mode at `herd-next/SKILL.md:106` rather than restated. The state read is duplicated between the two skills, which `tests/steward.test.mjs:405` pins by extracting both and asserting identical output, so the duplication is guarded. `stop_hook.sh` restates steps 3 to 7 in bash because a hook cannot call a model; the skill names that as a standing cost at `:125`. `validate.mjs:111` holds a second copy of the gate-ask sentence that `shared/CONVENTIONS.md:96` also holds (ADV-204). No new dependency, no new layer.
- helper coverage: covered, level 3, confidence 1.00

### Security

- assessment and evidence: `stop_hook.sh` is the only shipped executable. It constrains model-produced text with `grep -oE '^/[a-z0-9-]+( @[^ ]+)?$'` at `:43`, passes it as one quoted argv element at `:146`, and uses no `eval` and no `sh -c`; `shellcheck` exits 0. The agent name is sanitized through `tr -c 'a-z0-9-' '-'` at `:130` and gated on `[a-z]*` at `:132`. `judge.mjs:84` reads the key file only when `HOME` or `XDG_CONFIG_HOME` is set, which is the right call: without it a relative `.config/typesafe/api_key` planted in a repository would be read; `tests/judge.test.mjs:29` and `tests/build-packs.test.mjs:109` both pin an explicit missing key file so a real key cannot satisfy a no-key assertion. The key is never logged and never leaves the helper. The `*/*` artifact branch at `stop_hook.sh:69` does not constrain the path under `$root/.agents/tasks/`, but the worst outcome is reading a `task.md` outside the tree for a pane label, and every use of that value is quoted. Nothing else in scope touches an untrusted input, a secret, or an authorization boundary.
- helper coverage: covered, level 3, confidence 0.99

### Performance

- assessment and evidence: the hot path is the steward loop, and it is bounded by construction after CR-101: one `respond`, one `wait --timeout 600`, one `get` per shell call, with the repetition moved into fresh calls (`deliver/SKILL.md:113`). No unbounded loop, no polling tighter than the `wait` deadline, no allocation concern. The one growth term is documented, not new: `herd-next/SKILL.md:127` states that a full chain splits one pane per phase into the same tab with no bound and nothing closes the finished ones. 600 seconds sits exactly at the common agent shell ceiling, so a runtime with a lower default kills the chunk; the consequence is one retried call, not a lost wait.
- helper coverage: covered, level 3, confidence 0.98

## Verification Story

- command or inspection: `npm test`
- result: exit 0, `tests 70 / suites 3 / pass 70 / fail 0 / skipped 0 / todo 0`, duration 28357ms. All six steward cases pass.
- command or inspection: `node scripts/validate.mjs`
- result: exit 0, `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command or inspection: `node scripts/check-commits.mjs ef969cd..HEAD`
- result: exit 0, `ok: 45 subjects`.
- command or inspection: `shellcheck skills/delivery/herd-next/references/stop_hook.sh`
- result: exit 0, no output.
- command or inspection: acceptance (d), `grep -rn 'archon workflow' skills/delivery/*/references skills/delivery/*/SKILL.md`
- result: 14 lines in 5 files, each read. None addresses a person.
- command or inspection: CR-201 reproduction. The `deliver/SKILL.md:106-111` fence run verbatim under `/bin/bash` against the suite's fake `archon` made to exit 1 on `respond` with `{"ok":false,"error":"Error: run r1 is not awaiting a decision"}`, `get` answering the suite's `PAUSED` fixture.
- result: `FENCE EXIT PATH: run_status=[paused] resolved=[]`, fence exit 0. The failure is on stderr and nowhere in the loop's state, so `:81` reads a live gate and step 6 re-announces it.
- manual, screenshot, or before-and-after evidence: none in this session. The pane behavior of acceptance (a) and (b) is outward-facing and was not exercised; see `## Review Limits`.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-201 The steward's `respond` is the one Archon call with no exit guard, so a dropped decision re-asks the same gate

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/deliver/SKILL.md:107`
- failure mode: `archon workflow respond "$run_id" "$decision" "$text" --detach --cwd "$cwd"` runs with no `||` guard, in a fence with no `set -e`. When it exits nonzero (a stale decision, a run that moved on, a transient CLI failure), execution falls through to the `wait`, which blocks for up to its full `--timeout 600`, then to the `get`, which returns the same `paused` state with `resolved` still empty. `:81` defines exactly that as a live gate, so step 6 loops back, re-reads, and prints `deliver_gate_answer.md` for the identical gate. The person waits ten minutes, is asked the same question again, and is told nothing about why their answer did not take. Every other Archon call in the steward guards its exit: `:70` and `:109` end the steward on a failed `get`, and `:100` ends it on a failed `abandon`. `respond` is the only state-mutating call of the four and the only unguarded one.
- evidence or reproduction: the fence extracted verbatim and run under `/bin/bash` against the fake `archon` from `tests/steward.test.mjs:418`, altered to exit 1 on `respond` and print `{"ok":false,"error":"Error: run r1 is not awaiting a decision"}` on stderr, with `get` answering the suite's own `PAUSED` fixture. Output: `FENCE EXIT PATH: run_status=[paused] resolved=[]`, fence exit code 0. Nothing in `$run_status`, `$resolved`, or the fence's exit status records the failure. `tests/steward.test.mjs` never drives a failing `respond`: `FAKE_FAIL` is only ever asserted against `get` (`:461`, `:470`, `:494`).
- fix direction: give `respond` the same guard its three siblings have, `archon workflow respond ... || { printf '%s\n' "$out" >&2; exit 1; }` with the output captured, and one sentence after the fence saying a nonzero `respond` ends the steward with Archon's output as cause and fix, the rule `:79` already states for the reads. Add the matching case to `tests/steward.test.mjs` by keying the fake `archon`'s failure on `$2` so `respond` can fail while `get` succeeds, and assert the fence exits nonzero without reaching the `wait`.

### CR-202 The attach command is submitted with a `/` prefix into a pane that may be running Codex, which this collection documents as taking `$`

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/herd-next/SKILL.md:112`
- failure mode: `herdr agent prompt "$name" "/deliver --run $run_id"` submits a literal `/`-prefixed line into the pane, and the pane's agent kind is whatever `:28` read, one of `claude`, `codex`, `omp`, `pi`. `shared/CONVENTIONS.md:106` states "Codex users type `$<skill-name>` instead of `/<skill-name>`; the fence still shows `/`", and `docs/cheatsheet.md:98` repeats it. On a Codex pane the submitted line is not a skill invocation, so no steward ever attaches to the run. Meanwhile `deliver/SKILL.md:54` takes a reply that is not `No pane was opened` as proof that "the pane's steward owns every pause from here" and stops, and `herd_next_gate_answer.md:5` tells the person "The agent in that pane stays with the run, so every later pause is announced there too". The run then sits at its first gate with no steward anywhere and no notification, which is exactly the state acceptance (a) exists to prevent. Handoff mode has the same mismatch at `:65` and `stop_hook.sh:146`, but there the command is staged rather than submitted, so a person can correct the prefix before pressing Enter; that half is a smaller version of the same defect.
- evidence or reproduction: `skills/delivery/herd-next/SKILL.md:28` admits `codex` as a kind; `:112` builds the submitted string with a hardcoded `/`. No line in either skill, in `stop_hook.sh`, or in the three answer templates converts the prefix, confirmed by reading all five files. `shared/CONVENTIONS.md:106` and `docs/cheatsheet.md:98` are the repository's own statement of the Codex prefix.
- fix direction: derive the prefix from `$kind` where the command is built. One clause in step 8 and one in the gate mode: the prefix is `/` for `claude`, `omp`, and `pi`, and `$` for `codex`, applied to both the submitted attach command and the command staged by `send-text`. `stop_hook.sh` needs the same substitution at `:146`, a two-line `case "$kind"` beside the one already at `:117`. If any of `omp` or `pi` differs too, name each kind's prefix in one table in the skill rather than in three places.

## Advisories

### ADV-201 `deliver_ended_answer.md` offers a fourth end state no step ever selects

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/deliver/references/deliver_ended_answer.md:1`
- evidence: the line offers `` `completed` ``, `` `failed at <node>` ``, `` `was cancelled` ``, or `` `has no gate waiting` ``. `deliver/SKILL.md:81` is the only step that prints this template and it names only `completed`, `failed`, and `cancelled`. `grep -rn 'no gate waiting' skills/` returns this line and nothing else.
- suggestion: either drop the fourth variant, or name in step 6 the case it covers (most likely the attach branch landing on a run that is neither paused nor ended).

### ADV-202 A slow dispatch reads as a start failure, because the run-id read has no poll bound

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `skills/delivery/deliver/SKILL.md:45,51`
- evidence: `:45` says to read the run id "a few seconds after dispatch" and `:51` says "A dispatch that never appears in that list is a start failure: report Archon's output as cause and fix, and retry nothing." Nothing bounds how long "never" is observed over. A run that takes longer than the agent's first look to register is reported as a start failure while it is in fact running and unstewarded, and `:51` forbids the retry that would recover it. The verification's own timing (A11: both scratch runs paused at `confirm` within 20s) says dispatch is fast, not instant.
- suggestion: name the bound, for example re-read the list every few seconds for up to 30 seconds and only then call it a start failure. That also makes "report Archon's output" reachable, which it currently is not: `:45` starts the process in the background and never waits on it, so the skill should say where that output is captured.

### ADV-203 `$text` is used in the respond fence but never defined for the approve path

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `skills/delivery/deliver/SKILL.md:100,107`
- evidence: `:91` now names `$judge` and `$reply`, and `:100` names `$decision` for each branch and `$text` for the reject branch ("with the person's words as the text"). Neither names `$text` for the approve branch or for a one-word decision id. The fence at `:107` always passes `"$text"`; unset, it expands to the empty string, which is what `tests/steward.test.mjs:485` passes.
- suggestion: one clause at `:100`: `$text` is the person's words on a reject and empty on an approve, in the same shape ADV-103 used for `$judge`.

### ADV-204 The gate-ask sentence is stated twice and the two copies can drift

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `scripts/validate.mjs:111`
- evidence: `shared/CONVENTIONS.md:96` states the sentence inside a fenced `text` block and `validate.mjs:111` holds a second literal copy as `GATE_ASK_SENTENCE`. They are byte-identical today. An edit to the convention that misses the validator leaves the check silently enforcing the old sentence. Round 23 accepted ADV-104 for the rendering half and left this half open by design.
- suggestion: read the sentence out of `shared/CONVENTIONS.md`'s fenced block in `validate.mjs` so the convention is the single source, and fail when that block is missing.

### ADV-205 `.ignore` is untracked and still undecided

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `.ignore:1`
- evidence: the file exists in the working tree, is not tracked, and is not named in `.gitignore`. Round 23 added `.backups/` to `.gitignore` for ADV-105 and recorded `.ignore` as deliberately left undecided. It re-admits the gitignored `graft/` tree to ripgrep, which is a per-developer choice.
- suggestion: commit it if the whole team wants graft cards greppable, or add `/.ignore` to `.gitignore` if it is personal. Either closes it.

### ADV-206 Acceptance (a) and (b) remain proven by nothing, now across three rounds

- type: Potential issue
- severity: info
- category: Functional correctness
- location: `.agents/tasks/steer-every-archon-gate/task.md:13`
- evidence: verification A1 and A2 both record `untested`, A15 records the plan-13 Herdr checklist as not executed, and rounds 20 (CR-003) and 22 (CR-104) both raised it and both fix rounds declined it for the same reason: the proof needs an outward-facing action in a live Herdr workspace that an automated phase has no turn to confirm. This review records that decline rather than raising it a fourth time, because no fix round can clear a constraint of that shape.
- suggestion: before merge, run plan 13's checklist steps 1 to 4 once by hand in a session where the live action can be confirmed, and record the pane label, the agent's first message, and the resolved gate. CR-201 and CR-202 both sit on that exact path, so that run is also what would have caught them.

## Dead Code and Dependency Review

- newly orphaned code: none caused by this change. The only unreachable text is `deliver_ended_answer.md`'s fourth variant (ADV-201), which is a template slot rather than code. Every file in `skills/delivery/herd-next/` is reachable: `SKILL.md` from `.claude-plugin/plugin.json:36`, the three answer templates from `validate.mjs`'s `ANSWER_INVENTORY` and from the skill body, and `stop_hook.sh` from `SKILL.md:123`. All four `deliver` templates are named at `deliver/SKILL.md:128`. `judge.mjs`'s new `apiKey()` export is called at `:96` and covered by `tests/judge.test.mjs:35`.
- dependency findings: none. No `package.json`, lockfile, or vendored dependency changed in scope. `judge.mjs` adds no import; `apiKey()` uses the `fs` and `path` already imported.

## Verdict

- decision: request_changes
- overall code-health change: improves. The branch removes the last three places a person was told to type an `archon` command, replaces them with a loop that runs the command itself, and lands the loop's guards with tests that verification A9 proved fail on revert. The two findings are both one-clause fixes on paths the existing tests do not reach, not structural problems.
- rationale: CR-201 loses the person's decision silently on a path where every sibling call already guards, and re-asks the same question ten minutes later; CR-202 leaves a Codex user's run with no steward at all while the reply states one is watching, which is the direct negation of acceptance (a). Both are major under the gate. Everything else is advisory.

## Review Limits

- blocked or unavailable checks: acceptance (a) and (b) were not exercised. Opening a review pane and starting an agent in the user's live Herdr workspace is an outward-facing action, and this review makes no change outside its own artifact. The evals suite (`npm run evals`) needs a live model and was not run; it is not part of `npm test` and no eval in it covers the steward.
- residual manual verification: the acceptance (a) and (b) walkthrough in ADV-206, once CR-201 and CR-202 are fixed, since both findings sit on that path. The 600-second `wait` chunk against a runtime whose shell ceiling is lower than 600 seconds; the expected result is one retried call, which is the behavior `deliver/SKILL.md:113` already prescribes, but it has not been observed.
