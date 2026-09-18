---
type: code-review
date: 2026-09-18
branch: herdr-plugin-delivery-flow
base_branch: main
base_sha: ef969cddee3ae80975a5d2665ea501b8a329a95f
head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd
status: findings
summary: "Reviewed the whole diff against the merge base with origin/main: 24 product files plus one untracked changeset and the uncommitted round-23 and round-25 fixes. Both majors the last round fixed are genuinely fixed and reproduced: `respond` now exits the steward on a nonzero code, and all three staged or submitted commands carry `$` for a codex pane. One new major remains: `agent_not_ready` is the one failure both `herd-next` modes are written to survive, and neither answer template has a slot for it, so a still-blocked agent is reported as `Submitted there: /deliver --run <run-id>` while nothing was submitted; `deliver` reads that as success, stops, and the run sits paused with no steward anywhere. The fix round must give both replies a not-submitted variant and key `deliver`'s fallback on it."
---

# Code Review

## Scope

- merge base: `ef969cddee3ae80975a5d2665ea501b8a329a95f`, the base of pull request #19 (`gh pr view --json baseRefName` returns `main`; the local `main` ref is stale at `ae9e308`, so the merge base was taken against `origin/main`).
- reviewed HEAD: `89ea95e75c8691136557826fa24f64b08ac80ecd` plus the uncommitted working tree.
- commits: 46 after the merge base, 16 of them touching product files.
- staged and unstaged changes: 13 product files modified and uncommitted (`.changeset/herd-next-skill.md`, `.gitignore`, `scripts/validate.mjs`, `shared/CONVENTIONS.md`, `deliver/SKILL.md`, `deliver_archon_answer.md`, `deliver_ended_answer.md`, `herd-next/SKILL.md`, `herd_next_gate_answer.md`, `stop_hook.sh`, `epic_delivery_final_answer.md`, `judge.mjs`, `tests/steward.test.mjs`). These carry the round-23 and round-25 fixes and are reviewed as part of the change.
- task-owned untracked files: `.changeset/deliver-steward.md` (reviewed); the six `NN-code-review*` artifacts under `.agents/tasks/steer-every-archon-gate/` (not review subjects).
- excluded changes: everything under `.agents/tasks/`. `review-code`, `describe-pr`, `check-commits.mjs`, `code_review_template.md`, `pr_review_template.md`, `verification_template.md`, `app_test_template.md`, `epic_plan_template.md`, `resolve-pr-reviews`, `verify-implementation`, `tests/commits.test.mjs`, `tests/lib/typesafe-stub.mjs`, and the retry and `axis-coverage` halves of `judge.mjs` are already on `origin/main` from the two earlier tasks on this branch and are outside this merge base's diff. The product diff is 24 files, 623 insertions, 35 deletions.

## Previous Round

- previous artifact: `.agents/tasks/steer-every-archon-gate/24-code-review-steer-every-archon-gate.md`
- CR-201 The steward's `respond` is the one Archon call with no exit guard: fixed. `deliver/SKILL.md:107` now reads `out=$(archon workflow respond ... --cwd "$cwd") || { printf '%s\n' "$out" >&2; exit 1; }`, and `tests/steward.test.mjs:117` drives it (`FAKE_FAIL_ON: "respond"`, asserting nonzero exit and zero `wait` calls).
- CR-202 The attach command is submitted with a `/` prefix into a pane whose kind may be `codex`: fixed. `herd-next/SKILL.md:65` converts `$command` before `send-text`, `:114` converts `$attach` before `agent prompt`, `stop_hook.sh:98` converts `$cmd` before its own `send-text`, and `herd_next_gate_answer.md:3` was unhardcoded to the two-variant slot so the reply stays true for a codex pane.

## Requirements and Standards

- task or ticket: `.agents/tasks/steer-every-archon-gate/task.md`. Six acceptance criteria, (a) through (f).
- implementation source: `13-plan-steer-every-archon-gate.md` (5 phases), the newest `plan` artifact; receipts `14` through `18`; verification `19` (`status: passed`, `revision: e3aa445`).
- repository instructions: `AGENTS.md`, `shared/CONVENTIONS.md` (Handoff, the new "Archon gate ask", Typed judgments, Commits), `shared/WRITING.md`, `workflows/delivery.md`. There is no repository `CLAUDE.md`.

