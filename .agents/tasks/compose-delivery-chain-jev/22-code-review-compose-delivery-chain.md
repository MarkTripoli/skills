---
type: code-review
date: 2026-09-18
branch: compose-delivery-chain-jev
base_branch: main
base_sha: a50132a198b6feac8dd0a46bb9842b6d70edb8ac
head_sha: 7b0ba47f4f093443ef04a9266af3c9d662864e17
status: clean
summary: "Fourth round against `origin/main` over the 50 non-artifact committed files plus the uncommitted third fix round and the untracked changeset. Both of the previous round's findings are fixed and confirmed against the diff: `route` now validates a translated gate set against `delivery-adaptive` (the pack the run actually continues in) and `docs/cheatsheet.md` no longer claims `/deliver` reaches the adaptive chain. `npm test` is 72/72 in this session, including every pack fixture and the `-omp` regeneration check. Two suspected defects were raised and rejected with evidence: the `gates_plan` ref, whose field name extends `gates`, substitutes correctly under Archon 0.10.1 (probed on a scratch workflow), and the per-boundary re-judgment does not collapse already-run phases (verification A21's live call scored research 0.65 and design 0.95 with 14 artifact summaries in the state). No critical- or major-severity finding remains; four advisories are recorded and none blocks. The next phase is `/describe-pr`."
---

# Code Review

## Scope

