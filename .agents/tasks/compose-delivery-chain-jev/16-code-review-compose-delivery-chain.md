---
type: code-review
date: 2026-09-18
branch: compose-delivery-chain-jev
base_branch: main
base_sha: 3fafa2513a9a2073978bdcc4592b1127ffcae9c7
head_sha: 7b0ba47f4f093443ef04a9266af3c9d662864e17
status: findings
summary: "Reviewed the whole branch against `main` (66 non-artifact files, +2459/-176): the `compose` command, the `delivery-decide` block, the `delivery-adaptive` pack and its `delivery-start` routing, the two template sections and their validator, the documentation, and the two earlier tasks' commits that ride on this branch. `npm test` is green at 67 of 67 and `archon workflow test delivery-adaptive` passes 4 of 4, but three findings gate: a `planning=none` judgment leaves `delivery-implement` with no plan or outline artifact, so its `until_bash` can never exit 0 and the run burns its sixteen iterations; the execution-plan flowchart draws `plan --> outline` as a dependency between two mutually exclusive alternatives; and the branch's headline user-visible change ships with no `.changeset/` entry, which `README.md:89` requires. The next phase fixes all three; the first needs a `when:` or a planning floor plus a fixture, because a dry run never executes `until_bash` and no existing test reaches that state."
---

# Code Review

## Scope

- merge base: `3fafa2513a9a2073978bdcc4592b1127ffcae9c7` (`git merge-base main HEAD`; no pull request for this branch, no `base:` in `task.md`, so the repository default branch `main` from `refs/remotes/origin/HEAD`)
- reviewed HEAD: `7b0ba47f4f093443ef04a9266af3c9d662864e17`
- commits: 45 after the merge base. This task's code commits are `b398245`, `48fb9f3`, `cdd1557`, `8be2bc3`, `fc1e9d9`, `37a8028`; the rest are `docs(task):` artifact commits plus two earlier tasks' work committed on the same branch (`i-m-curious-what`: `56474a9`, `f697e4c`, `ae91316`, `d304a75`, `518d77f`, `85b45b0`, `f9114bf`; `describe-pr-title-rule`: `ace2bcb`, `1907fa5`).
- staged and unstaged changes: none; `git status --short --branch` shows only `## compose-delivery-chain-jev` and the untracked `.ignore`.
- task-owned untracked files: none.
- excluded changes: everything under `.agents/tasks/` (31 artifact files, +4583) is a review input, not a review subject. The untracked `.ignore` is unrelated and predates the session. The whole diff is 97 files, +7042/-176; the reviewed subject is the 66 files outside `.agents/tasks/`, +2459/-176.

## Previous Round

`None.` The task directory holds no earlier `NN-code-review-*.md`; `15-verification-compose-delivery-chain.md` is the newest artifact and this is the first review round.

## Requirements and Standards

- task or ticket: `.agents/tasks/compose-delivery-chain-jev/task.md`, two deliverables (per-boundary JEV composition with a `delivery-adaptive` pack; the drawn execution DAG and its embedding in the tdd and design-discussion templates) and five acceptance criteria plus the probe-cleanup rule.
- implementation source: `04-plan-compose-delivery-chain.md` (newest `plan`), six phases; receipts `05` through `14`; `15-verification-compose-delivery-chain.md` (`status: passed`, 22 items, 20 `pass`, `A20` and `A22` `untested`, no findings).
- repository instructions: `shared/CONVENTIONS.md` (artifact naming and the new `execution-plan` type, join-commit phase words, Conventional Commits subject rule), `README.md:89` (a user-visible change adds a file under `.changeset/`), `workflows/delivery.md` (pack and block tables, the floor-and-direction rule, Archon notes 1 through 4), `docs/testing.md` (fixture and pack-test conventions).

## Change Profile

