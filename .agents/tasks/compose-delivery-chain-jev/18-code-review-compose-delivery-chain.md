---
type: code-review
date: 2026-09-18
branch: compose-delivery-chain-jev
base_branch: main
base_sha: a50132a198b6feac8dd0a46bb9842b6d70edb8ac
head_sha: 7b0ba47f4f093443ef04a9266af3c9d662864e17
status: findings
summary: "Second round against `origin/main` (50 non-artifact files, +2264/-126, committed plus the fix round's working tree). All three findings of `16-code-review` are fixed and verified. `npm test` is 68 of 68, `archon workflow test delivery-adaptive` is 4 of 4, `build-packs --check` is clean, `check-commits` accepts 23 subjects. Three new findings gate, two of them in code the fix round wrote: an unclear `outline` judgment overrides a confident `plan`, so a task JEV scores plan 0.92 / outline 0.39 runs `create-structure-outline` and `implement-outline` (reproduced; those are the probabilities `15-verification` recorded from a live call against this task directory); the ADV-001 rewrite dropped the `outline`->`plan` gate rename, so `--input gates=outline` with an auto-judged route now aborts the run at `resolve` where both `origin/main` and this branch's HEAD completed it; and the `confirm` approval message still names the judged pack and its gates while the run continues in `delivery-adaptive` with a different gate set. The next phase fixes all three: the first needs plan and outline compared rather than thresholded one-sidedly, the second needs the adaptive pack to accept or rename `outline`, the third needs the approval message to state the pack and gates `resolve` will actually produce."
---

# Code Review

## Scope

- merge base: `a50132a198b6feac8dd0a46bb9842b6d70edb8ac` (`git merge-base origin/main HEAD`; no pull request for this branch, no `base:` in `task.md`, so the repository default branch from `refs/remotes/origin/HEAD`, which is `origin/main`). Local `main` is stale at `3fafa25`, the base the previous round used; `origin/main` has since absorbed the two other tasks that were committed on this branch (`i-m-curious-what`, `describe-pr-title-rule`), so this round's scope is only this task's work.
- reviewed HEAD: `7b0ba47f4f093443ef04a9266af3c9d662864e17`, plus the fix round's uncommitted changes.
- commits: 23 after the merge base. Code commits are `b398245`, `48fb9f3`, `cdd1557`, `8be2bc3`, `fc1e9d9`, `37a8028`; the remaining 17 are `docs(task):` artifact commits.
- staged and unstaged changes: none staged. 16 modified files unstaged, all of them the fix round's work: both `delivery-decide` flavors, both `delivery-start` flavors and their six `start/fixtures/*.stubs.yaml`, `README.md`, both `tdd_template.md` copies, `tests/dispatch.test.mjs`, `tests/judge.test.mjs`, `tests/packs.test.mjs`.
- task-owned untracked files: `.changeset/delivery-adaptive-pack.md` (5 lines, the CR-003 fix) is a review subject. `.agents/tasks/compose-delivery-chain-jev/16-code-review-*.md` and `17-code-review-fixes-*.md` are task artifacts, not review subjects.
- excluded changes: everything under `.agents/tasks/`, and the untracked `.ignore`, which predates this session and no phase of this task touched.

Total reviewed: 50 files, +2264/-126, plus the 5-line changeset.

## Previous Round

- previous artifact: `16-code-review-compose-delivery-chain.md`
- CR-001 A confident-no `plan` judgment strands the implementation loop for sixteen sessions: fixed. `delivery-decide.yaml:79-80` no longer has a `none` branch; the only two outcomes are `outline` and `plan`. `tests/packs.test.mjs:289` stubs the all-confident-no shape and asserts `planning: "plan"`.
- CR-002 The execution-plan flowchart draws a dependency between two mutually exclusive phases: fixed. `delivery-decide.yaml:165-170` emits `tdd --> plan`, `tdd --> outline`, `plan --> implement`, `outline --> implement`; the reproduction below shows the branch drawn and no `plan --> outline` edge.
- CR-003 The branch's headline user-visible change ships with no changeset: fixed. `.changeset/delivery-adaptive-pack.md` is present with a `minor` bump and names the four user-visible changes.

