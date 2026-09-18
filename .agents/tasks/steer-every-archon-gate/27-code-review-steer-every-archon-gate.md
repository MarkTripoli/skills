---
type: code-review
date: 2026-09-18
branch: herdr-plugin-delivery-flow
base_branch: main
base_sha: ef969cddee3ae80975a5d2665ea501b8a329a95f
head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd
status: findings
summary: "Reviewed the whole diff against the merge base with `origin/main`: 24 product files (623 insertions, 35 deletions) plus one untracked changeset and the uncommitted round-21, round-23, and round-25 fixes. `npm test` is 71/71, `node scripts/validate.mjs` exits 0, `node scripts/check-commits.mjs ef969cd..HEAD` exits 0. The previous round's CR-301 is still open: no fix round followed review 26, and neither `herd_next_gate_answer.md` nor `herd_next_answer.md` has a not-submitted variant, so a still-blocked agent is still reported as a submitted attach. Two further majors, both new and both reproduced here: `deliver_archon_answer.md`'s run line offers only `paused at <gate>`, `completed`, and `failed at <node>`, but `deliver/SKILL.md:54` tells the inside-Herdr path to fill that same line with `is running`, which is the shape that path always produces; and the steward's stop path runs `archon workflow abandon` alone, which Archon's own help defines as marking a run cancelled without stopping host work, so the detached continuation `respond --detach` created keeps working while the reply says nothing is waiting. Five advisories, none blocking."
---

# Code Review

## Scope

- merge base: `ef969cddee3ae80975a5d2665ea501b8a329a95f`, `git merge-base origin/main HEAD`. The local `main` ref has been moved forward onto this branch (`git rev-parse main` is `3fafa251`, an ancestor of `HEAD`), so it is not the merge target; the pull request's base is `main` on the host, which is `origin/main` at `a50132a1`. Pinning on the local ref would have dropped part of the change from scope.
- reviewed HEAD: `89ea95e75c8691136557826fa24f64b08ac80ecd` plus the working tree.
- commits: 46 on `ef969cd..HEAD`.
- staged and unstaged changes: 12 tracked product files modified and unreviewed by any commit: `.gitignore`, `scripts/validate.mjs`, `shared/CONVENTIONS.md`, `skills/delivery/deliver/SKILL.md`, `deliver/references/deliver_archon_answer.md`, `deliver/references/deliver_ended_answer.md`, `skills/delivery/herd-next/SKILL.md`, `herd-next/references/herd_next_gate_answer.md`, `herd-next/references/stop_hook.sh`, `start-epic-delivery/references/epic_delivery_final_answer.md`, `skills/delivery/typed-judgment/judge.mjs`, `tests/steward.test.mjs`. These carry the round-21, round-23, and round-25 fixes and are reviewed here as part of the change.
- task-owned untracked files: `.changeset/deliver-steward.md` (reviewed), and `.agents/tasks/steer-every-archon-gate/20` through `26` (artifacts, not review subjects).
- excluded changes: 39 files under `.agents/tasks/`, per the conventions. `skills/delivery/typed-judgment/judge.mjs`'s retry loop, `axis-coverage`, and the `noul` criteria landed before `ef969cd` and are outside this scope; only `apiKey()` and the header comment are in it. The same is true of most of `tests/judge.test.mjs`, `scripts/check-commits.mjs`, `describe-pr/SKILL.md`, `review-code/SKILL.md`, and the four template `helper` lines.

## Previous Round

- previous artifact: `.agents/tasks/steer-every-archon-gate/26-code-review-steer-every-archon-gate.md`
- CR-301 A still-blocked agent is reported as a submitted attach, so the run ends up with no steward and a reply that says otherwise: still open

No `27-code-review-fixes-*.md` exists; no fix round ran after review 26, and the working tree is unchanged since it. The finding is re-raised below as CR-401 so the gate counts it.

## Requirements and Standards

