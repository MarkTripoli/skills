---
type: code-review-fixes
date: 2026-09-18
branch: compose-delivery-chain-jev
review_artifact: 18-code-review-compose-delivery-chain.md
reviewed_head_sha: 7b0ba47f4f093443ef04a9266af3c9d662864e17
fixed_head_sha: pending (workflow engine's join commits this phase's changes)
status: complete
summary: "Fixed all three gating findings and every advisory but one. CR-001: the decide node compares `plan` and `outline`'s probabilities directly instead of thresholding `outline` alone, so a confident `plan` (0.92) can no longer lose to a merely-unclear `outline` (0.39); reproduced with a new decide-node test replaying 15-verification's exact live A21 probabilities. CR-002: `resolve` now renames a caller-supplied `outline` gate to `plan` before applying the `gates_plan` widening, instead of in place of it, so `--input gates=outline` on a judged-lean request reaches `delivery-adaptive` instead of aborting; the unknown-gate error also now names the pack whose gate list it prints. CR-003: the `confirm` approval message now states that an approved judged oneshot/lean/full/prd pick continues in `delivery-adaptive` and pauses at that pack's own gate ceiling (design, prd, tdd, plan, phases, pr), not the judged pack's own gates, so a reviewer approving `delivery-lean with gates outline` is told up front that more gates may follow. ADV-001, ADV-002, ADV-003 (partially), and ADV-004 fixed; ADV-005 left advisory per the reviewer's own \"none required.\" `npm test` is 71/71 (68 pre-existing plus 3 new), `archon workflow test delivery-adaptive` is 4/4, `build-packs --check` and `validate.mjs` are clean."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: none. `git merge-base origin/main HEAD` is still `a50132a198b6feac8dd0a46bb9842b6d70edb8ac`, `HEAD` is still `7b0ba47f4f093443ef04a9266af3c9d662864e17`; no commits landed on `origin/main` or this branch between the review and this pass.
- unrelated changes preserved: the untracked `.ignore` predates this session and is left untouched, per the review's own scope note.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-001

- disposition: fixed
- evidence: `.archon/workflows/delivery/decide/delivery-decide.yaml`'s `planning` derivation used to threshold `outline` alone (`if outline_v = run then outline else plan`), so any `outline` probability merely above the skip bar (0.20) won regardless of how confident `plan` scored. Replaced it with a direct comparison: `plan_p=$(prob plan); outline_p=$(prob outline)`, then `outline` is chosen only when both probabilities are present and `outline_p > plan_p` (via `awk`); a tie or either probability missing floors to `plan`. Reproduced the review's own evidence: a new test in `tests/packs.test.mjs` ("decide node: plan and outline both score above the bar, and plan is higher, floors planning to plan rather than outline (CR-001)") stubs the exact live probabilities 15-verification's A21 recorded against this task directory (`plan` 0.92, `outline` 0.39) and asserts `planning: "plan"`, `implement_skill: "implement-plan"`, `class outline skipped` in the flowchart, and no `class plan skipped`.
- files changed: `.archon/workflows/delivery/decide/delivery-decide.yaml`, `.archon/workflows/delivery-omp/decide/delivery-decide-omp.yaml` (regenerated), `tests/packs.test.mjs` (new test)
- regression check: `node --test tests/packs.test.mjs` (new test passes; both existing decide-node tests still pass), `archon workflow test delivery-adaptive` (4 passed, 0 failed), full `npm test` (71/71)

### CR-002

