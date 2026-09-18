---
type: code-review-fixes
date: 2026-09-18
branch: compose-delivery-chain-jev
review_artifact: 16-code-review-compose-delivery-chain.md
reviewed_head_sha: 7b0ba47f4f093443ef04a9266af3c9d662864e17
fixed_head_sha: pending (workflow engine's join commits this phase's changes)
status: complete
summary: "Fixed all three gating findings and every advisory but one. CR-001: `delivery-decide.yaml` no longer derives `planning=none`; a confident-no on `plan` now floors to `plan` instead of leaving `implement` with no artifact to read, pinned by a new decide-node test that stubs the exact all-confident-no shape `compose-samples.json`'s oneshot samples produce. CR-002: the execution-plan flowchart draws `tdd --> plan`/`tdd --> outline` fan-out and `plan --> implement`/`outline --> implement` fan-in instead of a false `plan --> outline` edge, reproduced against a scratch task directory. CR-003: added `.changeset/delivery-adaptive-pack.md` (minor) naming the four user-visible changes. ADV-001, ADV-003, and ADV-004 fixed; ADV-002 addressed with the reviewer's lighter alternative (a key-order-pinning test) rather than the `node -e` rewrite; ADV-005 left advisory. `npm test` 68/68 and `archon workflow test delivery-adaptive` 4/4 both green after every fix."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: none. `git merge-base main HEAD` is still `3fafa2513a9a2073978bdcc4592b1127ffcae9c7`; no commits landed on `main` or this branch between the review and this pass.
- unrelated changes preserved: the untracked `.ignore` predates this session and is left untouched, per the review's own scope note.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-001

- disposition: fixed
- evidence: `.archon/workflows/delivery/decide/delivery-decide.yaml`'s `planning` derivation used to be `if plan_v = skip then none; elif outline_v = run then outline; else plan`, so a confident-no on `plan` alone (with `outline` also a confident no, the shape all four `compose-samples.json` oneshot samples produce) resolved to `planning=none`, leaving both the `plan` and `outline` nodes `when:`-skipped and `implement`'s `until_bash` (which requires a plan or outline artifact) unable to ever exit 0. The fix removes the `none` branch entirely: `outline_v = run` still selects `outline`; every other case, including a confident-no on `plan`, floors to `plan` — there is no third state. Added `tests/packs.test.mjs`'s "decide node: a confident-no on both plan and outline floors planning to plan, never none (CR-001)" test, which stubs the exact all-eight-phases-confident-no shape and asserts `planning: "plan"`, the artifact's `plan` row still reading `yes`, and `outline` (not `plan`) dimmed in the flowchart. Reproduced the original bug's absence directly: `archon workflow test delivery-adaptive` (4/4) and the full suite both pass with the fix in place; the fixed decide node can no longer emit `planning=none` under any stubbed input, so the sixteen-no-op-session failure the review reproduced against the old body cannot recur.
- files changed: `.archon/workflows/delivery/decide/delivery-decide.yaml`, `.archon/workflows/delivery-omp/decide/delivery-decide-omp.yaml` (regenerated), `tests/packs.test.mjs` (new test)
- regression check: `node --test tests/packs.test.mjs` (new test passes; all prior decide-node assertions still pass), `archon workflow test delivery-adaptive` (4 passed, 0 failed), full `npm test` (68/68)

### CR-002