- task or ticket: `.agents/tasks/steer-every-archon-gate/task.md`, six acceptance criteria (a) to (f).
- implementation source: `13-plan-steer-every-archon-gate.md` (newest plan), with `19-verification-steer-every-archon-gate.md` as the verification record.
- repository instructions: `shared/CONVENTIONS.md` (Handoff, Human gate reply, the new Archon gate ask, Commits, Answer template placeholders), `shared/WRITING.md`, `workflows/delivery.md`.

## Change Profile

- intent and expected behavior: no person ever types an `archon` command. `deliver` starts the run and then stewards it: reads state, announces each pause from the gated artifact, takes the answer in words, maps it with `judge.mjs feedback-intent`, and calls `archon workflow respond` itself. `herd-next` is a new skill that opens the next phase in a Herdr pane, and in gate mode opens a review pane at the run's `working_path` and attaches the steward there.
- change description quality: four changesets, each naming the behavior and its motivation. `.changeset/deliver-steward.md` is the headline one and states the loop, the attach flag, and what replaced the printed commands. `.changeset/herd-next-skill.md` covers both `herd-next` modes. No commit subject fails `check-commits.mjs`.
- implementation model and review model: implementation model not recorded in any artifact in this scope; review model `claude-opus-5`. The verification artifact records `jev-1.13.0` for its own grading calls.
- changed-line size and logical cohesion: 24 files, 623 insertions, 35 deletions. Two cohesive units, the steward loop and the `herd-next` skill, that are genuinely coupled (the gate mode exists to start the steward). Above the ~300-line coherent bar but below the ~1000-line split bar, and a split would sever the coupling; no split required.
- resulting large-file concerns: `skills/delivery/deliver/SKILL.md` is now 128 lines and `skills/delivery/herd-next/SKILL.md` 130. Both are within the range of the collection's other skills.
- dependency or lockfile changes: none. `git diff ef969cd -- package.json package-lock.json` is empty.

## Tests Reviewed First

- behavior claimed by tests: `tests/steward.test.mjs` (new, 123 lines) extracts three bash fences from the two skills by marker and runs them against a fake `archon`, asserting the state read takes `status`, `working_path`, the node, and every decision id from a paused run; that both reads survive a `running` run with no approval metadata; that a failing `get` ends the read instead of leaving a status the loop reads as `running`; that `herd-next`'s gate-mode read carries the same guard; that `respond`, `wait`, and `get` all name the run's own worktree with `--cwd`; and that a failing `respond` exits before the `wait`. Verification `A9` proves three of these fail when the guard or `--cwd` is reverted, so they are load-bearing. `tests/judge.test.mjs`'s new case covers the key-file precedence (`TYPESAFE_API_KEY_FILE` over `XDG_CONFIG_HOME` over `HOME`) and proves the file's first line is the bearer token by rejecting a wrong one. `tests/build-packs.test.mjs` tightens its no-key case so this machine's real key file cannot satisfy it.
- missing or misleading coverage: the `respond` fence no longer contains a loop (round 23 replaced the `while :` with straight-line commands plus prose telling the agent to re-run them in a fresh shell call), but the test that exercises it is still named "respond and every wait chunk name the run's own worktree, and the loop breaks on a terminal status" and still asserts `wait` was called exactly once. Reproduced here: feeding that fence a run whose status never becomes terminal (`FAKE_RUN` with `status: running`) still yields exactly one `wait` and exit 0, so the assertion holds regardless of the behavior it names. ADV-401. Nothing covers `herd-next`'s `agent_not_ready` branch or the codex prefix substitution; round 25 recorded that gap and proved the substitution by hand instead.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `9195` in / `73` out. One run; every axis came back `covered`, so no section was rewritten and no second run was needed.

### Correctness

