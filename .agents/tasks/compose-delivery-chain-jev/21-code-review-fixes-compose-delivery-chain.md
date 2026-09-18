---
type: code-review-fixes
date: 2026-09-18
branch: compose-delivery-chain-jev
review_artifact: 20-code-review-compose-delivery-chain.md
reviewed_head_sha: 7b0ba47f4f093443ef04a9266af3c9d662864e17
fixed_head_sha: pending (workflow engine's join commits this phase's changes)
status: complete
summary: "Fixed both gating findings and all four advisories. CR-001: `route` validated a caller-supplied `--input gates=` against the judged pack's own gate names before `resolve` swapped that pack for `delivery-adaptive`, so a legitimate ask (`gates=design,plan` on a request judged `oneshot`) aborted naming a pack the run was never going to use. `route` now computes the same judged-to-adaptive swap `resolve` already applied (and outputs it as `pack`, which `resolve` reuses instead of recomputing), and validates a translated copy of the gates against the pack that will actually run; `route.output.gates` itself, and `resolve`'s own rename-then-widen logic, are untouched, so the confirm message and `resolve`'s CR-002 fix from the prior round still see the judged pack's own pre-swap gates. CR-002: `docs/cheatsheet.md` claimed `/deliver` \"routes the same way\" as `delivery-start`, but `/deliver` starts the judged pack directly and never reaches `delivery-adaptive`; the sentence now says so and names `delivery-start` as the way to the adaptive chain from an agent session, per the review's smaller-diff option. ADV-001: the execution-plan flowchart now dims `verify` in the `class ... skipped` loop, matching the table row it already dimmed. ADV-002: `composeState` excludes `type: execution-plan` artifacts, so a boundary no longer re-judges with its own prior verdict in the state. ADV-003: left advisory per the review's own \"none required.\" ADV-004: `workflows/delivery.md`'s `delivery-decide` row now lists the `verify` input. `npm test` is 72/72 (71 pre-existing plus 1 new), `archon workflow test delivery-adaptive` is 4/4, `archon workflow test delivery-start` is 3/3, `build-packs --check` and `validate.mjs` are clean."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: none. `git merge-base origin/main HEAD` is still `a50132a198b6feac8dd0a46bb9842b6d70edb8ac`, `HEAD` is still `7b0ba47f4f093443ef04a9266af3c9d662864e17`; no commits landed on `origin/main` or this branch between the review and this pass.
- unrelated changes preserved: the untracked `.ignore` predates this session and is left untouched, per the review's own scope note.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-001

- disposition: fixed
- evidence: `delivery-start.yaml`'s `route` node derived its gate-name vocabulary (`names`) from the judged `$workflow` and validated a caller-supplied `--input gates=` against it, before `resolve` swapped that judged pack for `delivery-adaptive` whenever the pick was judged (not explicit) and one of `oneshot`/`lean`/`full`/`prd`. A caller asking for a gate `delivery-adaptive` has but the judged pack lacks (`gates=design,plan` on a request judged `oneshot`, whose own gate list is just `pr`) aborted at `route` naming `delivery-oneshot`, even though the run was always going to continue in `delivery-adaptive`. Fixed by computing the same swap in `route` (the `explicit` flag it already derives, moved earlier so it is available before the gate check): `pack=$workflow`, swapped to `adaptive` under the same `oneshot|lean|full|prd` condition `resolve` used. Validation now checks a translated copy of the gates (`check_gates`/`check_names`, with the same `outline`->`plan` rename `resolve` applies for real) against `$pack`, not `$workflow`; `route.output.gates` and `resolve`'s own rename-then-widen block are byte-for-byte unchanged, since the `confirm` message and `resolve`'s CR-002 fix from the prior round both still need the judged pack's own pre-swap gates. `route` also now outputs `pack`, which `resolve` reuses directly for the no-reject path instead of recomputing the swap itself (a reject text still recomputes it, since a reject always pins a fixed pack and never adaptive). New test in `tests/dispatch.test.mjs` ("route: a gate the judged pack lacks but delivery-adaptive has is accepted...") reproduces the review's exact repro (`workflow` judged `oneshot` at confidence 0.95, `INPUTS_GATES=design,plan` and separately `INPUTS_GATES=phases`) and asserts both succeed with `pack: "adaptive"` and the gates unchanged, while an explicit `--input workflow=oneshot` with the same gate still fails naming `delivery-oneshot`. The existing "route: a gate name the chosen pack does not have fails..." test's `huh`-on-no-helper case now correctly names `delivery-adaptive` (the pack the fallback `full` judgment actually continues in) instead of `delivery-full`.
- files changed: `.archon/workflows/delivery/start/delivery-start.yaml`, `.archon/workflows/delivery-omp/start/delivery-start-omp.yaml` (regenerated), the three `delivery/start/fixtures/*.stubs.yaml` route stubs (and their `-omp` copies) now carry the new required `pack` field, `tests/dispatch.test.mjs`
- regression check: `node --test tests/dispatch.test.mjs` (11/11, new test passes, all `resolve`/`confirm` cases from the prior two rounds still pass unchanged), `archon workflow test delivery-start` (3/3), `archon workflow test delivery-adaptive` (4/4, unaffected), full `npm test` (72/72)

### CR-002