- intent and expected behavior: replace the one-time pack choice with a `compose` judgment re-asked at four boundaries inside a new `delivery-adaptive` pack, and write the composed chain into a new `NN-execution-plan-<slug>.md` artifact that a required `### Execution DAG` section in the tdd and design-discussion templates embeds.
- change description quality: the six phase receipts and the verification artifact are specific, name their commands, and record their own limits, including the two probe samples that never reached the bar and the per-boundary collapse that does not happen. Commit subjects follow the conventions; `node scripts/check-commits.mjs 3fafa25..HEAD` accepts all 44.
- implementation and review model: implementation by `agent-implementer` child workers per receipts `05` through `08` and inline for `11` through `14`; grading model `jev-1.13.0` per `15`. This review: Opus 5, with the `axis-coverage` helper reported below.
- changed-line size and logical cohesion: +2459/-176 over 66 files outside the task directory. Coherent: one new command, one new block, one new pack with its fixtures, one validator check, and the documentation for each. Above the ~1000-line "check the split" signal but the phases are sequential dependencies (the pack cannot exist without the block, the block without the command), so a split would not have produced independently mergeable branches. The 12 `-omp` files are generated and byte-verified by `build-packs --check`.
- resulting large-file concerns: `judge.mjs` grows from ~570 to ~714 lines and now holds 20 commands; `delivery-adaptive.yaml` is 383 lines of 31 nodes. Both stay within the shapes their neighbours already use.
- dependency or lockfile changes: none. No `package.json` or lockfile edit in the diff.

## Tests Reviewed First

- behavior claimed by tests: `tests/judge.test.mjs` adds two `compose` tests — the bar mapping (`0.05` skips, `0.21` runs, `bar` is `0.2`), the paired reason choice, `composeState` reading `task.md` plus one `{file, type, summary}` per artifact, the stdin form with no artifacts, and every one of the eight `compose-samples.json` entries mapped through the stub to its declared skip set — plus the `axis-coverage` levels and the retry/`TooLarge`/provenance suite from the other task. `tests/packs.test.mjs` adds `runDecideNode`, which extracts the decide node's real bash body and runs it under real bash in four cases: a confident-no phase reading `false` with the dimmed flowchart and the `0.05 / <= 0.20` row, the second run rewriting the same `NN` instead of renumbering, the no-key canonical object with `-` in every probability column, and a `~`-prefixed `skills_dir` reaching the helper. `tests/dispatch.test.mjs` adds the `pack` field, explicit pinning, and the judged-lean `outline` → `plan` gate rewrite. Five new pack fixtures prove the all-phases, skipped, prd-outline and helper-unavailable branches, and `delivery-decide` on its own.
- missing or misleading coverage: the `planning=none` state has no test at any level, and the decide-node test comment says so explicitly ("`planning` resolves to `plan` (not `outline`) without any ambiguity between the two"). No adaptive fixture stubs `planning: none`, and a fixture could not catch its consequence anyway: I ran `archon workflow run delivery-adaptive --dry-run --stubs <planning=none>` and the trace reports `implement__phases-auto -> assumed complete after 1 iteration(s) — 'until_bash' is not executed in a dry run`. The loop-termination defect in CR-001 is invisible to `archon workflow test` by construction; only a direct `until_bash` test like the existing `implement until_bash` case can reach it. `evals/compose-probe.mjs` scores only `research` and `design` (`WATCH`, `evals/compose-probe.mjs:36`), so the `plan` probability the whole `planning` derivation hangs on is printed but never asserted, live or stubbed.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 9990 in / 73 out (one run; no axis came back `skipped` or `asserted`, so no second pass was needed)

### Correctness