- assessment and evidence: the steward's own state machine is sound and its failure paths are all guarded. Every Archon call in `deliver/SKILL.md` now captures its output and exits on nonzero (`:70` `get`, `:107` `respond`, `:109` `get`), and `:100`'s `abandon` gained the same rule and `--cwd`. `decisions=$(jq -r '.metadata.approval.decisions[]?.id // empty' ...)` tolerates a `running` run with no approval metadata, which `tests/steward.test.mjs` pins for both skills. The `run_status` rename is correct and load-bearing: `status` is read-only in zsh, the default login shell here. I verified the run-list fence against the installed Archon: `archon workflow status --json | jq -r '.runs[] | "\(.id)\t\(.workflow_name)\t\(.status)\t\(.working_path)"'` prints one tab-separated line per run, and `.runs[0]` does carry `working_path`, so step 4's run-id read works as written. Three correctness defects remain. The reply the inside-Herdr path always produces has no matching slot in its template (CR-402). The stop path marks a run cancelled with a command Archon's own help defines as not stopping host work, while `respond --detach` has by then created a detached continuation that only `cancel` stops (CR-403). And `herd-next`'s still-blocked-agent branch reports a submission that did not happen, which `deliver` cannot distinguish from success (CR-401).
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: `deliver/SKILL.md` step 6 reads in the order the loop runs: read state, classify, announce, map, resolve, wait. Each fence is preceded by the sentence that says why it is shaped that way, including the two that record hard-won facts (the zsh `status` reservation at `:79`, and `--detach` being refused only on a fresh launch at `:113`). `herd-next/SKILL.md` numbers its steps and puts the `agent_not_ready` rule once, in step 7, with the gate mode pointing at it rather than restating it. `stop_hook.sh` carries a comment per step keyed to the skill's own numbering, and its `done=1` sentinel with the `EXIT` trap makes the teardown rule readable in one place. Two small costs: `scripts/validate.mjs` moves `conventionsFile`/`conventionsLines` roughly 300 lines away from check 13, which now reads them at a distance (a comment marks it, so this is a note, not a finding), and `deliver_archon_answer.md:9`'s `<path Archon printed>` slot names a source the skill no longer has (ADV-403).
- helper coverage: covered, level 3, confidence 0.97

### Architecture

- assessment and evidence: ownership is drawn correctly. The steward lives in `deliver`, which owns the run; `herd-next` owns only pane geometry and hands the run to `deliver` by submitting `/deliver --run <run-id>`, so there is exactly one implementation of the loop. `herd-next`'s gate mode reuses steps 4 to 6 with a stated single substitution (`$cwd` for `$PWD`) rather than duplicating them. The one duplicated artifact is the state-read fence, byte-identical across the two skills apart from indent; that duplication is deliberate (the collection has no include mechanism for skill prose) and `tests/steward.test.mjs` extracts both copies by the same marker, so drift fails a test. The new `Archon gate ask` convention is the right place for the shared sentence, and `validate.mjs` parses it out of the convention's own fence rather than copying it, so the two cannot drift silently for the file they both name; the search for that fence is not bounded to its section, which is a latent hole (ADV-405). The convention's own wording ("the agent that printed it resolves the gate itself") does not hold for the third file the validator requires it in (ADV-404).
- helper coverage: covered, level 3, confidence 0.99

### Security

- assessment and evidence: the one credential path in scope is `judge.mjs`'s `apiKey()`. It prefers the environment, then `TYPESAFE_API_KEY_FILE`, then `$XDG_CONFIG_HOME` or `$HOME`, and explicitly returns `""` when neither home variable is set rather than resolving a relative `.config/typesafe/api_key` a repository could plant; the comment names that attack and the code implements it. The key is sent only as a bearer header to `TYPESAFE_BASE_URL`, which defaults to `https://api.typesafe.ai`, and is never written to stdout or into an artifact. The new provenance line prints the model and token counts, not the key. `stop_hook.sh` consumes the hook payload's `last_assistant_message`, which is agent-authored rather than trusted: it is constrained by `grep -oE '^/[a-z0-9-]+( @[^ ]+)?$'` before use, and the result reaches `herdr pane send-text` as an argv element, never a shell word, so no metacharacter can escape. The `@<artifact>` half can still contain `../`, but its only use is locating a `task.md` to read a `slug:` out of, and that slug is then reduced to `[a-z0-9-]` before it labels a pane, so the reachable impact is a wrong label. No secret, token, or repository content is added to any judgment state by this change.
- helper coverage: covered, level 3, confidence 0.98

