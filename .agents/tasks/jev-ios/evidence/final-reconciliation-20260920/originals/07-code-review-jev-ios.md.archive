---
type: code-review
date: 2026-09-20
branch: feat/jev-ios
base_branch: main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 46bc595
status: clean
summary: "The repaired iOS lifecycle registers cleanup ownership before authorized setup and retains a genuine failed receipt; targeted regressions and the aggregate suite pass, so the pinned product scope has no critical or major findings. The prior repair note has stale build/companion wording, which is recorded as an advisory rather than treated as proof."
---

# Code Review

## Scope

- merge base: `main` at `4458fbf21e199dad45376b8164f78c2165ac1d20` (`origin/main`)
- reviewed HEAD: `46bc595`
- commits: `0bcffbb`, `3a5f221`, `11d748b`, `b1054d5`, `8a45b9b`, `2384ca5`, `a44dce1`, `cb7b53a`, `46bc595`
- staged and unstaged changes: none; `git status --short --branch` reports a clean `feat/jev-ios` worktree
- task-owned untracked files: none; retained task evidence is committed in the reviewed branch
- excluded changes: task artifacts and evidence are not product diff subjects, but named receipts and verification commands were checked as review inputs

## Previous Round

- previous artifact: [05-code-review-jev-ios.md](.agents/tasks/jev-ios/05-code-review-jev-ios.md)
- CR-001 Failed native setup can leak the launched fixture: fixed
- CR-002 Required failed-outcome cleanup remains unproven: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/jev-ios/task.md`, especially acceptance items 3, 5, and 6
- implementation source: `.agents/tasks/jev-ios/01-implementation-jev-ios.md` and `.agents/tasks/jev-ios/03-implementation-jev-ios.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `skills/delivery/review-code/SKILL.md`

## Change Profile

- intent and expected behavior: register native cleanup ownership before setup can reject, preserve terminal failure status, and prove the failed path with real iOS/JEV evidence.
- change description quality: `06-repair-verification-jev-ios.md` names the repair, receipts, regressions, and limits. Its statement that builds still need rerunning and that the companion remains running conflicts with the durable P14 build receipt in `04-verification-continuation-jev-ios.md:38` and the debugger terminal report; that stale wording is not used as approval evidence.
- implementation model and review model: implementation, tests, and diagnostics are recorded as `openai-codex/gpt-5.6-luna-fast`; this re-review independently inspected the full diff, repair code, tests, raw failed/generic2 receipts, and process state.
- changed-line size and logical cohesion: the repair is 3 product/test lines on top of the previously reviewed cohesive iOS change; no new oversized file or unrelated behavior was introduced.
- resulting large-file concerns: none found.
- dependency or lockfile changes: none.

## Tests Reviewed First

- behavior claimed by tests: native fixture ownership is set before launch, launch rejection still invokes cleanup, a failed controller result remains `failed`, cleanup failures cannot turn a non-green result green, and all existing browser/Android/iOS regressions remain passing.
- missing or misleading coverage: the unit launch-rejection test uses the authorized iOS target and counts both pre-launch and final cleanup calls; the production authorization guard is unchanged and reviewed below. Raw failed evidence proves a real failed receipt and finalized recording; cleanup of the app and simulator is corroborated by the repair report/process state and cleanup tests rather than by fields in the receipt itself.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 3284 in / 73 out; stderr provenance: `judge: model jev-1.13.0, tokens 3284 in / 73 out`.

### Correctness

- assessment and evidence: `acceptance.mjs` now sets `nativeStarted=true` only after native authorization but before `stopFixture` and `launchFixture`, so launch rejection enters the existing `finally` cleanup. `tests/jev-ui-controller.test.mjs` proves the rejected launch returns blocked and calls cleanup twice, while the failed-controller test proves `failed` survives cleanup. The raw `repair-cb7b53a/failed/jev-receipt.json` has `status: failed`, the impossible expected postcondition, one failed assertion, stable authorized target, bundle, `idb`, and PID; `report.md`, `manifest.json`, and `recorder-exit.json` show verified finalized media. The raw `generic2` receipt remains an independent passed regression. No critical or major correctness defect remains.
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: The one-state ownership change is local to the lifecycle boundary and removes the prior side-effect-before-ownership gap. The tests name both failure modes directly. No new branching or abstraction obscures cleanup ownership.
- helper coverage: covered, level 3, confidence 0.80