- merge base: `a50132a198b6feac8dd0a46bb9842b6d70edb8ac` (`git merge-base origin/main HEAD`). No pull request exists for this branch (`gh pr view` reports none) and `task.md` carries no `base:`, so the merge target is the repository default branch, `origin/main`.
- reviewed HEAD: `7b0ba47f4f093443ef04a9266af3c9d662864e17`, plus the uncommitted working tree.
- commits: 23 after the merge base (`6d761cb` through `7b0ba47`); 9 carry product changes, 14 are `docs(task):` artifact commits.
- staged and unstaged changes: 21 modified tracked files, all unstaged — the third fix round (`21-code-review-fixes`) has not been committed. `delivery-start.yaml` (+99/-... in the working tree), both `delivery-decide` flavors, both `delivery-adaptive` flavors, six `start/fixtures/*.stubs.yaml`, `judge.mjs`, `README.md`, `docs/cheatsheet.md`, both `tdd_template.md` copies, `workflows/delivery.md`, and the three test files. Reviewed together with the committed change as one diff.
- task-owned untracked files: `.changeset/delivery-adaptive-pack.md` (the changeset round 16's CR-003 required; `@marktripoli/skills` matches `package.json:2`, bump `minor`).
- excluded changes: the 22 artifacts under `.agents/tasks/compose-delivery-chain-jev/` (task artifacts, not review subjects) and the untracked `.ignore`, a graft tooling file that predates this session and is unrelated to the task.

## Previous Round

- previous artifact: `20-code-review-compose-delivery-chain.md`
- CR-001 `route` rejects a gate the pack that will actually run does have: fixed
- CR-002 `/deliver` never reaches the adaptive chain the cheatsheet says it does: fixed

Both decided from the current diff. CR-001: `delivery-start.yaml:99-104` now computes `pack` (the judged-to-adaptive swap) before the gate check and validates `check_gates`/`check_names` against it at `:138-165`, while `route.output.gates` stays in the judged pack's vocabulary for `confirm` and `resolve`; `resolve` reads `route.output.pack` at `:232` instead of recomputing. `tests/dispatch.test.mjs:148-167` reproduces the finding's exact repro (`oneshot` judged at 0.95 with `INPUTS_GATES=design,plan` and with `phases`) and keeps the explicit-pin control case failing. CR-002: `docs/cheatsheet.md:22` now says `/deliver` "judges the same pack and autonomy level but starts that fixed pack directly, never `delivery-adaptive`", which agrees with `deliver/SKILL.md`'s `archon workflow run delivery-<pack>`.

## Requirements and Standards

- task or ticket: `.agents/tasks/compose-delivery-chain-jev/task.md`. Two deliverables (JEV composes the chain at every boundary; the execution DAG is drawn for the engineer) and five acceptance items (a)-(e) plus the live-probe cleanup rule.
- implementation source: `04-plan-compose-delivery-chain.md` (newest `plan`), six phases; `15-verification-compose-delivery-chain.md` (newest `verification`) records 22 items, 20 `pass` and 2 `untested` (A20, whether the eight committed samples are the right eight; A22, a live default-input run needing an install over the user's `~/.agents/skills`), `## Findings` `None.`, `## Missing` `None.`. Verification was written at `5cd8a09` and so predates the last two fix rounds; its `pass` items were not re-run here except where a fix round touched the same code, and `npm test` was re-run in this session against the current tree.
- repository instructions: `shared/CONVENTIONS.md` (artifact naming and iteration, typed judgments, handoff shape), `shared/WRITING.md`, `workflows/delivery.md` (pack and block tables, Archon notes), `docs/testing.md`.

Acceptance items, decided against the diff and its tests: (a) `npm test` exits 0 with `tests 72 / pass 72 / fail 0`, re-run in this session. (b) `archon workflow test delivery-adaptive` is covered inside `npm test` by "archon: every declared fixture passes under `workflow test`"; the four adaptive fixtures are declared in `.archon/workflows/delivery/adaptive/fixtures/`. (c) proven by verification A3's `--exec-code` dry run, and split across two committed checks: the four fixtures prove the skipped nodes report `when_condition_false`, and `tests/packs.test.mjs:342-405` proves the decide node's real bash writes the artifact with the skip dimmed. (d) proven by verification A4's two live calls (`jev-1.13.0`, oneshot research 0.07 / design 0.07 skipped, full research 0.72 / design 0.94 kept); no key is present in this session, so it was not re-run. (e) `scripts/validate.mjs:432-451` enforces one `### Execution DAG` with a mermaid fence in four templates and one `### Engineering Work Breakdown` with a fence, a `Critical path:` line, and the exact four-column header in two; `validate.mjs` runs green inside `npm test`. The live-probe cleanup rule holds: `archon workflow status --json` lists only the `delivery-tail-review` run driving this phase, and the scratch repository this review created for its own Archon probe was removed.

## Change Profile

- intent and expected behavior: replace `delivery-start`'s one-time pack pick with a per-boundary judgment. `judge.mjs` gains `compose`; `delivery-decide` is a new one-bash-node block that calls it, derives single-valued `when:` fields, falls back to the canonical full chain, and writes `NN-execution-plan-<slug>.md`; `delivery-adaptive` includes the block at four boundaries; `delivery-start` routes a judged `oneshot`/`lean`/`full`/`prd` there; `create-tdd` and `create-design-discussion` gain `### Execution DAG` (and the TDD templates `### Engineering Work Breakdown`), enforced by the validator.
- change description quality: no pull request exists yet, so there is no body to judge. The 23 commit subjects pass `node scripts/check-commits.mjs origin/main..HEAD` (`ok: 23 subjects`, per the fix round's own receipt) and each product commit names its subsystem (`feat(typed-judgment):`, `feat(delivery-decide):`, `feat(delivery-adaptive):`, `feat(templates):`, `docs(delivery):`, `fix(delivery-decide):`). The changeset carries the user-visible summary a release note needs.
- implementation model and review model: not recorded in the implementation artifacts' frontmatter (they carry `type`, `completed_phase`, `summary` only), so the implementation model is unknown here. Review model: Claude Opus 5.
- changed-line size and logical cohesion: about 2200 added lines committed plus about 445 more in the working tree, across 50 non-artifact files. Well past the ~1000-line split signal, but the split test does not apply: roughly 1500 of those lines are the two mechanically generated `-omp` copies (proven byte-equal to the generator output by `node scripts/build-packs.mjs --check`, asserted inside `npm test`) and the four new fixtures. The hand-written surface is one new command in `judge.mjs` (+94), one new block (200 lines), one new pack (383 lines), a routing change in `delivery-start` (+80 committed, +99 in the working tree), two template sections, one validator check, and the tests. Every part depends on the one before it — the pack cannot exist without the block, the block without the command — so a split would not produce independently mergeable pieces.
- resulting large-file concerns: `delivery-decide.yaml`'s `decide` node is a 160-line bash body that parses JSON with `sed`. That was raised at minor severity in round 18 (ADV-002) and answered with a key-order guard (`tests/judge.test.mjs:312-314` pins `Object.keys(out.phases[0])`), which is the cheapest thing that makes a silent degradation fail a test. No new concern.
- dependency or lockfile changes: none. No `package.json` or lockfile edit in the diff. `judge.mjs` still imports only `node:fs`, `node:path`, `node:url` and the global `fetch`; `evals/compose-probe.mjs` adds `node:child_process`. No new runtime requirement beyond the `node` and `git` the packs already assume.

## Tests Reviewed First

- behavior claimed by tests: `tests/judge.test.mjs:299-325` pins `compose`'s threshold mapping (0.05 skips, 0.21 runs — the bar is `T.no`, 0.2, and "unclear runs it" holds at the boundary), the paired reason, the stdin form, the JSON key order the decide node's `sed` depends on, and that a `type: execution-plan` artifact is excluded from the state. `:327-346` walks all eight committed samples through the stub and asserts each maps to its declared skip set, plus that the sample set carries four of each shape with research and design on the right side. `tests/packs.test.mjs:289-405` runs the decide node's real bash body in five configurations: a confident-no on both `plan` and `outline` still floors `planning` to `plan` (so `implement`'s `until_bash` always has an artifact), `plan` 0.92 beating `outline` 0.39 picks `plan`, a confident-no phase is dimmed and tabled, a second run rewrites the same `NN` rather than renumbering, no key yields the canonical object with `-` in every probability column, a `~` in `skills_dir` reaches the helper, and `INPUTS_VERIFY=false` draws `verify` as not running in both the table and the flowchart. `tests/dispatch.test.mjs:135-187` covers the route/resolve swap from both sides. The four pack fixtures cover every phase on, everything skipped, the prd path with an outline, and the helper unavailable; `skipped` and `prd-path` give a skipped node no stub at all, so `archon workflow test`'s unused-stub error is what would catch a phase that ran anyway.
- missing or misleading coverage: the three `delivery-start` fixtures set `exec-code: false` and stub `resolve`, so Archon never executes `resolve`'s body in any committed check; its only execution is through `tests/dispatch.test.mjs`'s own simulator. That leaves the ref-substitution behavior of `$route.output.gates_plan` (a field name that extends `gates`) unproven by the suite. I probed it directly rather than assume — see Verification Story — and Archon 0.10.1 resolves it correctly, so this is a coverage observation, not a defect. No test was deleted, skipped, marked `only`/`todo`, or loosened anywhere in the diff; the two relaxations verification T1 and T3 record (an `extract-json` stderr `deepEqual` to `match`, and a `gates=none` confirm expectation) are attributed to other tasks' commits on the same branch and are outside this change.

## Five-Axis Assessment

- helper axis-coverage: model `unavailable`, tokens `unavailable` in / `unavailable` out (`TYPESAFE_API_KEY` is not set in this session; the command exits 3)

### Correctness

- assessment and evidence: the threshold rule the task states ("a phase is skipped only when JEV is confident it is unnecessary; unclear runs it") is implemented in the safe direction and proven at the boundary. `PHASES` phrases every question as a necessity test and `judge.mjs:557` maps `p <= T.no ? "skip" : "run"` with `T.no` 0.2, so only a confident *no* removes a phase; `tests/judge.test.mjs:322` asserts 0.21 runs every phase. Every fallback moves the same way: `delivery-decide.yaml:62-64` treats a missing helper, a missing `node`, or any nonzero exit as `judged=""`, and `:99-103` then sets every optional phase `true`; `verdict()` at `:71` defaults a field missing from the JSON to `run`, so a shape change cannot silently skip a phase either. `planning` is floored to `plan` at `:89-95` by comparing the two probabilities against each other rather than thresholding `outline` alone, which is what round 18's CR-001 required and what `tests/packs.test.mjs:289-340` pins in both directions. The `app_test` judgment can only turn a named surface off (`:97`), never name one. `delivery-adaptive.yaml`'s joins carry `trigger_rule: none_failed_min_one_success` wherever a branch can be skipped (`research-done`, `design-done`, `prd-done`, `spec-done`, `plan-done`, `verify-done`, `app-test-done`, `implement-done`, `pr-done`), and a plain `bash:` join sits between every `delivery-decide` include and the include that follows it, which is Archon note 1. Artifact numbering reuses the existing execution-plan file (`:110-118`) per the conventions' iteration rule and forces base 10 on the `NN` prefix. Two suspected defects were chased and rejected: the per-boundary re-judgment reading an already-run phase as unnecessary and dimming it (verification A21's live call with 14 artifact summaries in the state scored research 0.65 and design 0.95, both `run`; `REASONS.covered` exists for a phase another artifact makes redundant, not for a phase's own output), and the `gates_plan` ref colliding with the shorter `gates` (probed against Archon 0.10.1 directly). The one remaining inconsistency is cosmetic and recorded as ADV-001.
- helper coverage: `unavailable`

### Readability and Simplicity

- assessment and evidence: names are precise and the flow is direct. The decide node emits its phases from one fixed list twice (`node_line` for the flowchart, `row` for the table) so the two views cannot disagree, and the `classDef skipped` loop at `:188-190` reads the same `runs_for()` the table does. `check_gates`/`check_names` in `route` are named for what they are — a translated copy used only for validation — and the comment above them states why `route.output.gates` itself must stay untranslated. The `plan`/`outline` fan-out in the flowchart carries a comment explaining that the two are siblings under complementary `when:` guards rather than a chain. The `$INPUTS_X:-$INPUTS.x` pattern matches every other block. Two comments are now stale relative to the code they describe (ADV-002). No dead code, no abstraction added for one caller, no unnecessary indirection.
- helper coverage: `unavailable`

### Architecture

- assessment and evidence: ownership is placed correctly. The judgment lives in `judge.mjs` beside every other typed judgment and reuses `noul`/`choice`/`systemOne`; `INVOLVEMENT` is lifted out of `autonomy()` so `compose` and `autonomy` answer the same question with the same criteria rather than drifting. The boundary logic lives in a composable block included four times, not copied four times, and round 19's ADV-002 fix removed the four duplicate `tiers:` lines so the Model tier column holds by construction. `delivery-adaptive` is a new pack rather than a mode flag on `delivery-full`, which is right: Archon cannot reorder a static DAG, and the existing packs stay reachable through `--input workflow=` and a reject text. `delivery-start` gains one field (`pack`) distinct from `workflow` so `task.md` still records the judged pack — the deviation the plan flagged for human review, and the one that keeps the conventions' `workflow` vocabulary intact. `compose` reading a task directory extends what `plan-remaining` already does (read a named artifact from disk), not a new responsibility. `scripts/validate.mjs`'s check 6b is a separate loop from the shared human-review loop because its template lists are subsets, which the comment states.
- helper coverage: `unavailable`

### Security

- assessment and evidence: nothing crosses a new trust boundary. `composeState` sends only `task.md` (the user's own request) and each artifact's `type` and frontmatter `summary` — never a body, never repository code, never a diff — which is exactly what the conventions' "Typed judgments" rule permits; `tests/judge.test.mjs:317-319` pins the state shape to `{file, type, summary}`. No secret is read or logged: `TYPESAFE_API_KEY` is read once in `systemOne` and never printed, and the decide node discards the helper's stderr. `TooLarge` (the `max_tokens_exceeded` case) inherits `Unavailable`, so an oversized state exits 3 and the node falls back to the full chain rather than to a partial judgment. No shell interpolation of untrusted text: the decide node splices no argument into a command, `$dir` comes from a pack input, and the artifact's frontmatter values are drawn from a fixed vocabulary. `pr-done`'s `GIT_TERMINAL_PROMPT=0` on the fallback push is unchanged from the other packs. No new dependency, no new network endpoint.
- helper coverage: `unavailable`

### Performance

- assessment and evidence: one HTTP round trip per boundary, four per run. `compose` packs 8 nouls, 8 paired reason choices, and the autonomy choice into a single `systemOne` call rather than 17 calls — the design note at `judge.mjs:486-489` states this is what the paired-choice shape buys. `composeState` reads each artifact file once and regexes only its frontmatter; with this task's own 22 artifacts (the largest 68 KB) that is a few hundred KB per decide node, against a 20-second call budget. No loop, no query, no allocation on a hot path; the four `decide-*` nodes are on the run's critical path but each is one call the phase that follows it dwarfs. `evals/compose-probe.mjs` is one call per sample and is deliberately excluded from `npm test`.
- helper coverage: `unavailable`

## Verification Story

- command or inspection: `npm test`
- result: exit 0, `tests 72 / suites 3 / pass 72 / fail 0`, including "archon: every pack loads without warnings and dry-runs gated and unattended to its final join", "archon: every declared fixture passes under `workflow test`", "the committed Oh My Pi flavor is exactly what the generator produces from the native packs", and the three new `decide node:` tests. Run against the current working tree, so it covers the uncommitted third fix round.
- command or inspection: the decide node's real bash body, extracted the way `tests/packs.test.mjs` extracts it and run against a local TypeSafe stub with `research` and `outline` answered 0.05 and everything else 0.9
- result: exit 0; the flowchart carried `class research skipped`, `class outline skipped`, `class app_test skipped` and the eleven-row table rendered with probabilities, `<= 0.20` bars, reasons, and tiers. This is how ADV-001 was found: with the default `app_test=none` and a judgment above the bar, the row reads `| app test | no | - | 0.9 | <= 0.20 | ... |`.
- command or inspection: a throwaway two-node Archon workflow in a scratch git repository, run with `archon workflow run refprobe --dry-run --exec-code --json`, whose first node returns `{gates, gates_plan, pack}` and whose second node reads all three
- result: `resolvedText` was `gates='outline'\ngates_plan='true'\npack='adaptive'` and the output `gates=[outline] gates_plan=[true] pack=[adaptive]`. Archon 0.10.1 does not truncate the longer field name, so `resolve`'s `gates_plan=$route.output.gates_plan` is safe even though no committed fixture executes it. The scratch repository was removed and `archon workflow status --json` lists only the `delivery-tail-review` run driving this phase.
- command or inspection: `diff` of each paired template (`create-tdd`/`iterate-tdd`, `create-design-discussion`/`iterate-design-discussion`), `grep` of the seven answer templates for the `### Execution DAG` Check bullet, and the fixture count `docs/testing.md` now claims
- result: both template pairs are byte-identical; seven answer templates carry the bullet; `node -e '...readdirSync(".archon/workflows/delivery",{recursive:true})...'` returns `54`, matching the updated prose.
- manual, screenshot, or before-and-after evidence: not applicable; no interface changes. The change's only rendered surface is the Mermaid flowchart in the generated artifact, which was read in full from the probe above.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 The app-test row shows a run-verdict probability beside `Runs: no`

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `.archon/workflows/delivery/decide/delivery-decide.yaml:135` and `:151-156`
- evidence: `app_test` is in `judged_ids`, so `row()` always prints its probability and bar, but `runs_for app_test` answers from the derived `$app_test`, which `:97` forces to `none` whenever the pack's `app_test` input is `none` — the default. With the helper available and the judgment above the bar, the artifact reads `| app test | no | - | 0.9 | <= 0.20 | What this phase establishes is still open | large`, and the flowchart dims `app_test` for the same reason. Reproduced in this session by running the node's bash against a stub answering 0.9 with `INPUTS_APP_TEST=none`. Round 16's ADV-005 named the neighbouring helper-unavailable case, where the columns are `-` and no number contradicts the verdict; this is the case where a reader sees a number that says the opposite of the `Runs` column and no indication that `--input app_test=none`, not the judgment, is what turned the phase off. `plan` has the same shape under the floor rule, and `tests/packs.test.mjs:308` already pins it, so the pattern is accepted — but `plan`'s contradiction only appears when both planning probabilities are a confident no, while this one appears on a default-input run.
- suggestion: print `-` in the `p` and `Bar` columns for a phase an input turned off rather than the judgment, or add a `Gates requested:`-style line naming the `app_test` input beside it so the two causes are distinguishable.

### ADV-002 Two comments describe behavior the code no longer has

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/typed-judgment/judge.mjs:489`; `skills/delivery/create-tdd/references/tdd_template.md:95` (and its `iterate-tdd` twin)
- evidence: `judge.mjs:489` says "the reason for a phase that runs is computed and discarded", but `compose()` returns `reason` for every row and `delivery-decide.yaml:154` prints it in the `Why` column for every judged phase, running or skipped — which is why `REASONS` carries `open` ("What this phase establishes is still open"), a run reason. A reader trusting the comment would expect the `Why` column to be empty on running phases. Separately, the `### Execution DAG` instruction in both TDD templates tells the writer to produce "no flowchart and no probabilities" when the task directory holds no execution-plan artifact, while `scripts/validate.mjs:437-440` requires a mermaid fence inside that section; the two do not actually conflict (the validator checks templates, not written artifacts) but the instruction reads as contradicting the example directly beneath it.
- suggestion: reword `judge.mjs:489` to say the reason is recorded for every phase and the single round trip is what the paired shape buys; add a clause to the template instruction noting that the fence below is the template's own example, kept for the validator.

### ADV-003 `compose-probe --json` writes prose rows and JSON to the same stream

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `evals/compose-probe.mjs:72-75`
- evidence: the per-sample line (`${sample.id} ${sample.shape} ... -> pass`) and any `mismatch:` lines go to stdout unconditionally, then `--json` appends the JSON array to the same stream. A consumer piping to `jq` gets a parse error on the first line; verification A15 worked around it with `--json >/dev/null`, which discards the JSON too.
- suggestion: send the human rows to stderr when `--json` is set, or suppress them entirely, so stdout is one parseable document.

### ADV-004 The new create-plan work-item rule has no clause for a TDD without the section

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/create-plan/SKILL.md:42`
- evidence: the bullet says "When the primary input is a TDD, map each `## Phase N` to work-item ids from its `### Engineering Work Breakdown` table". Any TDD written before this change carries no such section, and `create-plan/references/plan_template.md` has no `**Work items**:` line for the rule to fill. Every other section instruction added by this change carries an explicit fallback ("when none exists, describe the fixed chain of `task.md`'s `workflow` value"); this one does not, so the skill has no stated behavior for the case.
- suggestion: add the matching clause — when the TDD carries no work breakdown, omit the `**Work items**` line — so the rule reads the same way as its siblings.

## Dead Code and Dependency Review

- newly orphaned code: none. `delivery-full`, `delivery-lean`, `delivery-oneshot`, and `delivery-prd` stay reachable through `--input workflow=<name>` and a `confirm` reject text, which `delivery-start.yaml:229-247` preserves deliberately and `tests/dispatch.test.mjs:169-187` asserts; the `explicit-bugfix` fixture and the pack rows in `workflows/delivery.md` and `docs/cheatsheet.md` keep them documented. `create-structure-outline` and `implement-outline` stay reachable through `planning=outline`, which the `prd-path` fixture exercises. `route.output.explicit` is consumed only inside `route` itself now that `resolve` reads `route.output.pack`, but it remains in `output_format.required` and in the three fixtures' stubs, so it is an unconsumed output field, not dead code — the same disposition round 19 recorded for the decide node's `autonomy` and `available`. Nothing in the diff removes a caller without removing its callee.
- dependency findings: no `package.json`, lockfile, or vendored dependency change. No new import beyond `node:child_process` in the new eval script. Nothing to check for maintenance, license, or advisories.

## Verdict

- decision: approve
- overall code-health change: improved. The change adds a judgment where a fixed choice was, and every path it adds fails toward more work rather than less: no key, no `node`, a nonzero exit, a missing JSON field, or an oversized request all produce the canonical full chain. The new surface arrives with its own tests at three levels — unit tests against a stub, the block's real bash body against a stub, and four pack fixtures whose absent stubs are what prove a phase was skipped — plus a committed sample set and a live probe for tuning the question wording. The documentation change is proportionate: the pack and block tables, the cheatsheet, the conventions' artifact rule, and `docs/testing.md`'s fixture count all move together, and the fixture count was re-counted here rather than taken on trust.
- rationale: the previous round's two findings are fixed and confirmed against the diff, not against the fix round's account of it. Both defects I suspected on my own reading were chased to evidence and rejected — one against a live call already recorded in verification, one against a scratch Archon run I made in this session. The four advisories are documentation clarity and one cosmetic column, none of which changes what the pack does.

## Review Limits

- blocked or unavailable checks: `TYPESAFE_API_KEY` is not set in this session, so `judge.mjs axis-coverage` could not run and the five axis-coverage lines read `unavailable`; those judgments were skipped and each axis was decided by my own reading against the pinned scope. The same absence means acceptance item (d), the live `compose` probe, was not re-run here; it rests on verification A4 and A21, which record the model version, the request text, and the per-phase probabilities.
- residual manual verification: two verification items stay `untested` and are unchanged by this round — A20, whether the eight committed samples in `tests/fixtures/compose-samples.json` are the right eight to tune the phase wording against, which is a judgment about the samples rather than about the code; and A22, a live default-input `delivery-adaptive` run reaching the installed helper, which needs `node scripts/install.mjs` to overwrite the user's `~/.agents/skills`. Separately, `resolve`'s bash body is executed by no committed Archon fixture (all three `delivery-start` fixtures stub it with `exec-code: false`); I probed the one substitution behavior that depended on the engine and it holds, but a fixture with `exec-code: true` would make that guarantee permanent rather than point-in-time.