### Performance

- assessment and evidence: the change removes the only unbounded hold. Round 23 replaced the `while :` wait loop with a single `archon workflow wait "$run_id" --json --timeout 600`, so no shell call is held longer than its own timeout, and step 4 no longer runs the dispatch in the foreground at all. The run-id read polls `archon workflow status` every few seconds for at most 30 seconds and then declares a start failure, so it is bounded on both axes. `herd-next`'s gate mode reads the run exactly once and uses `herdr agent prompt` without `--wait`, so the caller's pane is not held for the length of the run; `stop_hook.sh` documents its 90-second budget against the two 30-second waits it can hit. No loop in the change is unbounded, no query is repeated per item, and nothing added is on a hot path. The one cost the change accepts and states is that a full chain splits one pane per phase into the same tab with no bound (`herd-next/SKILL.md:130`).
- helper coverage: covered, level 3, confidence 0.99

## Verification Story

- command or inspection: `npm test`
- result: exit 0, `tests 71 / suites 3 / pass 71 / fail 0 / cancelled 0 / skipped 0 / todo 0`, duration 30855ms. All seven steward cases pass.
- command or inspection: `node scripts/validate.mjs`
- result: exit 0, `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command or inspection: `node scripts/check-commits.mjs ef969cd..HEAD`
- result: exit 0, `ok: 66 subjects`.
- command or inspection: acceptance (d), `grep -rn 'archon workflow' skills/`
- result: 15 lines in 5 files. Every one is either a command a skill runs itself, a fence inside a skill's own steps, or `deliver_archon_answer.md:7` under `Started from the project root:` as past-tense provenance. No line addresses a person with a command to run. The literal glob in `task.md` (`skills/*/references skills/*/SKILL.md`) matches nothing, as verification `A10` already recorded; the corrected glob is the one run here.
- command or inspection: the `respond` fence extracted verbatim from `deliver/SKILL.md` and run under `/bin/bash` against a fake `archon` whose `get` always answers `status: running`
- result: exit 0, one `wait` call, `run_status=running`. The fence is straight-line, so the test assertion naming a loop that breaks on a terminal status cannot fail. ADV-401.
- command or inspection: `archon workflow status --json | jq -r '.runs[] | ...'`, the fence at `deliver/SKILL.md:48`, against the installed Archon
- result: two live runs printed as `<id>\t<workflow_name>\t<status>\t<working_path>`; `.runs[0] | keys` includes `working_path`. The run-id read works as written.
- command or inspection: `archon workflow abandon --help` and `archon workflow cancel --help`, and the `--detach` entry in the CLI's own option list
- result: `workflow cancel <run-id>  Stop a running workflow started with --detach`; `workflow abandon <run-id>  Mark a run cancelled without stopping host work`; `--detach  Run 'workflow run'/'approve'/'reject'/'respond'/'resume' in a detached background child (returns immediately)`. Evidence for CR-403.
- manual, screenshot, or before-and-after evidence: none in this scope. The live-run evidence acceptance (f) asks for is recorded in verification `A3`, `A4`, `A6`, and `A11` against two scratch `delivery-start` runs, and is not re-run here.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-401 A still-blocked agent is reported as a submitted attach, so the run keeps no steward while the reply says it has one

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/herd-next/references/herd_next_gate_answer.md:3`, `skills/delivery/herd-next/references/herd_next_answer.md:5`, `skills/delivery/herd-next/SKILL.md:118`, `skills/delivery/deliver/SKILL.md:54`
- failure mode: `agent start` answers `agent_not_ready` when the agent is blocked during startup. `herd-next/SKILL.md:118` says to wait with `herdr agent wait ... --timeout 30000` and then "report a still-blocked agent in the reply rather than sending input to it", and the gate mode's reply is `herd_next_gate_answer.md`. That template has no slot for a command that was not sent: line 3 reads `Submitted there: <'/deliver --run <run-id>', or '$deliver --run <run-id>' for a codex pane>` unconditionally, and line 5 asserts "The agent in that pane stays with the run, so every later pause is announced there too." So a still-blocked agent produces a reply stating a submission that never happened and a steward that does not exist. `deliver/SKILL.md:54` then keys its inline-steward fallback on the reply opening with `No pane was opened`, which is `herd_next_skipped_answer.md:1`; but in this branch a pane *was* opened, so the gate answer is printed, `deliver` reads it as success and stops, and the run sits paused with no steward anywhere. `herd_next_answer.md:5` has the same shape for the handoff mode: "Staged, not submitted: `<command>`" with no variant for a command that was not staged.
- evidence or reproduction: `herd_next_gate_answer.md` and `herd_next_answer.md` read in full above; neither carries a not-submitted or not-staged variant. `grep -n 'No pane was opened' skills/delivery/herd-next/references/` matches only `herd_next_skipped_answer.md:1`. `deliver/SKILL.md:54` names that exact string as the fallback trigger. Raised as CR-301 in `26-code-review-steer-every-archon-gate.md`; no fix round followed, and the working tree is unchanged since.
- fix direction: give `herd_next_gate_answer.md` and `herd_next_answer.md` an explicit variant for the not-submitted and not-staged cases that names the pane and the command a person can run there, and make the blocked branch say plainly that no steward is attached. Then make `deliver/SKILL.md:54` key its fallback on that condition rather than on the `No pane was opened` opener alone, since a blocked agent leaves a pane open. The cheapest shape that satisfies both: have the gate mode print `herd_next_skipped_answer.md` with the reason `the agent in the new pane is still blocked` and close the pane it opened, so "no pane was opened" stays true and `deliver`'s existing trigger keeps working unchanged.