- assessment and evidence: The judged-to-`when:` path is sound in every state the tests reach. `verdict()` defaults an absent field to `run` and `tf()` maps only the literal `skip` to `false` (`delivery-decide.yaml:63-65`), so a shape change in the helper's JSON falls back to running the phase rather than skipping it; the no-key branch (`:82-88`) sets every phase `true`; `10#$max` guards the octal trap on an `08` prefix (`:98`). `app_test` can only be turned off, never named (`:80`), matching the pack's stated rule. `delivery-start`'s `resolve` rewrites the judged `lean` `outline` gate to `plan` with a portable token loop rather than `sed \b` (`delivery-start.yaml:205-212`), and `explicit` correctly covers both `--input workflow=` and a reject text that names a pack (`:196-197`). Two states break. First, `planning=none` (`delivery-decide.yaml:78`) leaves `implement_skill=implement-plan` (`:91`) and the `implement` node has no `when:` (`delivery-adaptive.yaml:284-292`), while `delivery-implement`'s `until_bash` begins `test -n "$plan" || exit 1` in both twins (`delivery-implement.yaml:57`, `:231`) — with neither a plan nor an outline artifact written, the loop can never exit 0; CR-001. Second, the generated flowchart's single edge chain (`delivery-decide.yaml:163`) asserts `plan --> outline`, which no pack edge matches; CR-002. Everything else I probed held: I regenerated an artifact from the extracted decide body with no key and it produced the documented frontmatter, `class outline skipped`, `Gates requested: all`, and an eleven-row table.
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: The decide node is one 130-line bash body doing four jobs (call, derive, draw, print), but the split the plan chose — a fixed `judged_ids` list feeding both `node_line`/`row` emitters so "the flowchart and the table cannot disagree" (`delivery-decide.yaml:120-152`) — is the right one and the comments carry the reasons rather than restating the code. `judge.mjs`'s `compose()` reuses the `sizeChildren` noul-plus-paired-choice shape verbatim, and lifting `INVOLVEMENT` out of `autonomy()` into a module constant removed a duplicated criteria object rather than adding an abstraction. `PHASES` and `PHASE_CRITERIA` carry why each wording is a necessity test and which samples measure it. The one readability cost is the `sed`-based JSON parsing (`field`/`prob`/`why`, `:57-59`), which reads position-dependently against `JSON.stringify`'s key order while `delivery-implement`'s `next-phase` already parses the same helper's JSON with `node -e`; ADV-002. `tdd_template.md`'s work-breakdown example is this very task's work items (`w1 compose command`, `w3 delivery-decide block`), which reads as leftover scaffolding in a template every future TDD copies; ADV-004. No dead code: every new function in `judge.mjs` is reached from `compose`, `axisCoverage`, or `main`'s switch, and every new pack node appears in at least one fixture's `reached` list except the `planning=none` branch, which has no reachable state to list.
- helper coverage: covered, level 3, confidence 1.00

### Architecture

- assessment and evidence: Ownership is clean. The threshold lives in the helper (`T.no`, `judge.mjs:41`), the derivation of `when:`-comparable fields lives in the block, and the pack holds only wiring — which is what lets `delivery-decide` be included four times instead of the body being inlined. `delivery-start` gains `pack` as a field distinct from `workflow` so `task.md` keeps recording the judged pack while routing sends the run to `adaptive` (`delivery-start.yaml:200-203`, `:242`); that is the smaller change than teaching `delivery-task` about a pack it must not name. `bugfix` and `epic` stay fixed packs as the task requires. The four Archon workarounds are respected: a plain bash join between every `delivery-decide` include and the include after it (note 1), `trigger_rule: none_failed_min_one_success` on every join that follows a guarded node, and `plan`/`outline` as top-level sibling twins rather than one branching node (note 2). Where the architecture breaks down is the boundary between the judgment and `delivery-implement`: the pack composes phases but never tells the implement block which artifact to expect, so `planning=none` is a state the block's contract cannot express, which is the structural half of CR-001. `workflows/delivery.md`'s new floor-and-direction rule states the invariant `compose` is meant to hold — "may only remove a phase ... a wrong answer costs at most extra caution and never a skipped check" — and `planning=none` is the one removal that violates it.
- helper coverage: covered, level 3, confidence 0.99

### Security

- assessment and evidence: Nothing in the change widens a trust boundary. `judge.mjs` still sends only the named text: `composeState` puts `task.md` and per-artifact `{file, type, summary}` in the state (`judge.mjs:521-530`) and no repository code, diff, or environment value, which is the rule `typed-judgment/SKILL.md` states. The API key is read from the environment and used only as a bearer header; the `request` object is built once and reused across retry attempts, so no credential is re-serialised or logged. The new stderr provenance line prints the model and token counts only, never the key or the state. In the decide node every expansion is quoted (`"$dir"`, `"$judge"`, `"$file"`), the `sed` patterns interpolate only the fixed phase names from `judged_ids`, and the values written into the artifact come from the closed `REASONS` set and `[a-z]*`/`[0-9.]*` captures rather than free text, so a helper response cannot inject markdown or shell through `why()` or `prob()`. `delivery-start`'s gate-name loop validates every token against a fixed `names` list and exits 1 on an unknown one (`delivery-start.yaml:216-223`). `pr-done`'s push is unchanged from the other packs and still uses `GIT_TERMINAL_PROMPT=0`. No secret, credential, or authorization path is touched by the diff.
- helper coverage: covered, level 3, confidence 1.00

### Performance

