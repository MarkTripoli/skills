---
type: code-review
date: 2026-09-18
branch: compose-delivery-chain-jev
base_branch: main
base_sha: a50132a198b6feac8dd0a46bb9842b6d70edb8ac
head_sha: 7b0ba47f4f093443ef04a9266af3c9d662864e17
status: findings
summary: "Third round against `origin/main` (50 non-artifact files committed, plus the fix round's 18-file working tree and one untracked changeset). All three findings of `18-code-review` are fixed and verified against the diff and the tests that pin them. Every check is green in this session: `npm test` 71/71, `archon workflow test delivery-adaptive` 4/4, `scripts/validate.mjs` and `build-packs.mjs --check` clean. Two new findings gate, both consequences of the pack swap the branch introduces rather than of the code the fix round wrote. `delivery-start`'s `route` node still validates a caller-supplied `--input gates=` against the judged pack's gate vocabulary, so `--input gates=design,plan` on a request judged `oneshot` or `lean` aborts the run at `route` with `unknown gate \"design\" for delivery-oneshot`, even though the pack that would actually run, `delivery-adaptive`, has that gate (reproduced by running the node's own bash against a stub helper). And `/deliver`, the agent-session entry point, still starts `archon workflow run delivery-<pack>` directly, so it never reaches `delivery-adaptive`, while the `docs/cheatsheet.md` sentence this change edited says it \"routes the same way\" as `delivery-start`. The next phase fixes both: `route` needs the same judged-to-adaptive swap `resolve` applies before it validates gate names, and `deliver` needs either the swap or a cheatsheet sentence that says it runs the fixed pack."
---

# Code Review

## Scope

- merge base: `a50132a198b6feac8dd0a46bb9842b6d70edb8ac` (`git merge-base origin/main HEAD`; `gh pr view` reports no pull request for this branch, `task.md` carries no `base:`, so the repository default branch from `refs/remotes/origin/HEAD`, which is `origin/main`). Local `main` is stale at `3fafa25` and would drag two other tasks (`i-m-curious-what`, `describe-pr-title-rule`) into scope; `origin/main` has absorbed both, so this base isolates this task's work, the same base `18-code-review` used.
- reviewed HEAD: `7b0ba47f4f093443ef04a9266af3c9d662864e17`, plus the working tree.
- commits: 23 after the merge base. Code commits are `b398245`, `48fb9f3`, `cdd1557`, `8be2bc3`, `fc1e9d9`, `37a8028`; the other 17 are `docs(task):` artifact commits.
- staged and unstaged changes: none staged. 18 modified files unstaged, all of them the fix round's work: both `delivery-adaptive` flavors, both `delivery-decide` flavors, both `delivery-start` flavors and their six `start/fixtures/*.stubs.yaml`, `README.md`, both `tdd_template.md` copies, `tests/dispatch.test.mjs`, `tests/judge.test.mjs`, `tests/packs.test.mjs`.
- task-owned untracked files: `.changeset/delivery-adaptive-pack.md` is a review subject. `.agents/tasks/compose-delivery-chain-jev/16-` through `19-` are task artifacts, not review subjects.
- excluded changes: everything under `.agents/tasks/`, and the untracked `.ignore`, a graft search-path file that predates this session and that no phase of this task wrote.

Total reviewed: 50 files committed (+2264/-126 before the working tree), the 18-file working tree on top, and the 5-line changeset.

## Previous Round

- previous artifact: `18-code-review-compose-delivery-chain.md`
- CR-001 An unclear `outline` judgment overrides a confident `plan`: fixed. `.archon/workflows/delivery/decide/delivery-decide.yaml:89-95` compares `plan_p` and `outline_p` with `awk` and floors to `plan` on a tie or a missing value; `tests/packs.test.mjs:317` replays `15-verification`'s live A21 probabilities (plan 0.92, outline 0.39) and asserts `planning: "plan"`.
- CR-002 `--input gates=outline` now aborts an auto-judged run that both `main` and HEAD completed: fixed. `.archon/workflows/delivery/start/delivery-start.yaml:218-232` renames every gate token into the adaptive vocabulary first and layers the `gates_plan` widening on top; the `resolve` test at `tests/dispatch.test.mjs:165` asserts `{"workflow":"lean","gates":"plan,pr","pack":"adaptive"}`. Re-run in this session: the judged-lean case passes `route` and lands on `adaptive`. CR-001 below is a sibling case the same node still rejects, not a re-raise of this one.
- CR-003 The one human approval names a pack and a gate set that will not run: fixed. `delivery-start.yaml:157-163` names the adaptive swap and its gate ceiling; `tests/dispatch.test.mjs:173` folds the block scalar the way Archon does and asserts both clauses, and cross-checks that `resolve`'s real output stays inside the named ceiling.