- disposition: fixed
- evidence: `delivery-start.yaml`'s `resolve` node replaced the unconditional `outline`->`plan` token rename with a `gates_plan`-only widening (`[ "$gates_plan" = true ] && gates="design,prd,tdd,plan"`), so a caller-supplied `gates=outline` on a judged (non-explicit) `lean` pick, at any other autonomy level, passed `outline` straight through into `adaptive`'s own gate-name validation, which has no `outline`, and aborted the run. Restored the token translation and layered the `gates_plan` widening on top of it, exactly as the review's fix direction asked: inside the `pack = adaptive` branch, every gate token is renamed `outline`->`plan` first (a plain no-op for every other pack-shared name), then `gates_plan=true` still widens the whole set to `design,prd,tdd,plan`. Also fixed the unknown-gate error message, which named `$workflow` (the judged pack, e.g. `lean`) while printing `$names` (already switched to `adaptive`'s own list) — it now names `$pack`. New test in `tests/dispatch.test.mjs` ("resolve: a caller-supplied gates=outline on a judged (non-explicit) lean pick is renamed to adaptive's own gate name instead of aborting the swap to delivery-adaptive (CR-002)") reproduces the review's exact repro inputs (`workflow=lean, gates=outline,pr, explicit=false, gates_plan=false`) and asserts `{"workflow":"lean","gates":"plan,pr","pack":"adaptive"}`, plus an unknown-gate case asserting the error now reads `for delivery-adaptive`.
- files changed: `.archon/workflows/delivery/start/delivery-start.yaml`, `.archon/workflows/delivery-omp/start/delivery-start-omp.yaml` (regenerated), `tests/dispatch.test.mjs` (new test)
- regression check: `node --test tests/dispatch.test.mjs` (new test passes; the ADV-001 gates_plan=true cases and every other resolve/route/confirm case still pass), `archon workflow test delivery-adaptive` and `archon workflow test delivery-start` fixtures unaffected (`confirm-lean.stubs.yaml`'s `resolve` stub value, `design,prd,tdd,plan`, is unchanged since `gates_plan=true` still wins there), full `npm test` (71/71)

### CR-003

- disposition: fixed
- evidence: the `confirm` node's approval message stated only the judged pack and its own gates (`delivery-$workflow ... with gates $gates`), which is what would run for an explicit pick but not for a judged one: a judged (non-explicit) `oneshot`, `lean`, `full`, or `prd` continues in `delivery-adaptive` instead, pausing at up to four gates (`design, prd, tdd, plan`) the message never named. Extended the message (still stating the judged pack/gates first, unchanged) to say that an approved judged oneshot/lean/full/prd pick runs as `delivery-adaptive` instead, which re-decides the optional phases and pauses at that pack's own gate ceiling (`design, prd, tdd, plan, phases, pr`) rather than the gates just named, and that a judged `bugfix`/`epic`/`program` (which never map to adaptive) runs exactly as shown. This states the ceiling statically rather than computing the exact post-translation gate set in a second node output field, per the review's second suggested option, avoiding a duplicate translate/widen implementation in `route` alongside the one CR-002 fixed in `resolve`. New test in `tests/dispatch.test.mjs` ("confirm: the approval message states that a judged pick continues in delivery-adaptive with its own gate ceiling, not the judged pack's gates (CR-003)") extracts and folds the `approval.message` block scalar the way Archon's `>-` folding would, substitutes the review's own repro values (`workflow=lean, confidence=0.55, gates=outline`), asserts the message names the pack swap and the gate ceiling, and cross-checks that `resolve`'s actual output for the same inputs stays within that named ceiling.
- files changed: `.archon/workflows/delivery/start/delivery-start.yaml`, `.archon/workflows/delivery-omp/start/delivery-start-omp.yaml` (regenerated), `tests/dispatch.test.mjs` (new test)
- regression check: `node --test tests/dispatch.test.mjs` (new test passes), `archon workflow test delivery-start`'s `confirm-lean` fixture (its `resolved-text-contains` substring, `"delivery-lean (confidence 0.55) with gates outline"`, is still a prefix of the extended message, so it still matches), full `npm test` (71/71)

## Advisory Decisions

### ADV-001

- disposition: accepted
- reason: dropping `autonomy`/`available` from the decide node's output object (the finding's second option) would touch `output_format.required` and every deepEqual assertion of the node's full JSON across `tests/packs.test.mjs`, for a maintainability nitpick with no live symptom. Took the finding's first option instead: added a one-line comment above the `autonomy` derivation stating that `task.md`/the `deliver` skill are the intended readers and that `delivery-adaptive` does not consume either field, so a later reader does not wire a `when:` to it expecting behavior.
- files changed: `.archon/workflows/delivery/decide/delivery-decide.yaml`, `.archon/workflows/delivery-omp/decide/delivery-decide-omp.yaml` (regenerated)