- disposition: fixed
- evidence: `docs/cheatsheet.md:22`'s sentence this task's own change added said "In an agent session: `/deliver <request>` routes the same way, starts the run, and replies with the run id and the first pause" — but `deliver`'s own `SKILL.md` (untouched by any phase of this task) starts `archon workflow run delivery-<pack>` directly, on the pack it judges itself, and never reaches `delivery-start` or `delivery-adaptive`. Took the review's second, smaller-diff option (explicitly endorsed as valid: "leaves the divergence deliberate and stated") rather than rewriting `deliver`'s routing to match `delivery-start`'s judged-to-adaptive swap, since that skill carries no test coverage and this task's scope is the adaptive chain, not `deliver`'s routing. The sentence now reads: "`/deliver <request>` judges the same pack and autonomy level but starts that fixed pack directly, never `delivery-adaptive`; run `archon workflow run delivery-start \"<request>\"` instead of `/deliver` for the adaptive chain from an agent session." Grepped `docs/`, `workflows/`, `shared/`, `skills/delivery/deliver/`, and `README.md` for any other claim that `/deliver` reaches `delivery-adaptive`; none found.
- files changed: `docs/cheatsheet.md`
- regression check: no test covers this file (prose only, no code path); re-read the edited sentence against `deliver/SKILL.md`'s actual `archon workflow run delivery-<pack>` command to confirm the two now agree.

## Advisory Decisions

### ADV-001

- disposition: accepted
- reason: `delivery-decide.yaml`'s `for id in research design prd tdd plan outline app_test` dim loop drew every judged phase but not `verify`, even though `runs_for verify` already answers correctly under `--input verify=false` (the prior round's ADV-004 fix) and the table row below the flowchart already read `no`. Added `verify` to the loop, so the flowchart and the table cannot disagree. New assertion on the existing "decide node: ... verify=false ..." test in `tests/packs.test.mjs` checks the artifact now contains `class verify skipped` under `INPUTS_VERIFY=false`, not just the table row.
- files changed: `.archon/workflows/delivery/decide/delivery-decide.yaml`, `.archon/workflows/delivery-omp/decide/delivery-decide-omp.yaml` (regenerated), `tests/packs.test.mjs`

### ADV-002

- disposition: accepted
- reason: `composeState` in `judge.mjs` collected every `^\d{2}-.*\.md$` file in the task directory, including the execution-plan artifact a prior boundary's own `decide` node wrote, whose `summary` is that same judgment's own verdict rather than evidence — a re-judgment at the next boundary could anchor on its own earlier answer instead of judging afresh. Took the review's first suggested option: excluded `type: execution-plan` entries from the `artifacts` list entirely (`.filter((entry) => entry.type !== "execution-plan")`), rather than keeping the entry with its `summary` replaced, since the boundary name is already a separate `boundary` field the node writes and nothing reads the execution-plan artifact's summary for any other purpose. Extended the existing "judge compose: ..." test in `tests/judge.test.mjs`: writes a second artifact with `type: execution-plan` alongside the existing research artifact, and the existing `state.artifacts` assertion (already pinned to the research entry alone) now also proves the execution-plan entry is excluded.
- files changed: `skills/delivery/typed-judgment/judge.mjs`, `tests/judge.test.mjs`

### ADV-003

- disposition: left_advisory
- reason: the review's own assessment says "suggestion: none required now," naming the cost (a judged `oneshot` now always runs a `plan` phase it did not run before) as inherent to the spec's two-way `plan`/`outline` question rather than a defect, and offering only a future third-state redesign as a task of its own if the cost ever matters. Left as-is.

### ADV-004

- disposition: accepted
- reason: `workflows/delivery.md:47`'s `delivery-decide` row listed `skills_dir`, `task_dir`, `boundary`, `tiers`, `gates`, `app_test` but not `verify`, which the prior round's ADV-004 fix had already added as a sixth input (`delivery-decide.yaml:31-33`, threaded from all four `delivery-adaptive` includes). Added `verify` to the row's input list.
- files changed: `workflows/delivery.md`

## Verification

- command: `npm test`
- result: exit 0, `tests 72 / pass 72 / fail 0` (71 pre-existing plus the one new CR-001 test), `ok: 41 skills, 54 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command: `archon workflow test delivery-adaptive`
- result: `4 passed, 0 failed` over `prd-path`, `skipped`, `helper-unavailable`, `all-phases`.
- command: `archon workflow test delivery-start`
- result: `3 passed, 0 failed` over `confirm-lean`, `explicit-bugfix`, `unattended-oneshot` (all three fixtures' `route` stubs updated with the new `pack` field their `output_format` now requires; behavior unchanged, since `resolve`'s stub values in each fixture already matched what `route`+`resolve` produce end to end).
- command: `node scripts/build-packs.mjs --check`
- result: exit 0, no output (the `-omp` flavor was regenerated via `node scripts/build-packs.mjs` with no flags after every native-pack edit, covering both `delivery-start` and `delivery-decide`).
- command: `node scripts/validate.mjs`
- result: exit 0, `ok: 41 skills, 54 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command: `node scripts/check-commits.mjs origin/main..HEAD`
- result: exit 0, `ok: 23 subjects`.

## Remaining Blocks

- None.