None is still open.

## Requirements and Standards

- task or ticket: `.agents/tasks/compose-delivery-chain-jev/task.md`. Two deliverables (JEV decides which phases run at every boundary; the execution DAG is drawn for the engineer) and five lettered acceptance criteria plus a probe-cleanup obligation.
- implementation source: `04-plan-compose-delivery-chain.md` (newest `plan`), five phases. `15-verification-compose-delivery-chain.md` records 22 items, 20 `pass` with a command and quoted output, 2 `untested` (`A20` whether the eight committed samples are the right eight; `A22` a live default-input run needing `scripts/install.mjs`), `## Findings: None.` Its `pass` rows are not re-run here; both `untested` rows are judgments no command in this environment decides, and neither is contradicted by the diff. `A1` records `tests 67 / pass 67`, which the fix round has since raised to 71; the count is higher, not lower, so nothing it proved was lost.
- repository instructions: `shared/CONVENTIONS.md` (artifact numbering, the `docs(task): <phase> artifacts` subjects, typed-judgment rules), `shared/WRITING.md`, `workflows/delivery.md` (pack, block and judgment tables, the Archon notes), `docs/testing.md`, `README.md:89`'s changeset requirement.

Acceptance criteria decided against the diff:

| Criterion | Decision | Evidence |
|---|---|---|
| (a) `npm test` passes | met | run in this session: `tests 71 / pass 71 / fail 0`. |
| (b) `archon workflow test delivery-adaptive` passes its fixtures | met | run in this session: `4 passed, 0 failed` over `prd-path`, `skipped`, `helper-unavailable`, `all-phases`. |
| (c) a dry run with stubs shows skipped nodes skipped and the execution-plan artifact written | met | the four fixtures prove the skipping (`skipped.stubs.yaml` reaches `plan__once` and `implement__phases-auto` and carries no stub for the design/prd/tdd nodes, which `archon workflow test` would report as unused if they ran). The artifact writing is proven at the node level instead of the pack level, by `tests/packs.test.mjs:342` and by my own run of the extracted node bash, which wrote `01-execution-plan-fixture.md` with `class outline skipped` and the full table. |
| (d) with the key present, `compose` skips research and design on a oneshot-shaped request and keeps them on a full-shaped one | not re-run | needs `TYPESAFE_API_KEY`, which this session has no evidence of. `15-verification` A4 records the two live calls with quoted probabilities; nothing in the diff contradicts them, and `tests/judge.test.mjs:326` pins the threshold mapping for all eight samples against the stub. |
| (e) the `create-tdd` and `create-design-discussion` templates render the section and validate | met | `node scripts/validate.mjs` prints `4 execution-DAG templates, 2 work-breakdown templates`; both `### Execution DAG` blocks carry a Mermaid flowchart, and the two `tdd_template.md` copies carry the work-breakdown flowchart, the `Critical path:` line and the four-column table the validator requires. |
| probe cleanup | met, by record | `15-verification` A6 records `archon workflow status --json`, `git worktree list` and `git status --porcelain` before and after. No scratch worktree or detached run is visible from this checkout. |

## Change Profile

- intent and expected behavior: replace the one-time pack choice with a `compose` judgment at four phase boundaries, run it from a new `delivery-decide` block inside a new `delivery-adaptive` pack, route judged `oneshot`/`lean`/`full`/`prd` there from `delivery-start`, and have every decide node write the chain it composed into `NN-execution-plan-<slug>.md` for the TDD and design-discussion templates to embed.
- change description quality: the 23 commit subjects follow the conventions and `node scripts/check-commits.mjs` accepts them. `.changeset/delivery-adaptive-pack.md` is a `minor` bump naming the routing change, the four boundaries, the artifact, and the two template sections. No pull request exists yet, so there is no body to judge.
- implementation model and review model: not recorded in the implementation artifacts. This review ran on Claude Opus 5.
- changed-line size and logical cohesion: 50 files, +2264/-126 committed, plus 18 files in the working tree. Past the ~1000-line split signal, but the bulk is generated or duplicated: 1104 of the added lines are the `-omp` flavor that `build-packs.mjs` regenerates byte-for-byte, and the 8 fixture files are data. The hand-written surface is one new block (199 lines), one new pack (383 lines), a 92-line addition to `judge.mjs`, 23 lines in `validate.mjs`, and the template and doc edits. All of it is one feature and none of it lands without the rest, so no split is required.
- resulting large-file concerns: `judge.mjs` reaches 740 lines and now holds 26 commands. Each is a self-contained `async function` over one shared `systemOne`; `compose` reuses `INVOLVEMENT` rather than restating the autonomy criteria. No split is warranted yet.
- dependency or lockfile changes: none. `package.json` and the lockfile are untouched.