- assessment and evidence: `compose` answers all seventeen questions (eight `noul`, eight paired `choice`, one `autonomy` `choice`) in a single `systemOne` call (`judge.mjs:537-545`), which is the point of computing and discarding the reason for a phase that runs; four boundaries therefore cost four round trips per run, not thirty-four. The new retry path is bounded twice over — `JUDGE_RETRIES` attempts and the existing `JUDGE_TIMEOUT` `AbortController`, with `retryAfter` capped at 5s and `wait()` resolving early on abort (`judge.mjs:64-74`) — so a rate-limited service cannot stretch a decide node past the 20s deadline. The decide node's shell work is eleven `printf`-driven rows and a handful of `sed` passes over one JSON line; nothing loops over the repository. The one real cost is intended and measured elsewhere: the state grows with every artifact, and receipt `11` and verification `A21` record that at 14 summaries the call still answers (the `TooLarge` branch, `judge.mjs:53`, degrades it to exit 3 and the canonical chain rather than a hang). CR-001's failure is a performance cost as well as a correctness one — sixteen `model: large` sessions, each a fresh context, with nothing to implement.
- helper coverage: covered, level 3, confidence 0.97

## Verification Story

- command or inspection: `npm test`; `archon workflow test delivery-adaptive`; `archon workflow run delivery-adaptive --dry-run --json --stubs <planning=none> --input gates=none` from the repository root; the decide node's bash body extracted with the same regex `tests/packs.test.mjs` uses and run with no key against a scratch task directory; `node scripts/check-commits.mjs 3fafa25..HEAD`; reads of `delivery-adaptive.yaml`, `delivery-decide.yaml`, `delivery-implement.yaml`, `delivery-start.yaml`, `judge.mjs`, `validate.mjs`, the four templates, and every new fixture.
- result: `npm test` exit 0, `tests 67 / pass 67 / fail 0`, `ok: 41 skills, 54 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, 0 banned tokens`. `archon workflow test delivery-adaptive`: `4 passed, 0 failed`. The `planning=none` dry run: `outcome completed`, `missingStubs []`, `unusedStubs []`, and the trace shows `plan__cycle`, `plan__once`, `outline__cycle`, `outline__once` all `when_condition_false` while `implement__phases-auto` runs, marked `assumed complete after 1 iteration(s) — 'until_bash' is not executed in a dry run`. The extracted decide body with no key wrote a well-formed `01-execution-plan-demo.md` whose flowchart line is `research --> design --> prd --> tdd --> plan --> outline --> implement --> verify --> app_test --> review --> pr`.
- manual, screenshot, or before-and-after evidence: no interface change; the artifact this change generates was rendered and read rather than screenshotted. The scratch repositories and the temporary stub file created for the two probes above were removed; `git status --short` shows only the pre-existing untracked `.ignore`, and `archon workflow status` lists no run this review started.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 A confident-no `plan` judgment strands the implementation loop for sixteen sessions

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `.archon/workflows/delivery/decide/delivery-decide.yaml:78`, `.archon/workflows/delivery/adaptive/delivery-adaptive.yaml:284`
- failure mode: When `compose` scores the `plan` phase at or below `T.no`, the decide node sets `planning=none` and leaves `implement_skill=implement-plan` (`delivery-decide.yaml:78`, `:91`). Both `plan` and `outline` are then skipped by their `when:` guards, but `implement` carries no `when:` at all, so `delivery-implement` runs with no plan and no outline artifact in the task directory. Both of its `until_bash` twins open with `plan=$(ls -1 .../??-plan-*.md .../??-structure-outline-*.md ...); test -n "$plan" || exit 1` (`delivery-implement.yaml:57`, `:231`), and a non-zero exit means "not done". The loop therefore can never terminate on its own condition: it runs its full `max_iterations: 16`, each a `context: fresh`, `model: large` session told to "implement the first incomplete phase of the newest plan or outline" when none exists, and ends exhausted rather than complete. This is the same failure the design discussion records as the cost of run `bac80b17` ("the loop ran sixteen no-op sessions and failed"), and it contradicts the floor-and-direction rule this change adds to `workflows/delivery.md`, that `compose` "may only remove a phase" and "a wrong answer costs at most extra caution and never a skipped check".
- evidence or reproduction: `planning=none` is not a hypothetical branch. It is coded at `delivery-decide.yaml:78`, and `tests/fixtures/compose-samples.json` names `plan` and `outline` in the expected skip set of all four oneshot-shaped samples (lines 6, 9, 12, 15) — the shape `delivery-start` now routes to this pack (`delivery-start.yaml:200-203`). Dry run with `planning: "none"` stubbed at all four boundaries, from the repository root: `outcome completed`, `missingStubs []`, trace `plan__cycle -> when_condition_false`, `plan__once -> when_condition_false`, `outline__cycle -> when_condition_false`, `outline__once -> when_condition_false`, `implement__phases-auto -> assumed complete after 1 iteration(s) — 'until_bash' is not executed in a dry run`. That last line is why no fixture can catch this: `archon workflow test` never runs the loop condition. Running the condition directly against a directory holding only `task.md` exits 1. No test or fixture on the branch reaches `planning=none`; `tests/packs.test.mjs:289` states the decide-node case was built so "`planning` resolves to `plan` (not `outline`) without any ambiguity", and `evals/compose-probe.mjs:36` watches only `research` and `design`, so the `plan` probability is never asserted live either. The plan's own justification for leaving `implement` unguarded — "with `planning == none` no plan artifact exists and `implement-plan` reads `task.md`, which is what `delivery-oneshot` already does (`delivery-oneshot.yaml:77`)" (`04-plan:537`) — does not transfer: `delivery-oneshot.yaml:77` is a single plain `prompt:` node with no loop, while `delivery-adaptive` reaches the same work through `include: delivery-implement`, whose loop requires the artifact.
- fix direction: Give `planning` a floor in the decide node — derive `plan` when neither `plan` nor `outline` runs, so the canonical chain stays the floor the same way every other field does — or, if a planless run is wanted, guard `implement` and add the oneshot-style single-session branch beside it. Either way the state needs a test that runs `until_bash`, not only a fixture: extend the existing `implement until_bash` case in `tests/packs.test.mjs` with a task directory that holds no plan or outline, and add a `planning: none` adaptive fixture so the node-level wiring is pinned too.