None is still open. CR-002 and CR-003 below are new findings with new identifiers, not re-raises.

## Requirements and Standards

- task or ticket: `.agents/tasks/compose-delivery-chain-jev/task.md`. Two deliverables (JEV decides which phases run; the execution DAG is drawn for the engineer) and five lettered acceptance criteria plus a probe-cleanup obligation.
- implementation source: `04-plan-compose-delivery-chain.md` (newest `plan`), five phases. `15-verification-compose-delivery-chain.md` records all 22 items, 20 `pass` and 2 `untested` (`A20` whether the eight samples are the right eight; `A22` a live default-input run needing `scripts/install.mjs`), `## Findings: None.` Its `pass` rows with a command and quoted output are not re-run here; its two `untested` rows are judgments no command in this environment decides either, and neither is contradicted by the diff. `### Engineering Work Breakdown` is planned work (`04-plan:40`, `04-plan:649`), not scope creep.
- repository instructions: `shared/CONVENTIONS.md` (artifact numbering, the `docs(task): <phase> artifacts` commit subjects, typed-judgment rules), `workflows/delivery.md` (pack and block tables, the Archon notes), `docs/testing.md`, `README.md:89`'s changeset requirement.

Acceptance criteria decided against the diff:

| Criterion | Decision |
|---|---|
| (a) `npm test` passes | holds: exit 0, `tests 68 / pass 68 / fail 0`, run in this session. |
| (b) `archon workflow test delivery-adaptive` passes its fixtures | holds: `4 passed, 0 failed`, run in this session. |
| (c) a dry run shows skipped phases skipped and the artifact written by the decide node | holds by `15-verification` `A3`, which records `when_condition_false` on six nodes and the artifact's `no` rows from one run. |
| (d) a live oneshot-shaped request skips research and design, a full-shaped one keeps them | holds by `15-verification` `A4` (0.07/0.07 against 0.72/0.94); not re-run here (no key in this environment's env). |
| (e) the two templates render the section and validate | holds: `scripts/validate.mjs:437-452` enforces both sections and `npm test` reports `4 execution-DAG templates, 2 work-breakdown templates`. |

## Change Profile

- intent and expected behavior: replace `route-workflow`'s one-time pack pick with a per-boundary `compose` judgment, and record the composed chain as an `execution-plan` artifact the design and TDD templates embed. The pack composition matches the constraint the task states: inclusion is judged, order is not, because Archon cannot reorder a static DAG.
- change description quality: the pack and block descriptions, the Archon note 1 addition (`workflows/delivery.md:283`), and the block-level comments carry the reasoning a later reader needs. `.changeset/delivery-adaptive-pack.md` states the four behavior changes without restating the mechanism. No pull request exists yet.
- implementation model and review model: not recorded in the implementation artifacts. This review ran on `claude-opus-5`.
- changed-line size and logical cohesion: +2264/-126 over 50 files, ~1500 of which are the two pack YAML flavors (one generated from the other) and their eight fixtures. One coherent change: a command, a block, a pack, the route into it, two template sections, a validator check, and the docs. Above the ~1000 split signal, but the mechanical half (`-omp`) is generated and `--check`ed, so it is not separable.
- resulting large-file concerns: `delivery-adaptive.yaml` is 383 lines of 31 nodes, structurally the same size as `delivery-full`. `judge.mjs` gains 101 lines in one command. Neither crosses a threshold this repository sets.
- dependency or lockfile changes: none. No new import in `judge.mjs`, `validate.mjs`, or `evals/compose-probe.mjs`.

## Tests Reviewed First

- behavior claimed by tests: `tests/judge.test.mjs:299` pins the threshold (0.05 skips, 0.21 runs), the paired reason, the state shape (`task` plus `{file, type, summary}` per artifact), the stdin form, and `Object.keys(out.phases[0])` in the exact order `delivery-decide.yaml`'s sed patterns depend on. `tests/judge.test.mjs:326` maps all eight committed samples through the stub. `tests/packs.test.mjs:289` and `:317` run the decide node's real bash body: the `planning=plan` floor, the dimmed flowchart, rewrite-not-renumber, the no-key canonical object, and a `~` in `skills_dir`. `tests/dispatch.test.mjs:939` covers the explicit-pin and `gates_plan` paths of `resolve`.
- missing or misleading coverage: three gaps, each behind a finding below.
  - Nothing exercises a `plan`/`outline` pair where both score above the bar. Both decide-node tests (`tests/packs.test.mjs:289`, `:317`) stub `outline` as a confident no, so the derivation at `delivery-decide.yaml:79-80` is only ever taken down its `plan` leg (CR-001).
  - `tests/dispatch.test.mjs` covers `gates_plan=true` and `gates_plan=false` with `gates=all`, never a caller-supplied pack-specific gate name reaching `resolve` on the adaptive path (CR-002).
  - No test reads the `confirm` node's approval message against what `resolve` produces (CR-003).

No test was removed, skipped, or marked `only`/`todo`; the `extract-json` stderr assertion relaxed from `deepEqual` to `match` belongs to `ae91316`, which is now in `origin/main` and outside this scope.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 9599 in / 73 out

### Correctness

- assessment and evidence: two defects found by tracing the derivations, both reproduced. `delivery-decide.yaml:79-80` resolves the mutually exclusive `plan`/`outline` pair with a one-sided threshold on `outline` alone, so `outline` at 0.39 beats `plan` at 0.92 (CR-001, reproduced against the block's real bash body with a stub replaying `15-verification`'s recorded A21 probabilities; the artifact it wrote reads `| plan | no | plan | 0.92 | <= 0.20 |`). `delivery-start.yaml:213-217` validates `gates` against the adaptive pack's gate names after `route` already validated them against the judged pack's, with no translation left between the two, so `--input gates=outline` on a judged-lean request exits 1 (CR-002, reproduced against `origin/main`, this branch's HEAD, and the working tree in turn). The previous round's `planning=none` path is genuinely gone: the `none` branch is deleted, not guarded. Everything else traced clean: `verdict()` defaults a missing field to `run`, so a shape change in `compose`'s JSON cannot silently skip a phase; the unavailable path sets every phase `true` and `planning=plan`; every join after a `when:`-guarded include carries `trigger_rule: none_failed_min_one_success`; `implement` reads `implement_skill` from `decide-design`, the same node whose `planning` chose between the `plan` and `outline` nodes, so the skill and the artifact that exists can never disagree; the `10#` prefix at `delivery-decide.yaml:101` stops `08` parsing as octal; `set -eu` is not tripped by the `[ ... ] && x=y` forms, which are non-final commands of an AND-OR list.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: the decide node draws its flowchart and its table from one `runs_for()` case statement and one fixed phase list (`delivery-decide.yaml:112-144`), so the two views cannot disagree; that is the right shape for the artifact the task asks for. Two rough edges, both advisory. `field()`, `prob()`, and `why()` (`:62-64`) are three near-identical sed patterns positionally coupled to `compose()`'s row key order, held together only by the `Object.keys` assertion the fix round added; the coupling is now pinned but still implicit at the call site. The `tiers` string is written out five times, once as the block's declared default and once in each of the four includes, with no difference between them.
- helper coverage: covered, level 3, confidence 0.93

### Architecture

- assessment and evidence: the boundary judgment lives in one block included four times rather than four copies of a decision, and the pack's `when:` expressions each read the nearest preceding boundary, so adding a phase means adding a node and a field, not rewiring. Inclusion-only judgment with canonical order is the correct reading of the Archon constraint, and `workflows/delivery.md:283` records why the four `decide-*-done` joins exist. The one structural weakness is where CR-002 and CR-003 both come from: `route` computes gates and an approval message for the judged pack, `resolve` then changes the pack, and nothing re-derives the gates for the new pack or re-states the message. The gate vocabulary is translated in exactly one direction (`gates_plan`) and the display is not translated at all; the pack swap needs one place that owns both.
- helper coverage: covered, level 3, confidence 0.99

### Security

- assessment and evidence: no new untrusted-input path. `compose` sends `task.md` and the artifacts' frontmatter `summary` to the same TypeSafe endpoint the existing `route-workflow`, `tier`, and `slug` calls already use, and that content is the run's own request and its own artifacts. The decide node writes only inside `$INPUTS.task_dir` and creates it with `mkdir -p` before reading; the pack's joins stage `git add -A -- "$dir"` scoped to that directory, the pattern every other pack uses, and never `git add -A` at the repository root. Nothing is spliced into a shell command from the request text: `judge.mjs` is invoked with the directory as an argv element, and the include-time macros are the `${INPUTS_X:-$INPUTS.x}` form the other blocks use. `delivery-start`'s `resolve` still takes the reject text through `sed` capture and word splitting with no `eval`. The only interpolation without escaping is `repo`/`branch`/`sha` into the artifact's YAML frontmatter (`delivery-decide.yaml:147-148`), and git's own ref rules exclude the characters that would break it.
- helper coverage: covered, level 3, confidence 0.99

### Performance

- assessment and evidence: one HTTP round trip per boundary. `compose()` batches all 17 questions (8 nouls, 8 paired reason choices, 1 autonomy choice) into a single `systemOne` call rather than one call per phase, which is what makes four boundaries per run affordable; the reason for a phase that runs is computed and discarded, and the code says so. `composeState` reads each `NN-*.md` whole to regex its frontmatter, so a boundary costs the total artifact bytes in the directory: 14 artifacts on this branch, well under a megabyte, and it grows linearly with a bounded directory. No new loop, query, or retry sits on a path a run takes more than four times. The decide node's own bash makes 8 `sed` passes over a one-line JSON document per `field`/`prob`/`why` triple, which is 24 process spawns per boundary; measurable only against the round trip it follows, so not worth changing.
- helper coverage: covered, level 3, confidence 0.97

## Verification Story

- command or inspection: `npm test`
- result: exit 0, `ok: 41 skills, 54 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, 0 banned tokens`, `tests 68 / pass 68 / fail 0`.
- command or inspection: `archon workflow test delivery-adaptive`
- result: `4 passed, 0 failed` over `prd-path`, `skipped`, `helper-unavailable`, `all-phases`.
- command or inspection: `node scripts/build-packs.mjs --check`
- result: exit 0, no output. The `-omp` flavor is a current regeneration, so it was reviewed through its native source.
- command or inspection: `node scripts/check-commits.mjs origin/main..HEAD`
- result: exit 0, `ok: 23 subjects`.
- command or inspection: `node -e '...readdirSync(".archon/workflows/delivery",{recursive:true})...'`
- result: `54`, matching the count `docs/testing.md:57` now claims.
- manual, screenshot, or before-and-after evidence: two reproductions, each run against the file's real bash body extracted with the same regex `tests/packs.test.mjs` uses, in a scratch directory removed afterward (`git status --short` unchanged; no Archon run was created).
  - CR-001: the decide body with a stub replaying `15-verification` `A21`'s live probabilities (`plan` 0.92, `outline` 0.39) printed `"planning":"outline","implement_skill":"implement-outline"` and wrote a table row reading `| plan | no | plan | 0.92 | <= 0.20 | ... |` with `class plan skipped` in the flowchart. The same run confirms CR-002 of the previous round is fixed: the flowchart emits `tdd --> plan`, `tdd --> outline`, `plan --> implement`, `outline --> implement` and no `plan --> outline` edge.
  - CR-002: the `resolve` body with `workflow=lean`, `gates=outline,pr`, `explicit=false`, `gates_plan=false`. Working tree: exit 1, `confirm: unknown gate "outline" for delivery-lean; name the pack, then all, none, or a comma-separated subset of: design prd tdd plan phases pr`. Same inputs at `HEAD` (`git show HEAD:...`): exit 0, `{"workflow":"lean","gates":"plan,pr","pack":"adaptive"}`. Same inputs at `origin/main`: exit 0, `{"workflow":"lean","gates":"outline,pr"}`.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 An unclear `outline` judgment overrides a confident `plan`

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `.archon/workflows/delivery/decide/delivery-decide.yaml:79-80` (and the generated `.archon/workflows/delivery-omp/decide/delivery-decide-omp.yaml`)
- failure mode: `plan` and `outline` are mutually exclusive, but the choice between them is made by thresholding `outline` alone: `outline_v=$(verdict outline); if [ "$outline_v" = run ]; then planning=outline; else planning=plan; fi`. `verdict()` returns `run` for anything above `T.no` (0.2), so any `outline` probability that is merely not a confident no wins, whatever `plan` scored. A large task with `plan` 0.92 and `outline` 0.39 runs `create-structure-outline` instead of `create-plan`, and `implement-outline` instead of `implement-plan`, because 0.39 is not a confident no. This inverts both the task's own threshold rule (`task.md:13`, "a phase is skipped only when JEV is confident it is unnecessary; unclear runs it, because a wrong skip costs a bad plan") and the comment three lines above it, which calls `plan` "the canonical default": an unclear reading of `outline` is precisely what skips the plan. The previous round's fix removed the `none` state but left the tie-break one-sided.
- evidence or reproduction: `15-verification` `A21` records a live `compose` call against this very task directory returning `plan 0.92 run, outline 0.39 run`. Replaying exactly those probabilities through the block's real bash body prints `{"research":"true","design":"true","prd":"true","tdd":"true","planning":"outline","implement_skill":"implement-outline",...}` and writes an execution-plan artifact whose own table contradicts the decision: `| plan | no | plan | 0.92 | <= 0.20 | What this phase establishes is still open | large |` beside `| structure outline | yes | plan | 0.39 | <= 0.20 | ... |`, with `class plan skipped` in the flowchart. Neither decide-node test reaches this state: `tests/packs.test.mjs:289` stubs `outline` at 0.05 and `:317` stubs it in the skip set, so both take the `plan` leg.
- fix direction: compare the two probabilities instead of thresholding one. Take `outline` only when `prob(outline) > prob(plan)` (or when `plan` is a confident no and `outline` is not), keeping `plan` as the floor on a tie and on any missing field. Add a decide-node case to `tests/packs.test.mjs` stubbing both above the bar with `plan` higher, asserting `planning: "plan"`, `implement_skill: "implement-plan"`, and `class outline skipped`.

### CR-002 `--input gates=outline` now aborts an auto-judged run that both `main` and HEAD completed

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `.archon/workflows/delivery/start/delivery-start.yaml:213-217` (and the generated `-omp` copy)
- failure mode: `route` validates a caller-supplied `gates` against the judged pack's gate names, then `resolve` swaps the pack to `adaptive` and replaces `names` with the adaptive pack's, which has no `outline`. The previous code translated the vocabulary unconditionally (`[ "$g" = outline ] && g=plan`); the ADV-001 rewrite replaced that translation with `[ "$gates_plan" = true ] && gates="design,prd,tdd,plan"` (`:216`), which fires only when the gates came from the `plan` autonomy level. A caller-supplied gate set is not that case, so `archon workflow run delivery-start --input gates=outline,pr "<a request that reads like lean>"` exits 1 at `resolve` with an error naming `delivery-lean` while listing `delivery-adaptive`'s gate names. `docs/cheatsheet.md:22` and `workflows/delivery.md:32` both still tell the caller that `--input gates=<...>` overrides the judgment.
- evidence or reproduction: the `resolve` body run with `workflow=lean`, `gates=outline,pr`, `explicit=false`, `gates_plan=false`. Working tree: exit 1, `confirm: unknown gate "outline" for delivery-lean; name the pack, then all, none, or a comma-separated subset of: design prd tdd plan phases pr`. The same body at `HEAD`: exit 0, `{"workflow":"lean","gates":"plan,pr","pack":"adaptive"}`. At `origin/main`: exit 0, `{"workflow":"lean","gates":"outline,pr"}`. `tests/dispatch.test.mjs` never passes a pack-specific gate name down the adaptive path, so nothing fails.
- fix direction: keep the token translation and layer the `gates_plan` widening on top of it rather than in place of it: inside the `pack = adaptive` branch, rename each `outline` token to `plan` first, then apply the `design,prd,tdd,plan` replacement when `gates_plan` is true. Make the unknown-gate message name the pack whose `names` it is listing. Add a `tests/dispatch.test.mjs` case for `resolve("lean", "outline,pr", "", "false", "false")` asserting `{"workflow":"lean","gates":"plan,pr","pack":"adaptive"}`.

### CR-003 The one human approval names a pack and a gate set that will not run

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `.archon/workflows/delivery/start/delivery-start.yaml:157-160` (and the generated `-omp` copy)
- failure mode: the `confirm` approval message still reads `This request reads like delivery-$route.output.workflow (confidence $route.output.confidence) with gates $route.output.gates. Approve to run it`. It was accurate when approving ran that pack with those gates. It no longer is: `confirm` fires only when the pack was judged unsure, and an unsure judgment is by definition not explicit, so every `oneshot`, `lean`, `full`, or `prd` shown in this message continues in `delivery-adaptive` instead. When the autonomy level is also `plan`, the gates in the message are replaced too. A reviewer reading "reads like delivery-lean with gates outline" and approving gets the adaptive chain, which may run research, a design discussion, a PRD and a TDD, pausing at `design`, `prd`, `tdd`, and `plan`: four gates where the message promised one, on phases the message did not mention. The message is the only place a person sees the route before it runs, and rejecting is the only way to pin the pack they were shown.
- evidence or reproduction: `delivery-start.yaml:155` gates the node on `$route.output.confirm == 'true'`, and `:137` sets `confirm=true` only when `confident=false`. `confident` is initialised `true` at `:74` and only the `workflow = auto` branch (`:75-94`) can clear it, so a pause here always means a judged, non-explicit route. `resolve` at `:203-206` maps `oneshot|lean|full|prd` to `pack=adaptive` for exactly that case, and `:216` rewrites `gates` to `design,prd,tdd,plan` when `gates_plan` is true. Running the `resolve` body with `workflow=lean`, `gates=outline`, `explicit=false`, `gates_plan=true` prints `{"workflow":"lean","gates":"design,prd,tdd,plan","pack":"adaptive"}` against a message that said `delivery-lean` and `outline`.
- fix direction: state in the message what `resolve` will produce. Either compute `pack` and the adaptive gate set in `route` (they depend only on `route`'s own inputs) and render both in the message, or extend the message to say that an approved judged pick runs `delivery-adaptive`, which re-decides the optional phases, and name the gate set it will pause at. Assert the message's substitutions in `tests/dispatch.test.mjs` alongside the `resolve` output they describe.

## Advisories

### ADV-001 Every decide node derives `autonomy` and `available`, and nothing reads them

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `.archon/workflows/delivery/decide/delivery-decide.yaml:70`, `:191-192`; `.archon/workflows/delivery/adaptive/delivery-adaptive.yaml` (no `$decide-*.output.autonomy` or `.available` reference)
- evidence: `grep -n "output\.autonomy\|output\.available" .archon/workflows/delivery/adaptive/delivery-adaptive.yaml` returns nothing; the pack's gates come from `$INPUTS.gates` and the `gates` node. `compose()` asks the `autonomy` choice on every call, so the four boundaries of a run pay for a judgment the pack discards. `available` reaches the artifact only through the `summary` line.
- suggestion: keep `autonomy` in `compose` (`task.md:13` asks for it, and the `deliver` skill may want it), but say in the block comment that the pack does not consume the decide node's copy, or drop the field from the node's output object so a later reader does not wire a `when:` to it expecting it to do something.

### ADV-002 The `tiers` string is written five times with no difference between the copies

- type: Refactor suggestion
- severity: trivial
- category: Maintainability and code quality
- location: `.archon/workflows/delivery/adaptive/delivery-adaptive.yaml:104`, `:140`, `:222`, `:274`; the declared default at `.archon/workflows/delivery/decide/delivery-decide.yaml:23`
- evidence: all five are byte-identical 133-character strings. The comment at `delivery-adaptive.yaml:50-51` explains that they are kept identical so the artifact's Model tier column never disagrees with itself, which is exactly what one declared default already guarantees.
- suggestion: drop the four `tiers:` lines from the includes and let the block's own default apply; the invariant then holds by construction instead of by four-way copy discipline.

### ADV-003 The artifact's `Bar` column is a hardcoded string beside a rounded probability

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `.archon/workflows/delivery/decide/delivery-decide.yaml:137`; `skills/delivery/typed-judgment/judge.mjs:555`
- evidence: `compose` already reports the bar per row (`bar: T.no`, 0.2), and the decide node ignores it and prints the literal `<= 0.20`. A change to `T.no` moves the verdict and leaves the artifact claiming the old bar. Separately, `probability` is `Number(p.toFixed(2))`, so a raw 0.204 prints as `0.2` on a row whose `Runs` column reads `yes`, which reads as a contradiction against `<= 0.20`.
- suggestion: read the bar out of the JSON the way `prob()` reads the probability, and print three decimals (or the raw value) so a row just above the bar does not render as if it were on it.

### ADV-004 The execution plan claims verification runs even when `--input verify=false` turned it off

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `.archon/workflows/delivery/decide/delivery-decide.yaml:121` (`*) printf true`), against `.archon/workflows/delivery/adaptive/delivery-adaptive.yaml:305-308`
- evidence: `runs_for()` returns `true` for every id it does not name, so `verify` is always drawn undimmed and its table row always reads `yes`. The pack gates the whole verify include on `when: "$INPUTS.verify != 'false'"`, and `delivery-decide` has no `verify` input to know about it. The artifact exists to show the chain as composed for this run, and this is the one phase where it can be wrong.
- suggestion: add a `verify` input to `delivery-decide` defaulting to `"true"`, pass `$INPUTS.verify` from the four includes, and give `verify` its own `runs_for` case.

### ADV-005 `delivery-adaptive` run directly writes `workflow: full` into `task.md`

- type: Nitpick
- severity: info
- category: Maintainability and code quality
- location: `.archon/workflows/delivery/adaptive/delivery-adaptive.yaml:57`
- evidence: the `task` include is given `workflow: full`, so a run started as `archon workflow run delivery-adaptive` (rather than through `delivery-start`, which supplies an existing `task_dir`) records `workflow: full` and, for a small request, also prints `delivery-task`'s mismatch warning `the request reads like delivery-oneshot; running delivery-full`. The pack's own description says it is usually reached through `delivery-start`, so this is the unusual path.
- suggestion: none required. If it is worth a line, note in the pack description that a direct run records `full` in `task.md` because `adaptive` is not one of the values `delivery-task` accepts.

## Dead Code and Dependency Review

- newly orphaned code: none. The `renamed` token-rewrite loop deleted from `delivery-start.yaml`'s `resolve` is replaced rather than stranded, and its removal is the substance of CR-002, not an orphan. `PHASE_CRITERIA` covers only `research` and `design`; the other six phases pass `undefined` into `noul()`, which the helper's `...(criteria ? { criteria } : {})` handles, and `judge.mjs:509-511` says why. No file, function, or fixture in the diff is unreferenced: all four adaptive fixtures and the decide fixture run under `archon workflow test`, and `evals/compose-probe.mjs` is referenced from `docs/testing.md:99`.
- dependency findings: none. No `package.json` or lockfile change; no new import in any changed `.mjs` file.

## Verdict

- decision: request_changes
- overall code-health change: positive. The judgment moves from one guess before any evidence exists to a re-decision at each boundary, with one block owning it, one fixed phase list feeding both views of the artifact, and a fallback that is the canonical full chain rather than an empty one. The three findings are seams in the routing and tie-break logic, not the shape of the change, and each has a local fix.
- rationale: CR-001 and CR-002 are reproduced behavior defects, and CR-002 is a regression against both `origin/main` and this branch's own HEAD introduced by the previous round's ADV-001 fix. CR-003 makes the only human decision in the flow act on a pack name and gate set the run will not use. All three are in code this task wrote, none is pre-existing, and each is covered by a test gap named above.

## Review Limits

- blocked or unavailable checks: acceptance (d) was not re-run; `TYPESAFE_API_KEY` is not in this environment's env, and `15-verification` `A4` records the live result with probabilities. `node evals/compose-probe.mjs` was not run for the same reason. No live probe, Archon run, or scratch repository was left behind: the two reproductions ran in `/tmp` directories removed afterward, `archon workflow test` creates no run, and `git status --short` is unchanged.
- residual manual verification: whether the eight committed samples are the right eight (`15-verification` `A20`) and a live default-input `delivery-adaptive` run reaching the installed helper (`A22`) both remain undecided; neither is settled by this diff and neither is a finding. After CR-001 is fixed, the live probe is worth rerunning against a full-shaped sample to confirm that `plan` beats `outline` on real probabilities rather than only on the stub.