### CR-402 The inside-Herdr reply fills a template slot with a value that slot does not offer

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `skills/delivery/deliver/references/deliver_archon_answer.md:9`, `skills/delivery/deliver/SKILL.md:54`
- failure mode: `deliver/SKILL.md:54` instructs the inside-Herdr path to "reply with `references/deliver_archon_answer.md`, its run line reading `is running` while the run has not paused yet". That line's slot offers exactly three values: `` `paused at <gate>` ``, `` `completed` ``, and `` `failed at <node>` ``. `is running` is not among them. This is the branch that path always takes: step 4 runs the gate mode "at once, without waiting for a pause", so the run is `running` every time. The agent is therefore told to fill a slot with a value the template forbids, against the conventions' "every `<...>` slot filled" rule and the collection's "use the template only" rule. It either invents a fourth variant, which is the drift answer templates exist to prevent, or picks `paused at <gate>` and states a pause that has not happened, naming a gate the run has not reached. The sibling template for the same situation, `herd_next_gate_answer.md:1`, was given exactly this variant (`` `is running; no gate is waiting yet` ``) in the round-21 fix for CR-001; `deliver_archon_answer.md` was not, and the asymmetry is what makes this an oversight rather than a design choice.
- evidence or reproduction: `deliver_archon_answer.md:9` read in full above, three variants, no running variant; `git diff ef969cd -- skills/delivery/deliver/references/deliver_archon_answer.md` shows the only two changed lines are 9 (which gained artifact detail) and 14 (the ask-or-pane-pointer slot), neither adding a running variant. `deliver/SKILL.md:54` quoted above. `herd_next_gate_answer.md:1` carries the variant its sibling lacks.
- fix direction: add the running variant to `deliver_archon_answer.md:9`, in the same shape its sibling uses: `` or `is running`, followed by the gate it will pause at first ``. While there, line 12's "one line per gate left on **after the current one**" needs a reading for the case where there is no current one; state that every gate the run keeps is listed when it has not paused yet.