## Tests Reviewed First

- behavior claimed by tests: `tests/judge.test.mjs:299` pins `compose`'s key order (`phase, verdict, probability, bar, reason, reason_confidence`) because the decide node's `sed` patterns match it positionally, the bar value, the reason string, the state shape (task text plus `{file, type, summary}` per artifact), and the threshold at both sides (0.05 skips, 0.21 runs). `tests/judge.test.mjs:326` walks all eight committed samples and asserts the exact skip set each declares. `tests/packs.test.mjs:289`, `:317` and `:342` run the decide node's own bash against the stub and assert the whole output object, the artifact's dimmed class lines, the probability and bar cells, rewrite-in-place rather than renumbering, `~` expansion in `skills_dir`, the no-key fallback, and the `verify=false` row. `tests/dispatch.test.mjs:154`, `:165` and `:173` cover the explicit-versus-judged pack swap, the `outline` rename, the `gates_plan` widening, and the approval message.
- missing or misleading coverage: no test covers `route` with a caller-supplied gate name that belongs to `delivery-adaptive` but not to the judged pack, which is CR-001 below; the existing gate-name test (`tests/dispatch.test.mjs:127`) only exercises `--input workflow=oneshot`, where the judged pack really is the pack that runs, so the case it proves is the one that never breaks. No test asserts that `/deliver` and `delivery-start` reach the same pack, which is CR-002.

## Five-Axis Assessment

- helper axis-coverage: model `unavailable`, tokens `unavailable` in / `unavailable` out

### Correctness

- assessment and evidence: the judgment direction holds end to end. `judge.mjs:555` marks a phase `skip` only at `p <= T.no` (0.20), so unclear runs it; `delivery-decide.yaml:71` reads a missing field as `run`, and `:98-104` falls back to the full canonical chain whenever `compose` prints nothing, which covers no key, no `node`, a nonzero exit, and a shape change. I confirmed the fallback by running the extracted node bash with `INPUTS_SKILLS_DIR=/nonexistent`: every phase came back `"true"` with `available: "false"` and the table showed `-` in every probability cell. The `plan`/`outline` comparison at `:89-95` has no third state, so `implement`'s `until_bash` always has an artifact to read. Two defects remain, both at the edge where the judged pack is exchanged for `delivery-adaptive`: `delivery-start.yaml:122-133` validates caller-supplied gate names against the judged pack rather than the pack that will run (CR-001, reproduced), and `/deliver` bypasses the swap entirely (CR-002). Inside the decide node the shell is safe under `set -eu`: every `[ ... ] && ...` sits before another command in its block, and `runs_for`'s `&& printf true || printf false` returns 0 on both sides, which the 71 passing tests and my own two runs confirm.
- helper coverage: unavailable

### Readability and Simplicity

- assessment and evidence: the decide node emits its phases from one fixed list through `node_line`/`row`/`runs_for`, so the flowchart and the table cannot disagree about which phases exist, and the fix round's removal of the four copied `tiers:` lines (`delivery-adaptive.yaml:50-52` explains why) removed the only four-way copy invariant. The remaining simplicity cost is the gate vocabulary, now written in four places: `route`'s per-pack `names`, `resolve`'s per-pack `names`, `resolve`'s adaptive `names`, and `delivery-adaptive`'s `gates` node. CR-001 is exactly what that duplication buys. `delivery-adaptive` reads `implement_skill` from `decide-design` while reading `review_each_phase` from `decide-plan` (`delivery-adaptive.yaml:291-292`), which is correct (the implement skill must match the artifact the planning phase wrote) but carries no comment saying so.
- helper coverage: unavailable

### Architecture