### Architecture

- assessment and evidence: `runAcceptance` owns fixture, recorder, and fixture-server lifecycle, and its `finally` remains the single cleanup boundary. Authorization precedes ownership registration, preserving the invariant that unrelated native targets cannot be terminated. The repair extends that owner rather than duplicating cleanup in launch helpers.
- helper coverage: covered, level 3, confidence 0.98

### Security

- assessment and evidence: The repair does not widen target authorization or alter command construction. The guard still rejects any native target other than the configured authorized simulator before `nativeStarted` can be set; the native identity, app bundle, PID, and `idb` checks remain in the reviewed path. No security or privacy defect was introduced.
- helper coverage: covered, level 3, confidence 0.90

### Performance

- assessment and evidence: The repair adds no process, model, retry, or observation work. It makes the existing verified stop call eligible on launch rejection and leaves bounded native commands unchanged. No scalability or availability defect remains in the changed lines.
- helper coverage: covered, level 3, confidence 0.91

## Verification Story

- command or inspection: `npm test`; `node scripts/check-commits.mjs origin/main..HEAD`; targeted `node --test --test-name-pattern='native launch rejection|failed controller outcome' tests/jev-ui-controller.test.mjs`; full diff and caller/test inspection; raw `repair-cb7b53a/failed` and `generic2` receipts; current simulator/process inspection.
- result: `npm test` passed 147/147 with zero failures, skips, or todos. Commit validation passed 10 subjects. The targeted repair tests passed; raw failed receipt has terminal `failed` and verified failed media, raw generic2 receipt has terminal `passed`, and the authorized simulator is currently shutdown. The four runtime builds are accepted from the durable P14 command/output in `04-verification-continuation-jev-ios.md:38`; no unnecessary rerun was performed.
- manual, screenshot, or before-and-after evidence: failed `report.md` records one failed assertion and verified video; `manifest.json` records `verified: true`, one failed assertion, and finalized `simctl recordVideo`; the failed receipt's observations retain the authorized simulator, bundle, driver, and stable PID. The failed-path cleanup test and repair report establish cleanup invocation; current `simctl` state reports the authorized simulator as Shutdown.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Repair note contains stale verification-state wording

- type: Potential issue
- severity: minor
- category: Data integrity and integration
- location: `.agents/tasks/jev-ios/06-repair-verification-jev-ios.md:32-34`
- evidence: The note says builds must be rerun and the owned companion remains running, while `04-verification-continuation-jev-ios.md:38` records all four builds exiting 0 and the available debugger/process evidence reports the companion and simulator stopped. The current simulator inspection also reports `Shutdown`; the remaining `record-evidence` process visible on this host belongs to a different preserved worktree and cannot substantiate the iOS companion claim.
- suggestion: Correct the repair note in a separate artifact synchronization step to distinguish already-passed build evidence from checks still pending, and state only cleanup process facts backed by an identifiable command receipt.

## Dead Code and Dependency Review

- newly orphaned code: None found. The ownership flag is consumed by the existing `finally` cleanup, and both new regression tests exercise it.
- dependency findings: No dependency or lockfile changes.

## Verdict

- decision: approve
- overall code-health change: The repair closes the launch-rejection cleanup leak and adds deterministic regression coverage while preserving authorization and terminal failure semantics.
- rationale: CR-001 is fixed by registering ownership before side effects and is covered by a failing-before/fixed-after regression. CR-002 is fixed by the retained real failed receipt plus verified recording and cleanup-path tests. No critical or major finding remains in the pinned product diff; the stale note is non-blocking and explicitly separated from proof.

## Review Limits

- blocked or unavailable checks: `qlty` is unavailable at both `command -v qlty` and `$HOME/.qlty/bin/qlty`, so no qlty check ran.
- residual manual verification: The raw failed receipt does not encode a post-run app-state or companion-state field. Cleanup is therefore established by the targeted lifecycle regression, the retained finalized recorder evidence, the repair report/debugger terminal report, and current simulator shutdown state. The visible unrelated `record-evidence` process could not be attributed to this run and was not touched.
