---
task: one-thing-i-m
type: verification
summary: "An independent pass re-ran the full repository suite, commit validation, focused model-routing behavior, and the changed-test diff. All commands passed and the test diff retained its strength; the documentation/changeset item was decided by direct inspection because JEV marked that prose observation unclear. The implementation is ready for code review with the caller-supplied availability limitation retained."
status: passed
revision: ce60f51
target: origin/main
---

# Verification

## Run

- Revision: [`ce60f51` on `one-thing-i-m`]; clean tree before this artifact.
- Target: [`origin/main`]; 11 files changed, 1 of them tests.
- Checks from: [`package.json` scripts and `scripts/check-commits.mjs`].
- Coverage: [5 desired-end-state acceptance items; 5 claimed by implementation receipts, 0 claimed by none].
- Graded by: typed-judgment helper `grade-steps`; model `jev-1.13.0`, tokens 2055 in / 249 out for commands and 597 in / 39 out for diff; A5 was unclear and decided by hand.

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | Repository test suite | [`npm test`] | Exits 0 with no failing test. | Validation passed, plugin is in sync, and Node reported 155 passed, 0 failed; exit 0. | pass | 0.95 | 0 |
| C2 | Commit subjects | [`npm run check-commits -- origin/main..HEAD`] | Exits 0 with all subjects valid. | `ok: 11 subjects`; exit 0. | pass | 0.91 | 0 |
| T1 | `tests/atomic-model-routing.test.mjs` | [`git diff origin/main...HEAD -- tests/atomic-model-routing.test.mjs`] | The change keeps this check's strength. | Exact record expectations were updated and availability, unavailable economy, explicit empty availability, and fixed-mode tests were added; no tests were deleted, skipped, or weakened. | pass | 0.89 | 0 |
| A1 | Available model invariant, from `05-plan-one-thing-i-m.md` Desired End State | [`node --test tests/atomic-model-routing.test.mjs`] | `selectStageModel` never returns a model absent from the normalized available set. | Focused tests passed for unavailable economy, explicit empty availability, and fixed-mode rejection of an unavailable configured model. | pass | 0.81 | 0 |
| A2 | JEV escalation, from `05-plan-one-thing-i-m.md` Desired End State | [`node --test tests/atomic-model-routing.test.mjs`] | Eligible non-code phases use JEV only when reasoning is available; otherwise economy is selected. | Focused test passed with reasoning absent: economy selected with `source: policy` and the helper was not called. Existing reasoning-choice test passed with both candidates available. | pass | 0.80 | 0 |
| A3 | Economy policy, from `05-plan-one-thing-i-m.md` Desired End State | [`node --test tests/atomic-model-routing.test.mjs`] | Mutation, tool-oriented, and unknown phases use the economy candidate only. | Existing writing and unknown-stage test passed and asserted no JEV call; full suite also passed. | pass | 0.86 | 0 |
| A4 | Workflow transport, from `05-plan-one-thing-i-m.md` Desired End State | [`git diff origin/main...HEAD -- atomic/workflows/delivery.ts atomic/lib/controller.mjs`] | Delivery accepts and forwards `available_models`. | TypeBox defines `available_models`; controller includes it in checkpoint inputs and forwards it as `availableModels` to `selectStageModel`. | pass | 0.86 | 0 |
| A5 | User-facing contract, from `05-plan-one-thing-i-m.md` Desired End State | [`git diff origin/main...HEAD -- docs/model-routing.md .changeset/economical-model-routing.md`] | Documentation and a changeset describe the routing contract. | `docs/model-routing.md` documents the input, defaults, filtering, and failure behavior; `.changeset/economical-model-routing.md` contains the minor release entry. JEV marked this prose observation unclear; direct inspection confirms it. | pass | hand | 0 |

## Findings

None.

## Missing

None.

## Human Review

### Review targets

- The items table, especially the available-model invariant and the caller-owned availability limitation.
- The changed test diff, which added coverage without deleting or weakening checks.

### Verify

- [ ] Run `npm test`; it exits 0 with 155 passing tests.
- [ ] Run `npm run check-commits -- origin/main..HEAD`; it exits 0 with 11 valid subjects.
- [ ] Re-decide A5 by inspecting `docs/model-routing.md` and `.changeset/economical-model-routing.md`.

### Known limits

- A5 was unclear to JEV and was decided by direct inspection.
- Availability is caller-supplied; this pass does not prove provider account access.
