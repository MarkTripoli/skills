---
type: code-review
date: 2026-09-20
branch: feat/jev-ios
base_branch: main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: a44dce14068ac13fbee170e8c84e4b1983d71511
status: findings
summary: "The implementation and current receipts cover successful and blocked iOS runs, but the required failed-outcome cleanup proof is absent and launch failure can skip native cleanup. The next phase must repair the cleanup ownership path and retain a genuine failed receipt before handoff."
---

# Code Review

## Scope

- merge base: `main` at `4458fbf21e199dad45376b8164f78c2165ac1d20` (`origin/main`)
- reviewed HEAD: `a44dce14068ac13fbee170e8c84e4b1983d71511`
- commits: `0bcffbb`, `3a5f221`, `11d748b`, `b1054d5`, `8a45b9b`, `2384ca5`, `a44dce1`
- staged and unstaged changes: none; task evidence remains untracked and is excluded from product scope
- task-owned untracked files: `.agents/tasks/jev-ios/.atomic-delivery/` and retained evidence under `.agents/tasks/jev-ios/evidence/`
- excluded changes: task artifacts and evidence files are not product diff subjects, but their claims were checked as verification inputs

## Previous Round

- previous artifact: None.
- `None.`

## Requirements and Standards

- task or ticket: `.agents/tasks/jev-ios/task.md`, especially acceptance items 3, 5, and 6
- implementation source: `.agents/tasks/jev-ios/01-implementation-jev-ios.md` and `.agents/tasks/jev-ios/03-implementation-jev-ios.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `skills/delivery/review-code/SKILL.md`

## Change Profile

- intent and expected behavior: add the preserved iOS adapter and fixture, enforce identity-safe native interaction and replacement, record standalone evidence, and retain truthful terminal outcomes and cleanup.
- change description quality: task and continuation artifacts identify the released base, exact implementation revision, retained failures, and remaining review boundary. `04-verification-continuation-jev-ios.md` cites the older `verification-20260920/replacement` receipt for P8 even though current-revision `verification-8a45b9b/replacement` evidence exists; this is stale provenance but not the product defect below.
- implementation model and review model: implementation/test/diagnostic authorship is recorded as `openai-codex/gpt-5.6-luna-fast`; this review was performed independently against the full diff and retained receipts.
- changed-line size and logical cohesion: 661 insertions and 30 deletions across the iOS adapter, fixture, shared acceptance controller, tests, docs, and changeset; the functional changes are cohesive around native acceptance.
- resulting large-file concerns: no newly oversized source file requiring a split was found.
- dependency or lockfile changes: none.

## Tests Reviewed First

- behavior claimed by tests: native target authorization, iOS metadata normalization, PID/device checks, safe replacement, idempotent text, secure-value redaction, bounded commands, and unchanged browser/Android regressions.
- missing or misleading coverage: no test or retained receipt exercises a genuine `failed` terminal controller outcome followed by verified app/recorder/companion cleanup. The retained runs are passed or blocked.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 3814 in / 73 out. Second pass retained the findings and returned correctness covered level 3 confidence 0.99, readability covered level 2 confidence 0.61, architecture covered level 3 confidence 0.89, security unclear level 3 confidence 0.29, and performance unclear level 3 confidence 0.49.
- helper stderr provenance: first pass `judge: model jev-1.13.0, tokens 3693 in / 73 out`; second pass `judge: model jev-1.13.0, tokens 3814 in / 73 out`.

### Correctness

- assessment and evidence: Successful generic, exact-Name, Casey-to-Jordan, and standalone receipts under `evidence/verification-8a45b9b/` contain independent observations, stable PIDs, `idb`, bundle identity, and verified media. The blocked zero-action and unavailable-companion runs are retained. However, the task requires truthful failed/blocked outcomes and cleanup across success and failure, while the continuation's P10 cites only blocked failures (`04-verification-continuation-jev-ios.md:34`) and no receipt has `status: failed`. In code, `nativeStarted` is set only after `await launchFixture(...)` (`skills/delivery/jev-ui/scripts/acceptance.mjs:19`); a launch script can install or launch the app and then reject, leaving `nativeStarted` false and skipping `stopFixture` in `finally`.
- helper coverage: covered, level 3, confidence 0.99.

### Readability and Simplicity

- assessment and evidence: Control flow is compact but the `runAcceptance` try/finally state uses a boolean whose assignment occurs after a side-effecting launch operation. The ownership state should be recorded before the operation or represented by an explicit launch/cleanup state.
- helper coverage: covered, level 2, confidence 0.61.

### Architecture

- assessment and evidence: Native fixture lifecycle belongs to `runAcceptance`, and cleanup is centralized in its `finally`; the gap is that launch ownership is not registered at the lifecycle boundary. The `stopNativeFixture` helper already verifies app state, so the smallest fix is to make cleanup eligible whenever native setup begins, including launch rejection.
- helper coverage: covered, level 3, confidence 0.89.

### Security

- assessment and evidence: Native target authorization, app/PID scoping, safe text dispatch, secret redaction, and external command boundaries were inspected. No critical or major security defect was found in the changed scope.
- helper coverage: unclear, level 3, confidence 0.29. Direct review found no security defect; the second helper pass remained unclear.

### Performance

- assessment and evidence: Native commands use bounded execution, recorder processes are finalized, and no unbounded loop or query was introduced. No critical or major performance defect was found.
- helper coverage: unclear, level 3, confidence 0.49. Direct review found no performance defect; the second helper pass remained unclear.

## Verification Story

- command or inspection: `git diff --name-status 4458fbf...HEAD`; full changed-source and test reads; `02-verification-jev-ios.md`; `04-verification-continuation-jev-ios.md`; all current-revision iOS receipt/report/manifest files; `git status --short --branch`.
- result: the pinned product diff is non-empty and fully reviewed against `origin/main` at `4458fbf`; current receipts prove success and blocked paths, and all current-revision successful receipts identify one simulator, bundle, `idb`, and stable PID. The older replacement citation in phase 1 is materially stale provenance but is independently superseded by the current-revision receipt.
- manual, screenshot, or before-and-after evidence: current generic, label-equal, replacement, standalone, and zero-action evidence has verified media. No failed-outcome recording exists to establish failure cleanup.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 Failed native setup can leak the launched fixture

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `skills/delivery/jev-ui/scripts/acceptance.mjs:19`
- failure mode: If `launchFixture` performs installation or launches the app but exits nonzero, `await launchFixture(...)` throws before `nativeStarted=true`. The `finally` block then skips `stopFixture`, so a failed acceptance can leave the verifier-owned app running. This violates the task's owned cleanup invariant for failure outcomes.
- evidence or reproduction: `nativeStarted` is assigned only after the side-effecting launch call in the one-line `runAcceptance` implementation. Cleanup is guarded by `if(nativeStarted)`. The retained evidence proves cleanup for the zero-action blocked path, but neither tests nor receipts cover a launch-rejection path.
- fix direction: Register native cleanup ownership before invoking the install/launch operation, or have the launch helper return an ownership state that is applied even on rejection; always attempt verified `stopFixture` after native setup has begun, preserve the original failure and append cleanup diagnostics, and add a deterministic test where launch rejects after starting setup.

### CR-002 Required failed-outcome cleanup remains unproven

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `.agents/tasks/jev-ios/04-verification-continuation-jev-ios.md:34-36`
- failure mode: The acceptance requirement asks for truthful success, failed, and blocked outcomes plus owned cleanup across outcomes, but phase 1 records only passed receipts and blocked receipts (`zero-action` and `generic-companion-unavailable`). A blocked action-budget exhaustion is not evidence that the controller's `failed` terminal path preserves a failure status and cleans up the app, recorder, companion, and simulator.
- evidence or reproduction: `04-verification-continuation-jev-ios.md:34` claims P10 pass while naming only blocked receipts; `evidence/verification-8a45b9b/*/jev-receipt.json` contains passed or blocked statuses and no `status: failed`. The task's acceptance item 3 requires cleanup across success and failure. Add a retained run that deterministically triggers a non-driver controller failure and records its non-green status and cleanup checks.
- fix direction: Exercise a genuine failed path without hiding or relabeling it, retain its receipt/report and process/app/simulator cleanup observations, and update P10/P11 only from that evidence. If the intended contract is blocked-only for driver/setup errors, document and test the separate controller-failure path explicitly rather than treating blocked evidence as equivalent.

## Advisories

### ADV-001 Continuation P8 cites older replacement evidence

- type: Potential issue
- severity: minor
- category: Data integrity and integration
- location: `.agents/tasks/jev-ios/04-verification-continuation-jev-ios.md:32`
- evidence: P8 points to `evidence/verification-20260920/replacement/` and PID `92794`, while the exact implementation revision's retained receipt is `evidence/verification-8a45b9b/replacement/` with PID `25839`. Both are preserved and the current receipt is valid, so this does not block code review.
- suggestion: Point the acceptance matrix at the current-revision receipt and retain the older run only as explicitly superseded historical evidence.

## Dead Code and Dependency Review

- newly orphaned code: None found. The iOS adapter, fixture, acceptance entry points, tests, and changeset are referenced by the skill and test suite.
- dependency findings: No dependency or lockfile changes.

## Verdict

- decision: request_changes
- overall code-health change: The iOS implementation adds identity and redaction checks, but native lifecycle ownership does not cover launch rejection and the required failed-outcome proof is missing.
- rationale: CR-001 is an executable cleanup leak; CR-002 leaves a stated acceptance criterion unproven. `stop_review_loop: false` because required objective evidence and implementation behavior remain unproven.

## Review Limits

- blocked or unavailable checks: No native rerun was performed because verification is complete and the user prohibited rerunning native proof solely for documentation review. Typed axis judgment was unavailable; each axis was assessed directly from the pinned diff and receipts.
- residual manual verification: A follow-up must add the deterministic failed-path cleanup proof and rerun only checks affected by the cleanup change. Browser/Android live acceptance was not repeated; aggregate tests and four runtime builds are recorded as passing in the verification artifact.