### CR-403 The stop path marks the run cancelled with a command that does not stop it

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `skills/delivery/deliver/SKILL.md:100`, `workflows/delivery.md:151`
- failure mode: `deliver/SKILL.md:100` handles `intent: stop` by confirming once and then running `archon workflow abandon "$run_id" --cwd "$cwd"` and printing `deliver_ended_answer.md`. Archon's own help defines `abandon` as "Mark a run cancelled without stopping host work", and `cancel` as "Stop a running workflow started with --detach". By the time any stop is possible, the steward has resolved at least one gate with `archon workflow respond ... --detach` (`:107`), and `--detach` is documented as running the continuation "in a detached background child". So `abandon` alone flips the run's recorded status while the detached child keeps executing the pack in the run's worktree: it can commit, push, and open a pull request after the person asked for it to stop. The same holds for the process step 4 dispatches, which that step explicitly says to "start with the runtime's background or supervised long-running-process mechanism and never wait on it"; nothing in the change ever stops it either. `deliver_ended_answer.md:5` then tells the person "Nothing is waiting on you here." The change's own `workflows/delivery.md:151` states the abandon/cancel distinction correctly one file away, which is why this reads as an omission in the steward rather than a misunderstanding of Archon.
- evidence or reproduction: `archon workflow abandon --help` and `archon workflow cancel --help` against the installed CLI at `/usr/local/bin/archon` print the two definitions quoted above; the shared `--detach` option line reads "Run 'workflow run'/'approve'/'reject'/'respond'/'resume' in a detached background child (returns immediately)". `grep -n 'abandon\|cancel' skills/delivery/deliver/SKILL.md` returns only `:100`, so `abandon` is the whole stop path.
- fix direction: in the stop branch, run `archon workflow cancel "$run_id" --cwd "$cwd"` before `abandon`, guarded the same way the other three calls are, and say in the sentence which command does what: `cancel` stops the detached child, `abandon` records the run as cancelled. State what becomes of the step-4 dispatch process as well, since the person's stop should not leave it running; if the runtime's long-running-process mechanism is what must kill it, say so there rather than leaving it unowned.

## Advisories

### ADV-401 The steward test names a loop the fence no longer has

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `tests/steward.test.mjs:103`
- evidence: the test is named "respond and every wait chunk name the run's own worktree, and the loop breaks on a terminal status" and asserts `result.argv.filter((a) => a === "wait").length === 1` with the message "a paused status breaks the loop after one chunk". Round 23 removed the `while :` from that fence; it is now four straight-line commands, and the looping lives in prose at `deliver/SKILL.md:113`. Reproduced: running the fence verbatim with a fake `archon` whose `get` always answers `status: running` still gives exactly one `wait` and exit 0, so the assertion passes on the state it claims to exclude.
- suggestion: drop the loop clause from the test name and the assertion message, keeping the `--cwd` assertions that do bite. The single `wait` is worth asserting on its own terms, as proof that the fence holds one shell call and not the length of a phase.