## Change Profile

- intent and expected behavior: a person never types an `archon` command. `deliver` starts the run in the background, reads its id from `archon workflow status --json`, and then stewards it: announce each pause from the gated artifact, take the answer in words, map it with `judge.mjs feedback-intent`, run `archon workflow respond` itself, wait in bounded chunks. Inside Herdr, `herd-next`'s new Archon gate mode opens a review pane at the run's `working_path` and submits `/deliver --run <run-id>` there, so the steward lives in the pane.
- change description quality: `.changeset/deliver-steward.md`, `.changeset/herd-next-skill.md`, and `.changeset/typesafe-key-file.md` each state the behavior and the motivation; the herd-next changeset was extended this round to name the gate mode. Commit subjects pass `check-commits.mjs` (`ok: 66 subjects`). The pull request body was not re-read this round; `pr-description.md` for this task does not exist yet, which is correct for a change still in the review loop.
- implementation and review model: not recorded in receipts 14 to 18; the verification artifact records the helper model (`jev-1.13.0`) but not the implementing model.
- changed-line size and logical cohesion: 623 added, 35 deleted across 24 files. Above the ~300-line coherent bar but under the ~1000-line split bar, and the change is one behavior: the steward and the pane that hosts it. The key-file half of `judge.mjs` (21 lines) is the one unrelated concern in the diff, and it carries its own changeset.
- resulting large-file concerns: `deliver/SKILL.md` is 128 lines with step 6 at 47 of them; `herd-next/SKILL.md` is 131 lines in two modes. Both are still one readable pass.
- dependency or lockfile changes: none. `package.json` and `package-lock.json` are untouched.

## Tests Reviewed First

- behavior claimed by tests: `tests/steward.test.mjs` (new, 123 lines) extracts three bash fences by marker from the two skills and runs them under `/bin/bash` against a fake `archon` on `PATH`. Seven cases: the paused-run read yields `status`, `working_path`, node, and decision ids; a failed `get` exits nonzero and runs nothing downstream; `herd-next`'s gate-mode read carries the same guard; both reads survive a `running` run with no `metadata.approval` at all; `respond`, `wait`, and `get` all carry `--cwd "$cwd"` and one chunk breaks on `paused`; a `get` that fails after the `respond` ends the steward; a `respond` that fails never reaches the `wait`. `tests/judge.test.mjs` gained a case proving the key comes from `TYPESAFE_API_KEY_FILE`, then `$XDG_CONFIG_HOME/typesafe/api_key`, then `~/.config/typesafe/api_key`, in that precedence, and that a wrong first line is rejected. `tests/build-packs.test.mjs` and the no-key cases in `tests/judge.test.mjs` now name a missing `TYPESAFE_API_KEY_FILE` so a developer's real key file cannot satisfy a no-key assertion; that is a tightening.
- missing or misleading coverage: nothing covers either skill's agent behavior, which is where CR-301 lives; the tests reach the bash fences only, and the `agent_not_ready` path is prose with no fence. `stop_hook.sh` has no test either; its three `case "$kind"` conversions were proved by hand-extraction in round 25 and by `shellcheck` (exit 0), not by `npm test`. This is a known and stated limit of the plan (phase 3, "Automated Verification"), not a new gap, but it is exactly the blind spot CR-301 fell into.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `8339` in / `73` out. One run; every axis came back `covered`, so no rewrite and no second run were needed.

### Correctness