### ADV-002

- disposition: accepted
- reason: the four `tiers:` lines in `delivery-adaptive.yaml`'s `decide-*` includes were byte-identical copies of `delivery-decide`'s own declared default; removed all four so the includes take the default, and the invariant (the artifact's Model tier column never disagreeing with itself) holds by construction instead of by four-way copy discipline, exactly as the finding suggested. Updated the stale block comment that explained why the four copies were "kept identical."
- files changed: `.archon/workflows/delivery/adaptive/delivery-adaptive.yaml`, `.archon/workflows/delivery-omp/adaptive/delivery-adaptive-omp.yaml` (regenerated)

### ADV-003

- disposition: accepted
- reason: fixed the half of the finding with a real risk (a hardcoded `<= 0.20` string in the artifact goes stale if `T.no` ever changes) by adding a `bar()` sed extractor next to `prob()`/`why()` that reads the same `"bar":<value>` field `compose()` already emits per phase, and rendering it with `printf '%.2f'` so today's output (`<= 0.20`) is byte-identical and no pinned test literal changes. Left the other half — `probability: Number(p.toFixed(2))` in `judge.mjs` rounding a value just above the bar (0.204) down to a string indistinguishable from the bar itself (0.20) — as `left_advisory`: fixing it means changing the rounding of every probability `compose`, `slug`, `tier`, and every other `noul`/`score` caller displays, which several tests across `tests/judge.test.mjs` and `tests/packs.test.mjs` pin to two decimals, disproportionate to a trivial-severity nitpick with no reproduced failure.
- files changed: `.archon/workflows/delivery/decide/delivery-decide.yaml`, `.archon/workflows/delivery-omp/decide/delivery-decide-omp.yaml` (regenerated)

### ADV-004

- disposition: accepted
- reason: added a `verify` input to `delivery-decide` (default `"true"`, read the same `${INPUTS_VERIFY:-$INPUTS.verify}` way every other input is), threaded `verify: $INPUTS.verify` from all four `decide-*` includes in `delivery-adaptive.yaml`, and gave `verify` its own `runs_for()` case instead of falling into the `*) printf true` catch-all, so `--input verify=false` now draws the artifact's `verify` table row as `no` instead of always `yes`. Added a fifth step to the existing "decide node: the TypeSafe stub skips a confident-no phase..." test in `tests/packs.test.mjs` asserting the row reads `no` under `INPUTS_VERIFY=false`, and updated `runDecideNode`'s default test environment to set `INPUTS_VERIFY: "true"` (without it, the un-substituted `$INPUTS.verify` macro text hit `set -u` as an unbound `$INPUTS` variable, the same way every other input's default is already simulated in that harness).
- files changed: `.archon/workflows/delivery/decide/delivery-decide.yaml`, `.archon/workflows/delivery/adaptive/delivery-adaptive.yaml`, both `-omp` copies (regenerated), `tests/packs.test.mjs`

### ADV-005

- disposition: left_advisory
- reason: the review's own assessment says "suggestion: none required," offering only an optional documentation line if the finding is "worth a line." Left as-is; the pack's own description already directs a reader to `delivery-start` as the usual entry point.

## Verification

- command: `npm test`
- result: exit 0, `tests 71 / pass 71 / fail 0` (68 pre-existing plus the three new CR-001/CR-002/CR-003 tests), `ok: 41 skills, 54 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command: `archon workflow test delivery-adaptive`
- result: `4 passed, 0 failed` over `prd-path`, `skipped`, `helper-unavailable`, `all-phases`.
- command: `node scripts/build-packs.mjs --check`
- result: exit 0, no output (the `-omp` flavor was regenerated via `node scripts/build-packs.mjs` with no flags after every native-pack edit).
- command: `node scripts/validate.mjs`
- result: exit 0, `ok: 41 skills, 54 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command: `node scripts/check-commits.mjs origin/main..HEAD`
- result: exit 0, `ok: 23 subjects`.

## Remaining Blocks

- None.