### CR-002 The execution-plan flowchart draws a dependency between two mutually exclusive phases

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `.archon/workflows/delivery/decide/delivery-decide.yaml:163`
- failure mode: The flowchart is emitted as one linear chain, `research --> design --> prd --> tdd --> plan --> outline --> implement --> verify --> app_test --> review --> pr`. In the pack, `plan` and `outline` are siblings: both depend on `decide-design-done` and both feed `plan-done`, under complementary `when:` guards, so exactly one of them ever runs and neither can depend on the other (`delivery-adaptive.yaml:236-263`). The drawn edge `plan --> outline` states a dependency that does not exist and cannot exist. An engineer reading the artifact — which is the whole of deliverable 2, and which the `### Execution DAG` section of every design discussion and TDD now embeds — is shown a chain where the structure outline follows the plan, when the two are alternatives. `task.md:15` asks for "dependencies as edges" and "parallel work shown side by side"; the branch point the judgment actually produces is the one place the drawing diverges from the DAG.
- evidence or reproduction: I extracted the decide node's bash body with the same regex `tests/packs.test.mjs:177` uses and ran it with no key against a scratch task directory. The generated `01-execution-plan-demo.md` contains `class outline skipped` followed by the chain above, so `outline` is dimmed but still sits on the edge between `plan` and `implement`. With `planning=outline` the roles swap and the chain reads `plan --> outline` with `plan` dimmed; with `planning=none` both are dimmed and the chain still connects `tdd` through them to `implement`. The pack's own edges disagree: `grep -n "depends_on: \[decide-design-done\]"` matches both `plan` (`:239`) and `outline` (`:250`), and `plan-done` (`:259`) lists `[decide-design-done, plan, outline]`.
- fix direction: Emit the branch instead of the chain. Split the single `printf` at `:163` into the linear prefix (`research --> design --> prd --> tdd`), the fan-out and fan-in for the alternatives (`tdd --> plan`, `tdd --> outline`, `plan --> implement`, `outline --> implement`), and the linear suffix (`implement --> verify --> app_test --> review --> pr`). The fixed-list emitters above it already keep the flowchart and the table in step, so only the edge line changes. Extend the `decide node` test in `tests/packs.test.mjs` to assert the two fan-out edges, which is what pins the shape against the next edit.