- assessment and evidence: the two guards and the `--cwd` propagation are correct and proven. `deliver/SKILL.md:70` and `herd-next/SKILL.md:92` both guard `get`; `:107` guards `respond`; `:100` guards `abandon`; `tests/steward.test.mjs` fails on each reverted guard per verification `19`'s A9. The `run_status` rename (CR-102's fix) is carried through both skills and the test's `REPORT` string. `decisions[]?.id // empty` no longer aborts on a `running` run with no `metadata.approval`, and `tests/steward.test.mjs:94` pins that shape. The one correctness defect left is not in a fence: `herd-next/SKILL.md:69` and `:118` tell the skill to "report a still-blocked agent in the reply", and neither `herd_next_answer.md` nor `herd_next_gate_answer.md` has a slot for that report, so both assert an action that did not happen; in gate mode `deliver/SKILL.md:54` then reads the gate reply as success and stops, leaving no steward (CR-301). Two smaller inaccuracies sit beside it: the same `:54` clause names four causes for its `No pane was opened` fallback and only one of them prints that reply (ADV-301), and `deliver/SKILL.md:54` and `:55` disagree with step 6 about which template the first pause prints (ADV-302).
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: step 6's fences are now flat: the `while :; do ... done` loop was replaced by a four-line sequence plus one paragraph stating when to re-run three of those lines, which is what made a single fence extractable and testable (`tests/steward.test.mjs:105`). The guard shape `|| { printf '%s\n' "$X" >&2; exit 1; }` is identical in all four Archon calls, so a reader learns it once. `stop_hook.sh` is 152 lines with a comment per step keyed to the skill's own step numbers. The prose has grown dense in two spots: `deliver/SKILL.md:54` is a 90-word sentence carrying a four-item parenthetical, and `:100` packs the whole decision mapping into one paragraph where `$decision` is the one variable the fence below uses that the prose never binds by name (ADV-303).
- helper coverage: covered, level 3, confidence 0.97

### Architecture

- assessment and evidence: ownership is clean. `deliver` owns the loop; `herd-next` owns panes and never waits ("Read the run once. This pane is never held", `herd-next/SKILL.md:87`); `stop_hook.sh` re-implements only steps 3 to 7 of the handoff mode and states so. The state read is duplicated verbatim between `deliver/SKILL.md:70-76` and `herd-next/SKILL.md:92-98`; design 12 DQ 4 chose that deliberately so each skill reads independently, and `tests/steward.test.mjs` extracts and asserts both copies, so the duplication cannot drift silently. The `/deliver --run <run-id>` attach is the right seam: one entry point serves the pane, a lost steward, and an adopted run. `validate.mjs` now parses the gate-ask sentence out of `shared/CONVENTIONS.md`'s own fence rather than holding a second copy, which removes a drift path; its fence search is unbounded past the section heading (ADV-307).

### Security

- assessment and evidence: no new trust boundary is crossed by the steward. The person's words reach Archon as a single argv element (`archon workflow respond "$run_id" "$decision" "$text"`, `deliver/SKILL.md:107`), never interpolated into a shell string, so a reply containing quotes or `$(...)` cannot execute. `herdr pane send-text "$pane" "$command"` takes a string already constrained to `^/[a-z0-9-]+( @[^ ]+)?$` by `herd-next/SKILL.md:20` and `stop_hook.sh:63`. `judge.mjs`'s new key file is the one secret-handling change: `apiKey()` returns `""` rather than resolving a relative `.config/typesafe/api_key` when both `HOME` and `XDG_CONFIG_HOME` are unset, which closes the path where a repository could plant a key file, and `typed-judgment/SKILL.md:18` documents writing it under `umask 077`. The key is read, trimmed to its first line, and used only as a bearer header; it is never logged (`judge.mjs:642` prints the model and token counts, not the key). `stop_hook.sh` parses `.last_assistant_message` from its own session's payload and lets `$artifact` carry `..`, so a crafted message can make the hook `test -f` and `sed` an arbitrary `task.md` outside the repository; the only thing taken from it is `slug`, which is then reduced to `[a-z0-9-]{0,32}`, used as a pane label and agent name, and nothing is written or executed. Read-only, same-user, self-supplied input: not a finding.

### Performance

- assessment and evidence: the change removes the unbounded hold CR-101 found. No shell call is held for the length of a phase: the dispatch is backgrounded and never waited on (`deliver/SKILL.md:45`), the run-id read polls for at most 30 seconds, and every `wait` is `--timeout 600` in its own call with the loop driven from outside the fence (`:108`, `:113`). `herd-next`'s gate mode reads the run exactly once. `archon workflow status --json` returns only running and paused runs, so the poll list stays small. The only unbounded loop is the steward's own re-read cycle, which is correct: it ends when the run does. No N+1, no hot path, no allocation concern in a collection of prose and three small scripts.