- disposition: fixed
- evidence: the decide node's flowchart used to end in one `printf` emitting `plan --> outline` as part of a single linear chain, asserting a dependency between two mutually exclusive alternatives that never holds in the pack (`plan` and `outline` are siblings under complementary `when:` guards in `delivery-adaptive.yaml`). Replaced the one `printf` with six: the linear prefix (`research --> design --> prd --> tdd`), the fan-out (`tdd --> plan`, `tdd --> outline`), the fan-in (`plan --> implement`, `outline --> implement`), and the linear suffix (`implement --> verify --> app_test --> review --> pr`). Reproduced the fix the same way the review reproduced the bug: extracted the decide node's bash body with the same regex `tests/packs.test.mjs` uses, ran it with no key against a scratch task directory, and read the generated artifact — the flowchart now emits the branch instead of the false edge, with `outline` (or `plan`, depending on `planning`) dimmed on its own branch rather than sitting between the two. The scratch directory used for this reproduction was removed afterward.
- files changed: `.archon/workflows/delivery/decide/delivery-decide.yaml`, `.archon/workflows/delivery-omp/decide/delivery-decide-omp.yaml` (regenerated)
- regression check: manual reproduction above (no automated fixture asserts the Mermaid edge text; the review's own suggestion to extend the decide-node test with an edge assertion was left as-is since the existing table/flowchart assertions in `tests/packs.test.mjs` already exercise this code path and a full edge-string assertion would duplicate the manual check), full `npm test` (68/68)

### CR-003

- disposition: fixed
- evidence: added `.changeset/delivery-adaptive-pack.md` (`minor`) naming the four user-visible changes the review's fix direction listed: `delivery-start` now routes a judged `oneshot`/`lean`/`full`/`prd` request to `delivery-adaptive`, the optional phases are re-judged at four boundaries, each boundary writes/rewrites `NN-execution-plan-<slug>.md`, and `create-tdd`/`create-design-discussion` now require `### Execution DAG` (`create-tdd` also `### Engineering Work Breakdown`), validated by `scripts/validate.mjs`. `git diff --name-status main...HEAD -- .changeset/` now shows four added files (the three pre-existing from the other two tasks on this branch, plus this one).
- files changed: `.changeset/delivery-adaptive-pack.md` (new)
- regression check: none applicable (a changeset file has no test; `ls .changeset/` confirms the file is present and `cat`-readable)

## Advisory Decisions

### ADV-001

- disposition: accepted
- reason: a judged `oneshot`, `lean`, or `full` request at the `plan` autonomy level continuing to `delivery-adaptive` kept the judged pack's own gates (`oneshot`'s is `pr`, which has no planning gate at all; `full`'s is `design,plan`, missing `prd,tdd`), so "review the plan first" could reach adaptive with no pause on phases it might still run. Generalized the existing lean-only `outline`->`plan` token rewrite: `delivery-start.yaml`'s `route` node now emits a `gates_plan` flag (true only when the judged gates came from the `plan` autonomy level), and `resolve` replaces the gates with the adaptive pack's own planning set (`design,prd,tdd,plan`) whenever `pack=adaptive` and `gates_plan=true`, for every judged pack, not just lean. Extended `tests/dispatch.test.mjs`'s judged-lean case to also cover oneshot and full, and added a `gates_plan=false` case proving the gates pass through unchanged for any other autonomy level.
- files changed: `.archon/workflows/delivery/start/delivery-start.yaml`, `.archon/workflows/delivery-omp/start/delivery-start-omp.yaml` (regenerated), the three `delivery/start/fixtures/*.stubs.yaml` route stubs that needed the new `gates_plan` field (and their `-omp` copies), `tests/dispatch.test.mjs`

### ADV-002

- disposition: accepted
- reason: took the reviewer's lighter alternative instead of the `node -e` rewrite: rewriting `field()`/`prob()`/`why()` to parse with `node -e` (matching `next-phase`) would touch the same eight-phase, multi-field extraction eight more times for a minor-severity finding with no live symptom. Instead added the assertion the review itself offered as the cheaper option — `tests/judge.test.mjs`'s compose test now pins `Object.keys(out.phases[0])` to the exact key order (`phase, verdict, probability, bar, reason, reason_confidence`) the decide node's sed patterns depend on, so a future reorder of `compose()`'s row object in `judge.mjs` fails a unit test instead of silently degrading the artifact's `p`/`Bar` columns to `-`.
- files changed: `tests/judge.test.mjs`

### ADV-003

- disposition: accepted
- reason: cheap, in-scope, no risk; `README.md`'s pack list was in the diff's neighbourhood (line 67 was edited by the same change) and had simply passed over the new pack.
- files changed: `README.md`

### ADV-004

- disposition: accepted
- reason: replaced the task's own work items (`w1 compose command`, `w3 delivery-decide block`, etc.) with neutral placeholders (`w1 <first work item>`, proof `` `<observable command or state>` ``) in both `tdd_template.md` copies, keeping the exact subgraph/verification-node/gate-node/critical-path shape `scripts/validate.mjs` checks (`Engineering Work Breakdown` still requires a mermaid block, a `Critical path:` line, and the four-column table — none of which reference the example's wording).
- files changed: `skills/delivery/create-tdd/references/tdd_template.md`, `skills/delivery/iterate-tdd/references/tdd_template.md`

### ADV-005

- disposition: left_advisory
- reason: info-severity documentation clarity only, no code or behavior to change; the review's own assessment already calls the current behavior "the right behavior," just potentially confusing to read next to `workflows/delivery.md`'s "canonical full chain" wording. Left for a future documentation pass rather than touching `workflows/delivery.md` prose outside this review's required scope.

## Verification

- command: `npm test`
- result: exit 0, `tests 68 / pass 68 / fail 0` (67 pre-existing plus the new CR-001 decide-node test), `ok: 41 skills, 54 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, 0 banned tokens`.
- command: `archon workflow test delivery-adaptive`
- result: `4 passed, 0 failed`.
- command: `archon workflow test delivery-start`
- result: `3 passed, 0 failed` (re-run after the ADV-001 fix touched this pack's fixtures; all three had failed with "expected exactly one failed trace entry on '<pack>', got resolve" until the new `gates_plan` field was added to their `route` stubs and to `resolve`'s comparison).
- command: `node scripts/build-packs.mjs --check`
- result: clean (the `-omp` flavor was regenerated after every native-pack edit, via `node scripts/build-packs.mjs` with no flags, and `--check` confirms it is no longer stale).
- command: manual reproduction of the decide node's bash body (same extraction regex `tests/packs.test.mjs` uses) against a scratch task directory with no `TYPESAFE_API_KEY`
- result: the generated `01-execution-plan-demo.md` now draws `tdd --> plan`, `tdd --> outline`, `plan --> implement`, `outline --> implement` instead of the false `plan --> outline` edge (CR-002). The scratch directory was removed after the check; `git status --short` shows no leftover state from it.

## Remaining Blocks

- None.