- assessment and evidence: `delivery-decide` is a block with one `bash:` node and a `returns:`, included four times, which is the ownership the other eight blocks already use, and `workflows/delivery.md:47` documents it as the ninth. The pack keeps the canonical order and expresses inclusion through `when:` alone, which is what Archon's static DAG allows; every `when:`-guarded include is followed by a join with `trigger_rule: none_failed_min_one_success`, and a plain `bash:` join sits between every decide include and the include after it, per note 1 of the Archon notes the change extended. The judgment itself stays in `judge.mjs` with the thresholds, and the node only reads fields, which keeps the `sed`-parses-JSON coupling narrow and pinned by a test. The one boundary the change left uneven is the entry points: `delivery-start` swaps the pack, `deliver` does not (CR-002).
- helper coverage: unavailable

### Security

- assessment and evidence: no new trust boundary. Every shell interpolation in the decide node passes values as `printf` arguments, never as a format string, and `dir`, `file` and `skills` are quoted at every use; `slug=$(basename "$dir")` and `gates_requested` reach the artifact as `%s` arguments. The `sed` extractors interpolate only literal phase names from the code, never model output. The reason strings written into the Markdown table come from the fixed `REASONS` map in `judge.mjs:522-527`, keyed by the model's choice, so the model cannot inject a table separator or a Mermaid directive; an unrecognised key yields no match and the cell reads `-`. `compose` sends `task.md` and the artifact `summary` lines to `api.typesafe.ai`, which is the same class and destination as the existing `axis-coverage` and `route-workflow` calls, over HTTPS with the key in an `authorization` header and never on a command line.
- helper coverage: unavailable

### Performance

- assessment and evidence: the pack adds four model calls per run, one per boundary, each a single `systemOne` round trip carrying 17 questions (8 nouls, 8 paired reason choices, 1 autonomy choice) bounded by `JUDGE_TIMEOUT`, default 20 seconds. Pairing each noul with its reason choice in the same request is what keeps it one round trip per boundary rather than two. The state is bounded by construction: `composeState` reads only frontmatter from each artifact, never a body, so a directory of 20 artifacts sends 20 summary lines. No loop, query or allocation in the node grows with repository size; `ls | grep | sort | tail` over the task directory is the largest operation.
- helper coverage: unavailable

## Verification Story

- command or inspection: `npm test`; `archon workflow test delivery-adaptive`; `node scripts/validate.mjs`; `node scripts/build-packs.mjs --check`; `node scripts/check-commits.mjs`; the `route` node's bash extracted from `delivery-start.yaml` and run against a stub `judge.mjs` that answers `oneshot`; the `decide` node's bash extracted from `delivery-decide.yaml` and run in a scratch git repository with no helper and with `INPUTS_VERIFY=false`.
- result: `tests 71 / pass 71 / fail 0`. `4 passed, 0 failed`. `ok: 41 skills, 54 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, 0 banned tokens, packs checked with /usr/local/bin/archon`. `build-packs --check` exit 0, no output, so the `-omp` flavor is not stale. The `route` run reproduced CR-001 (`gates: unknown gate "design" for delivery-oneshot; use auto, all, none, or a comma-separated subset of: pr`, exit 1) and passed the control case `gates=pr`. The `decide` run produced the artifact quoted under ADV-001.
- manual, screenshot, or before-and-after evidence: none applicable; the change ships no interface. The execution-plan artifact rendered in the scratch run is quoted under ADV-001.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 `route` rejects a gate the pack that will actually run does have

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `.archon/workflows/delivery/start/delivery-start.yaml:122-133`
- failure mode: on an auto route, `route` derives `names` from the judged pack and rejects any `--input gates=` token outside it, then exits 1. But `resolve` immediately afterwards swaps that judged pack for `delivery-adaptive`, whose gate set is `design prd tdd plan phases pr`. A caller who asks for a gate that `delivery-adaptive` really has, on a request the helper judges `oneshot`, `lean` or `prd`, never reaches `resolve`: the run aborts at `route`. `--input gates=design,plan` and `--input gates=phases` are both ordinary asks (the adaptive pack can run a design discussion and a phased implementation for any of those judged shapes), and both are refused with a message naming a pack the run was not going to use. This is the same class as CR-002 of the previous round, one node earlier: that fix translated gate tokens inside `resolve` but left `route`'s own validation keyed to the judged pack.
- evidence or reproduction: extracted the `route` node's bash from `delivery-start.yaml` and ran it with a stub `judge.mjs` on `INPUTS_SKILLS_DIR` answering `{"workflow":"oneshot","suggested":"oneshot","confidence":0.95}` and `all` for autonomy. `INPUTS_GATES=design,plan` exits 1 with `gates: unknown gate "design" for delivery-oneshot; use auto, all, none, or a comma-separated subset of: pr`; `INPUTS_GATES=phases` exits 1 the same way; the control `INPUTS_GATES=pr` exits 0 with `{"workflow":"oneshot","gates":"pr",...,"explicit":"false","gates_plan":"false"}`, which `resolve` then sends to `pack: adaptive`. No test covers this: `tests/dispatch.test.mjs:127` only exercises an explicit `--input workflow=oneshot`, where the judged pack is the pack that runs.
- fix direction: compute the pack swap in `route`, where `explicit` is already derived, and validate the gate names against the pack the run will use. The smallest form is to move the `oneshot|lean|full|prd -> adaptive` case and the adaptive `names` list above the gate loop in `route`, reusing them in `resolve` through `route.output.pack` instead of recomputing, which also collapses two of the four copies of the gate vocabulary. Add a `route` test for a judged `oneshot` with `INPUTS_GATES=design,plan`.