## Verification Story

- command or inspection: `npm test`
- result: exit 0, `tests 71 / suites 3 / pass 71 / fail 0 / cancelled 0 / skipped 0 / todo 0`, duration 30529ms. All seven steward cases pass, including the new respond-failure and running-run fixtures.
- command or inspection: `node scripts/validate.mjs`
- result: exit 0, `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command or inspection: `node scripts/check-commits.mjs ef969cd..HEAD`
- result: exit 0, `ok: 66 subjects`.
- command or inspection: `shellcheck skills/delivery/herd-next/references/stop_hook.sh`
- result: exit 0, no output.
- command or inspection: acceptance (d), `grep -rn 'archon workflow' skills/delivery/*/references skills/delivery/*/SKILL.md`
- result: 14 lines in 5 files. Every one read. `deliver_archon_answer.md:7` sits under `Started from the project root:` as past-tense provenance; `start-epic-delivery/SKILL.md:34` and `epic_delivery_final_answer.md` now state the commands are "the record of what runs, not something for you to type"; the rest are commands a skill or pack runs itself. No line addresses a person.
- command or inspection: the new `validate.mjs` gate-ask check, traced by hand against `ANSWER_INVENTORY`
- result: all three files in `GATE_ASK_ANSWERS` are mapped to `TERMINAL_ANSWER` (`validate.mjs:51`, `:52`, `:53`, `:59`), so the check is reachable for each; all three carry `Say `approve`, or say what should change.` byte-exact, and `shared/CONVENTIONS.md:96-98` is the fence it is read from.
- manual, screenshot, or before-and-after evidence: none in this round. Verification `19` records the live-run evidence for acceptance (c): `respond --detach --cwd "$cwd"` run from outside the run's worktree against paused runs `6bd7f01d` (approve, gate resolved, `delivery-full` child dispatched) and `6d86fa7a` (reject with the words `lean, outline`, `delivery-lean` child dispatched). Those are `pass` with commands and quoted output, and are not re-run here. Its `untested` items A1 and A2 are acceptance (a) and (b), carried below as ADV-306.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-301 A still-blocked agent is reported as a submitted attach, so the run ends up with no steward and a reply that says otherwise

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `skills/delivery/herd-next/SKILL.md:118`, `skills/delivery/herd-next/references/herd_next_gate_answer.md:3`, `skills/delivery/deliver/SKILL.md:54`
- failure mode: `agent_not_ready` is the one startup failure both `herd-next` modes are written to survive. Gate mode waits with `herdr agent wait "$name" --until idle --until done --timeout 30000`, and on a still-blocked agent it is told to "report a still-blocked agent in the reply rather than sending input to it" (`:118`). Its reply is `references/herd_next_gate_answer.md`, unconditionally (`:122`), and that template's line 3 states `Submitted there: <`/deliver --run <run-id>`...>, which reads the gated artifact and asks for your decision` with no variant for "nothing was submitted", and its line 5 adds `The agent in that pane stays with the run, so every later pause is announced there too`. So the reply asserts a submission that did not happen. `deliver/SKILL.md:54` then branches on that reply: it falls back to stewarding inline only "When its reply opens with `No pane was opened`". A gate reply does not open that way, so `deliver` takes the `Otherwise` branch, prints `deliver_archon_answer.md` with the pane pointer, and stops. Result: the run is `running` with no steward anywhere, it pauses at its first gate, nothing announces it, and the person has been told to answer in a pane whose agent never received the attach command. The same template gap exists in handoff mode: `herd_next_answer.md:5` says `Staged, not submitted: `<the /skill @file command>`. Switch to that pane and press Enter` with no blocked variant, so a blocked agent there is reported as staged when nothing was staged; that case is milder because the person can retype the command, but the reply is equally false.
- evidence or reproduction: read together, `herd-next/SKILL.md:118` ("report a still-blocked agent in the reply"), `:122` ("The reply is `references/herd_next_gate_answer.md`, every `<...>` slot filled"), and `herd_next_gate_answer.md:1`, `:3`, `:5` (the only two variants offered are `paused at <nodeId>` and `is running; no gate is waiting yet`; both assert an open pane and a submitted command). `deliver/SKILL.md:54` names four causes for its fallback, and "an agent still blocked after the readiness wait" is one of them, but the detection is the literal string `No pane was opened`, which only `herd_next_skipped_answer.md:1` produces and which gate mode never reaches on this path. Nothing in `tests/steward.test.mjs` touches either skill's `agent_not_ready` prose; the suite extracts bash fences only, and this path has no fence.
- fix direction: give the blocked agent its own exit rather than a false claim. Smallest: in `herd-next`'s gate mode, a still-blocked agent prints `references/herd_next_skipped_answer.md` with the reason `the agent in the new pane is still blocked` (naming the pane so it is not orphaned), which makes `deliver/SKILL.md:54`'s existing `No pane was opened` detection fire and steward inline. Handoff mode needs the matching slot in `herd_next_answer.md:5`: a variant saying nothing was staged and naming the command to run by hand. If the pane pointer must be kept in gate mode instead, then `herd_next_gate_answer.md:3` needs a not-submitted variant and `deliver/SKILL.md:54` must key its fallback on that variant rather than on the skipped reply's opening line.

## Advisories

### ADV-301 The no-pane fallback names four causes; three of them do not produce the reply it watches for

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `skills/delivery/deliver/SKILL.md:54`
- evidence: the clause lists "an unreadable agent kind, a name it cannot build, a `get` that failed, or an agent still blocked after the readiness wait". Only the third prints `herd_next_skipped_answer.md`. An unreadable kind stops with a question (`herd-next/SKILL.md:31`, "ask the user for the kind in one sentence and stop"), and an unbuildable name does the same (`:58`, "ask the user for a name and stop"). The fourth is CR-301. Conversely the one cause that does print the skipped reply and is not listed is `the run has ended` (`:103`), where falling through to step 6 happens to be correct.
- suggestion: cut the list to the causes that actually print the skipped reply, or state the rule instead of enumerating: fall back to step 6 whenever the gate mode reports no steward attached, and note that the two ask-and-stop paths resume on the person's answer.

### ADV-302 The first pause has two answer templates

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `skills/delivery/deliver/SKILL.md:55`
- evidence: step 4's outside-Herdr branch says the first pause "is `references/deliver_archon_answer.md` printed at that pause, its run line filled from the gated artifact's `summary`, `### Verify`, and `### Known limits`". Step 6 says unconditionally "Print `references/deliver_gate_answer.md` with every `<...>` slot filled and end the turn" (`:96`). Both are terminal, both carry the gate ask, and both now name the artifact's summary, Verify, and Known limits, so an agent entering step 6 from step 4 has two valid readings and the run's branch and worktree survive in only one of them.
- suggestion: say which one wins. The natural rule is that the first pause after a start prints `deliver_archon_answer.md` (it alone carries the started command and the pauses ahead) and every later pause prints `deliver_gate_answer.md`; state that in step 6 where the print happens, not only in step 4.