### ADV-402 Acceptance (a) and (b) are still proven by nothing in the change

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `.agents/tasks/steer-every-archon-gate/task.md:13`
- evidence: verification 19 records `A1` (acceptance (a)), `A2` (acceptance (b)), and `A15` (the plan's Herdr checklist) as `untested`, because each needs a live Herdr workspace and an outward-facing pane open that no automated session was asked to take. The CLI half is proven live (`A3`, `A4`, `A6`, `A8`), the pane primitives are proven present (`A14`), and the reply templates are proven to carry no command (`A10`), so what is left unproven is the end-to-end agent behavior only.
- suggestion: kept as an advisory rather than re-raised as a major, consistent with rounds 24 and 26 and with the decision `25-code-review-fixes`'s ADV-206 recorded: no fix round has a turn in which it can clear this, and CR-401 to CR-403 all sit on the same unproven path, so blocking on it a fourth time buys nothing. Walk it by hand once inside Herdr before merge and record the pane label and first message, as `13-plan` steps 3 and 4 ask.

### ADV-403 A template slot names a source the skill no longer reads

- type: Refactor suggestion
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/deliver/references/deliver_archon_answer.md:9`
- evidence: the line reads "worktree `<path Archon printed>`" and, later, "followed by the pull request or end state Archon printed". Step 4 no longer runs Archon in the foreground and never captures its stdout: the dispatch is a background process the skill is told never to wait on, and the worktree comes from `working_path` in `archon workflow status --json`. The sentence that used to justify the slot ("Archon prints the run id when it dispatches and 'Workflow paused' with the gate name at a pause") was deleted by this change.
- suggestion: rename the slot to `<the run's working_path>`, matching the wording line 14 and `deliver_ended_answer.md:3` already use.

### ADV-404 The gate-ask convention states a rule its third required file cannot follow

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `shared/CONVENTIONS.md:100`, `skills/delivery/herd-next/references/herd_next_gate_answer.md:5`
- evidence: the convention says "The agent that printed it resolves the gate itself with `archon workflow respond`; the person never runs that command." `validate.mjs:401` requires the sentence in three files, one of which is `herd_next_gate_answer.md`, printed by `herd-next`, which resolves nothing; the pane's `deliver` does. The reply is not misleading in practice, because "Answer in that pane." precedes the ask, but the convention as written does not describe it.
- suggestion: widen the convention's sentence to "the agent that printed it, or the agent it points at, resolves the gate", so the rule covers the pane-pointer case the validator already enforces.

### ADV-405 The gate-ask fence lookup is not bounded to its section

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `scripts/validate.mjs:344`
- evidence: `gateAskFenceStart` is the first `` ```text `` line anywhere after the `## Archon gate ask` heading, with no upper bound at the next `##`. `shared/CONVENTIONS.md` has another `` ```text `` fence at line 152, under `## Commits`. If a future edit removes the fence from the gate-ask section but keeps the heading, the lookup silently adopts the commit-subject example as `GATE_ASK_SENTENCE`, every gate answer fails the byte-exact check, and the error message points at the answer files rather than at the convention that moved. The comment above the block claims the opposite ("fails loudly instead of drifting silently"), which is true for a removed heading but not for a removed fence.
- suggestion: bound the search at the next line starting `## ` and keep the existing `GATE_ASK_SENTENCE === null` failure for the bounded miss.

## Dead Code and Dependency Review

- newly orphaned code: none. Every template added is named by a step: `deliver_gate_answer.md` and `deliver_ended_answer.md` by `deliver/SKILL.md` step 6, `herd_next_answer.md` by step 9, `herd_next_gate_answer.md` by the gate mode, `herd_next_skipped_answer.md` by the step 1 guard, step 2, and the gate mode's read guard. All five are in `ANSWER_INVENTORY`, so `validate.mjs` would fail on an unreferenced one. Round 25 deleted the one variant that had become unreachable (`has no gate waiting` in `deliver_ended_answer.md`) rather than leaving it. `stop_hook.sh` is reachable only by hand installation, which its header states.
- dependency findings: none. No `package.json` or `package-lock.json` change in scope.

## Verdict

- decision: request_changes
- overall code-health change: positive. The loop's shape is right, its failure paths are all guarded, and the unbounded hold that earlier rounds found is gone. The three open findings are each a localized edit to a template or a single sentence; none touches the loop's structure.
- rationale: CR-401 is the previous round's finding, unchanged and unfixed, and it leaves a run with no steward while the reply claims one. CR-402 makes the primary inside-Herdr reply unfillable from its own template. CR-403 means a person who asks for a run to stop gets a reply saying it stopped while the detached child keeps working. All three are on acceptance (a) and (c)'s path.

## Review Limits

- blocked or unavailable checks: none. `npm test`, `validate.mjs`, and `check-commits.mjs` all ran green in this session, and the Archon CLI was available for the live `status --json` and help-text checks.
- residual manual verification: acceptance (a), (b), and the plan's Herdr checklist steps 3 and 4 need one by-hand walkthrough inside a Herdr workspace, recorded as ADV-402. Opening a review pane and starting an agent in the person's own workspace is an outward-facing action this review did not take.