### CR-003 The branch's headline user-visible change ships with no changeset

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `.changeset/`
- failure mode: `README.md:89` states the rule: "A user-visible change adds a file under `.changeset/`". The branch adds three changesets — `confirm-when-unsure.md`, `describe-pr-title-rule.md`, `review-loop-judgment.md` — and all three belong to the two earlier tasks committed on this branch. This task's work has none, and it is the largest and most user-visible change on the branch: a new pack (`delivery-adaptive`), a new `judge.mjs` command (`compose`), a new block (`delivery-decide`), a new artifact type (`execution-plan`), a routing change that sends every judged `oneshot`/`lean`/`full`/`prd` run somewhere new, and two template sections the validator now requires of anyone writing a TDD or a design discussion. The `Release` workflow versions and publishes from `.changeset/` only, so `v<version>` would ship all of that with a changelog that mentions none of it, and the required-section change would reach users as an unannounced validator failure.
- evidence or reproduction: `ls .changeset/` lists `README.md`, `config.json`, and seven entries; `deliver-starts-run.md`, `deliver-starts-the-run.md`, `research-questions-names-artifact.md` and `task-worktree-by-default.md` predate the merge base, and `git diff --name-status main...HEAD -- .changeset/` shows exactly the three added files, whose bodies describe `delivery-start`'s confirm change, `describe-pr`'s title rule, and the typed-judgment retry/axis-coverage work. None mentions `compose`, `delivery-adaptive`, `delivery-decide`, `execution-plan`, or the two template sections. `.changeset/config.json` sets `"privatePackages": {"version": true, "tag": true}` and `.github/workflows/release.yml:30` runs `changesets/action@v1`, so the file is the only input to the release notes.
- fix direction: Add one `.changeset/*.md` for this task, `minor` (new pack, new command, new required template sections, changed default routing), naming the four things a user notices: judged `oneshot`/`lean`/`full`/`prd` runs now go to `delivery-adaptive`, the optional phases are re-judged at four boundaries, each boundary writes `NN-execution-plan-<slug>.md`, and the tdd and design-discussion templates now require `### Execution DAG` (and the tdd `### Engineering Work Breakdown`).

## Advisories

### ADV-001 A judged oneshot or lean run loses the planning gate the adaptive chain can now need

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `.archon/workflows/delivery/start/delivery-start.yaml:193-212`
- evidence: `route` maps the `plan` autonomy level to the *judged* pack's planning gates — `oneshot` gets `pr`, which is correct for `delivery-oneshot` because it has no plan phase. `resolve` then sends the run to `adaptive` and resets `names` to `design prd tdd plan phases pr` but leaves `gates` as `pr`. A request that says "review the plan first" and reads as oneshot-shaped therefore reaches a pack that may well decide the task needs a plan or a design discussion, with `$gates.output.plan` and `$gates.output.design` both `false`, so those phases run unattended. The `lean` case is handled — its `outline` token is rewritten to `plan` (`:205-212`) — which shows the mapping was considered for one pack and not the others.
- suggestion: When `pack` becomes `adaptive` and `gates` came from the `plan` autonomy level, use the adaptive pack's own planning gate set (`design,prd,tdd,plan`) rather than the judged pack's, the same way the `lean` token rewrite already does. `tests/dispatch.test.mjs` already has the judged-lean case to extend.

### ADV-002 The decide node parses the helper's JSON by key order with `sed`

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `.archon/workflows/delivery/decide/delivery-decide.yaml:57-59`
- evidence: `prob()` matches `"phase":"$1","verdict":"[a-z]*","probability":\([0-9.]*\)`, which only works because `compose()` builds its row object in exactly that order (`judge.mjs:540`). Reordering those keys — a change with no other consequence — makes `prob()` return empty, and the artifact's `p` and `Bar` columns silently fall back to `-` while every verdict keeps working, so no test fails. `why()` is similarly positional. `delivery-implement`'s `next-phase` already parses the same helper's JSON with a `node -e` one-liner (`delivery-implement.yaml:119`), and `node` is proven present at this point in the body because the `compose` call just used it.
- suggestion: Read the fields with `node -e` the way `next-phase` does, or, if the shell parsing is worth keeping, add an assertion to the `compose` test that pins the row key order the decide node depends on.

### ADV-003 The README pack list omits `delivery-adaptive`

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `README.md:65`
- evidence: The line enumerates `delivery-full`, `delivery-lean`, `delivery-prd`, `delivery-oneshot`, `delivery-bugfix`, `delivery-epic`, `delivery-resolve-reviews`. `workflows/delivery.md` and `docs/cheatsheet.md` both gained the new pack, and `README.md:67` was edited in the same change for the confirm behavior, so this list was in the diff's neighbourhood and was passed over.
- suggestion: Add `delivery-adaptive` to the list.