### ADV-303 `$decision` is the one fence variable the mapping paragraph never binds

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/deliver/SKILL.md:100`
- evidence: round 25 added `$text` to this paragraph ("`intent: proceed` is `approve`, `$text` empty"), and the fence at `:107` uses `"$decision"` and `"$text"`. The paragraph says the reply "is `approve`" and "is `reject`" without ever naming that value `$decision`, so the one variable a reader must carry into the fence is the one never spelled.
- suggestion: one word, matching the `$text` precedent: "`intent: proceed` is `$decision` `approve`, `$text` empty."

### ADV-304 `archon workflow status` is the only Archon call in either skill without the exit guard

- type: Nitpick
- severity: minor
- category: Stability and availability
- location: `skills/delivery/deliver/SKILL.md:48`, `skills/delivery/herd-next/SKILL.md:84`
- evidence: every other Archon call in both skills now carries `|| { printf '%s\n' "$X" >&2; exit 1; }` (`deliver/SKILL.md:70`, `:107`, `:109`, the `abandon` at `:100`; `herd-next/SKILL.md:92`). These two pipe straight into `jq`, so a nonzero exit prints nothing and reads as "no runs". In `deliver` that turns a failed read into "a start failure" after a 30-second poll, which reports the wrong cause; in `herd-next`'s gate mode, which has no git-work-tree precondition, it falls into a branch the prose does not define (the text covers one run and several, not zero).
- suggestion: capture and guard both the way the reads are guarded, and give `herd-next` a zero-runs branch that prints the skipped reply.

### ADV-305 The `.gitignore` comment cites a file this repository does not have

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `.gitignore:5`
- evidence: `# Backups made before large file changes, per CLAUDE.md.` There is no `CLAUDE.md` at the repository root; the collection's own agent instructions live in `AGENTS.md`. The convention being cited is a personal global instruction, so a contributor following the comment finds nothing.
- suggestion: drop the citation, or say what the directory is without naming an absent file: `# Local pre-edit backups; never committed.`