### CR-002 `/deliver` never reaches the adaptive chain the cheatsheet says it reaches

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `docs/cheatsheet.md:22`, `skills/delivery/deliver/SKILL.md:42`
- failure mode: `deliver` judges the pack itself and starts `archon workflow run delivery-<pack>`, never `delivery-start`, so an agent-session request always runs a fixed pack and never `delivery-adaptive`. The cheatsheet sentence this change edited states the adaptive routing and then says, in the next clause, "In an agent session: `/deliver <request>` routes the same way, starts the run, and replies with the run id and the first pause." After this change those two entry points no longer route the same way: the same request judged `lean` runs the fixed lean pack from `/deliver` and the four-boundary adaptive chain from `delivery-start`, with a different gate set and a different phase list. A user who follows the cheatsheet gets the old behavior and no execution-plan artifact, which is also the artifact deliverable 2 asks the TDD and the design discussion to embed.
- evidence or reproduction: `docs/cheatsheet.md:22` carries both clauses in the same paragraph, the first added by this change. `skills/delivery/deliver/SKILL.md:42` is `archon workflow run delivery-<pack> --branch <branch> --input gates=<gates> '<request>'`; `:45` lists pauses from the fixed packs' gate lists only, with no `adaptive` row. `skills/delivery/deliver/` is absent from `git diff --name-status a50132a...HEAD`, so no phase of this task touched it. `delivery-decide.yaml:75-77` names "the `deliver` skill" as a reader of the `autonomy` field the decide node emits, so the two were meant to meet.
- fix direction: pick one and make the documentation match. Either have `deliver` start `delivery-start` (or apply the same judged-to-adaptive swap before composing its `archon workflow run` command, adding an `adaptive` row to its pauses list at `:45`), or change the cheatsheet clause to say `/deliver` runs the fixed pack it judges and name `delivery-start` as the way to the adaptive chain. The first keeps one routing rule; the second is the smaller diff and leaves the divergence deliberate and stated.

## Advisories

### ADV-001 The flowchart draws `verification` as running when `--input verify=false` turned it off

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `.archon/workflows/delivery/decide/delivery-decide.yaml:187-190`
- evidence: the previous round's ADV-004 was fixed in the table only. `runs_for verify` now returns `false` under `INPUTS_VERIFY=false`, but the `for id in ...` loop that emits `class <id> skipped` lists `research design prd tdd plan outline app_test` and not `verify`, and the edge line `implement --> verify --> app_test --> review --> pr` is unconditional. Running the extracted node bash with `INPUTS_VERIFY=false` produced an artifact whose table row reads `| verification | no | - | - | - | - | medium |` while the flowchart above it draws `verify["verification"]` undimmed and in the chain. The drawn DAG is the deliverable a reader looks at first, so it contradicts its own table.
- suggestion: add `verify` to the dim loop. It is not a judged phase, so it takes no probability, but `runs_for` already answers for it and the loop only asks `runs_for`.