### ADV-004 The work-breakdown template's example is this task's own work items

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/create-tdd/references/tdd_template.md:70-88` (and the identical block in `iterate-tdd`)
- evidence: The `### Engineering Work Breakdown` example names `w1 compose command`, `w2 compose unit tests`, `w3 delivery-decide block`, `w4 delivery-adaptive wiring`, and its proof column cites `node judge.mjs compose --json` and `node scripts/build-packs.mjs --check`. Every other example in these templates is a generic placeholder in square brackets. A template copied into every future TDD carries this repository's own task as its worked example.
- suggestion: Replace the ids and labels with neutral placeholders (`w1 <first work item>`, proof `<observable command or state>`) while keeping the subgraph, verification-node, gate-node and critical-path shape the validator checks.

### ADV-005 The helper-unavailable artifact shows the app test as skipped in what the docs call the canonical full chain

- type: Nitpick
- severity: info
- category: Maintainability and code quality
- location: `.archon/workflows/delivery/decide/delivery-decide.yaml:82-88`
- evidence: With no key the node sets every phase `true` and `app_test=$app_test_input`, which is `none` by default, so `runs_for app_test` returns `false` and the generated table reads `| app test | no | - | - | - | - |` with `class app_test skipped` in the flowchart. That is the right behavior — a judgment must never name a surface — but the artifact and `workflows/delivery.md`'s "the canonical full chain" wording read as disagreeing to someone comparing them.
- suggestion: One clause in the artifact's `Gates requested:` line or in the block description noting that the app test follows the pack's `app_test` input and is never added by the fallback.

## Dead Code and Dependency Review

- newly orphaned code: none. `delivery-full`, `delivery-lean`, `delivery-oneshot` and `delivery-prd` are still reachable through `--input workflow=<name>` and a `confirm` reject text, which `delivery-start.yaml:196-203` preserves deliberately and `tests/dispatch.test.mjs` asserts; the `explicit-bugfix` fixture and the pack rows in `workflows/delivery.md` and `docs/cheatsheet.md` keep them documented. The `outline` node's `delivery-gate-phase` include and `implement-outline` skill remain reachable through `planning=outline`. Nothing in the diff removes a caller without removing its callee.
- dependency findings: no `package.json`, lockfile, or vendored dependency change in the diff. `judge.mjs` still uses only `node:fs`, `node:path`, `node:url` and the global `fetch`; `evals/compose-probe.mjs` adds `node:child_process` and nothing else. No new runtime requirement beyond the `node` and `git` the packs already assume.

## Verdict

- decision: request_changes
- overall code-health change: positive. The judgment is pushed to the boundary where the evidence exists instead of being spent once on the request text, the derivation sits in one block that four includes share rather than being inlined per boundary, the fallback is the canonical chain at every level, the documentation states the floor-and-direction invariant explicitly for the first time, and the new tests run real bash bodies and real stub calls rather than asserting on YAML shape. The three findings are gaps in one state and two artifacts, not a wrong approach.
- rationale: CR-001 makes the pack fail in the state its own sample set expects for the shape `delivery-start` most often routes to it, and it is a state no test or fixture can currently reach. CR-002 misdraws the one branch point the judgment produces, in the artifact that is the second deliverable. CR-003 leaves the branch's headline change out of the release notes the repository's stated rule requires it to be in. All three have small, local fixes.

## Review Limits

- blocked or unavailable checks: none. Every command in the Verification Story ran in this session. `archon workflow test delivery` was not re-run: verification `A14` records its one failure as `delivery/bugfix/fixtures/reproduced.stubs.yaml`, reproduced at the merge base `3fafa25` with none of this branch present, and `git diff --name-only 3fafa25..HEAD` over both bugfix directories is empty, so it is pre-existing and outside this scope.
- residual manual verification: the live `compose` probe (`node evals/compose-probe.mjs`) was not re-run here; verification `A4` and `A8` record it at `jev-1.13.0` with six of eight samples passing. Whether the eight committed samples are the right eight (`A20`) and a live default-input `delivery-adaptive` run reaching the installed helper (`A22`) are both still `untested` and stay open for a person; `A22` in particular is the only end-to-end proof of the `~` expansion, which is currently proven by a unit test alone.