### ADV-306 Acceptance (a) and (b) are still decided by nothing in the change

- type: Potential issue
- severity: info
- category: Functional correctness
- location: `.agents/tasks/steer-every-archon-gate/task.md:13`
- evidence: verification `19` records A1 and A2 as `untested`, and round 25 left ADV-206 advisory for the same reason: the pane half and the session half are agent behavior in a live Herdr workspace, and no fix round has a turn that can take an outward-facing action in the person's workspace. Every CLI half under them is proven (verification `19` A3 through A10). CR-301 sits on exactly this unproven path, which is why it survived three rounds.
- suggestion: unchanged from the previous rounds. Record it as residual manual verification and run plan 13's phase 5 checklist steps 3 and 4 once by hand; do not gate the loop on it.

### ADV-307 The gate-ask fence search runs past its own section

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `scripts/validate.mjs:341`
- evidence: `findIndex((line, i) => i > gateAskHeading && line.trim() === "```text")` takes the first `text` fence anywhere after the heading, not the first one inside the section. `shared/CONVENTIONS.md` has three `text` fences, at `:85`, `:96`, and `:152`. Delete the gate-ask fence at `:96` and the search binds to `:152` instead, so the `missing the Archon gate ask fenced sentence` failure this block was written to raise never fires; what fires instead is three byte-exact failures on the answer templates, pointing at the wrong files.
- suggestion: bound the search at the next `## ` heading after `gateAskHeading` before looking for the fence.

## Dead Code and Dependency Review

- newly orphaned code: none. The one deletion is a template variant, `has no gate waiting` in `deliver_ended_answer.md:1`, and `deliver/SKILL.md:81` is the template's only caller and never selects that branch; the three live variants cover the three statuses the caller can reach, `cancelled` covering the `abandon` path at `:100`. `apiKey()` is exported from `judge.mjs` but has one caller, `systemOne` at `:98`, in the same file; its `env` parameter was removed this round with no external consumer to break.
- dependency findings: none. No dependency was added, removed, or upgraded; `package.json` and `package-lock.json` are unchanged in this diff.

## Verdict

- decision: request_changes
- overall code-health change: improves it. The four Archon calls now share one guard shape and one `--cwd` rule, the wait loop is bounded per shell call, `run_status` avoids zsh's read-only `status`, the decision-id read survives a run with no approval metadata, the gate-ask sentence has one source of truth instead of two copies, and seven tests pin behavior that had none. The diff removes more ways to hang than it adds.
- rationale: one major remains. `agent_not_ready` is a path both `herd-next` modes were explicitly written for, and it is the one path where the reply says a steward is watching and none is, so the run pauses with nobody to answer it. The fix is a template variant and a matching detection in `deliver`, not a redesign.

## Review Limits

- blocked or unavailable checks: none. `npm test`, `validate.mjs`, `check-commits.mjs`, `shellcheck`, and the acceptance (d) grep all ran and all passed. The typed-judgment helper answered from the key file; its verdicts are recorded per axis above.
- residual manual verification: acceptance (a) and (b), the agent behavior inside and outside Herdr (ADV-306), and CR-301's failure itself, which needs an agent that is still blocked after a 30-second `herdr agent wait`. Neither is reachable from this session. `stop_hook.sh` has no automated coverage; its three kind conversions rest on `shellcheck` and round 25's hand-extraction.