### ADV-002 Each boundary judges with its own previous verdict in the state

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `skills/delivery/typed-judgment/judge.mjs:532-541`
- evidence: `composeState` collects every `^\d{2}-.*\.md$` file in the task directory, which includes the execution-plan artifact the previous decide node wrote. Its `summary` is that node's own verdict: `Execution plan at the task boundary: planning=plan, app_test=none, review_each_phase=false, autonomy=all, helper available=true.` The design boundary therefore judges `plan` against `outline` with the task boundary's answer to that same question already in its state, as an artifact summary rather than as evidence. A re-judgment that reads its own earlier answer can anchor on it, which weakens the point of re-asking at every boundary. `15-verification` A21 was opened against this risk and recorded that the collapse did not happen on this task's own directory; one directory is one observation.
- suggestion: exclude `type: execution-plan` from the artifacts list in `composeState`, or keep it and replace its `summary` line in the state with the boundary name alone. `task.md`'s wording ("the frontmatter `summary` of every artifact") permits either reading, so this is a judgment call rather than a spec violation.

### ADV-003 A judged `oneshot` now always runs a plan phase it did not run before

- type: Refactor suggestion
- severity: minor
- category: Performance and scalability
- location: `.archon/workflows/delivery/decide/delivery-decide.yaml:84-95`
- evidence: `planning` floors to `plan` whenever `outline` does not outscore it, and there is no third state, so every adaptive run writes a plan artifact and implements through the phased loop. `delivery-oneshot`, the pack a small request used to reach from `delivery-start`, has neither: `workflows/delivery.md:29` describes it as one session that implements, verifies and commits. A request judged `oneshot` at confidence 0.95 therefore gains a `create-plan` session and a phased `implement-plan` loop it never had, even when `compose` scores `plan` a confident no, which `tests/packs.test.mjs:289` pins as the intended floor. The floor is correct as built (the previous round's CR-001 showed that `planning: none` strands the implement loop), so the cost is inherent to the spec's two-way question rather than a defect in this code.
- suggestion: none required now. If the cheapest path matters later, the shape that fixes it is a third `implement directly` state guarded by `until_bash` accepting an absent plan, which is a task of its own.

### ADV-004 The block table omits the `verify` input the fix round added

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `workflows/delivery.md:47`
- evidence: the `delivery-decide` row lists `skills_dir`, `task_dir`, `boundary`, `tiers`, `gates`, `app_test`. `delivery-decide.yaml:31-33` declares a sixth input, `verify`, and `delivery-adaptive.yaml` threads it from all four includes. A reader sizing the block from the table misses it.
- suggestion: add `verify` to the row's input list.

## Dead Code and Dependency Review

- newly orphaned code: none. The decide node's `autonomy` and `available` fields are unread by `delivery-adaptive`, which the previous round raised and the fix round answered with the comment at `delivery-decide.yaml:75-77` naming their intended readers; they are unconsumed, not orphaned. `PHASE_CRITERIA` covers only `research` and `design` by design, and `judge.mjs:119` spreads criteria only when present. `tests/fixtures/compose-samples.json`'s `skip` arrays are read by `tests/judge.test.mjs:326`; `evals/compose-probe.mjs` reads `shape` instead, which `docs/testing.md:58` states. No pre-existing code was left dead by the change.
- dependency findings: none. No dependency was added, removed or upgraded, and the lockfile is untouched.

## Verdict

- decision: request_changes
- overall code-health change: positive. The feature is coherent, the judgment direction is safe in both fallback directions, the new block follows the ownership the other eight already use, and the test surface is unusually specific: it pins the JSON key order the node's `sed` depends on, the bar value, both sides of the threshold, and the artifact's own rendering. Both findings are at the seam between the judged pack and the pack that runs, not in the judging itself.
- rationale: CR-001 aborts a legitimate invocation with a message naming the wrong pack, and no test covers it. CR-002 leaves the branch's headline behavior unreachable from `/deliver` while a sentence in the file this change edited says otherwise. Both are small, local fixes.

## Review Limits

- blocked or unavailable checks: `node skills/delivery/typed-judgment/judge.mjs axis-coverage` printed no verdicts, so every axis line above reads `unavailable` and each of the five judgments is my own reading of the pinned scope. Acceptance criterion (d) needs `TYPESAFE_API_KEY` and was not re-run; it stands on `15-verification` A4's recorded live calls and on the stub-backed threshold test.
- residual manual verification: a real `archon workflow run delivery-adaptive` against the installed helper (`15-verification` A22, still `untested`) would exercise the four boundaries end to end, which no dry run can. Whether the eight committed samples are the right eight (A20) is still a human judgment.
