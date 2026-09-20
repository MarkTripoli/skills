---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 66568e24e43f93ffb984520a690019bbd0cd023d
status: findings
summary: "The complete Safety Dance change was reviewed through 66568e2 against origin/main. Startup now promotes matching pre-acceptance receipts, but the required built-binary init-to-publication test still fails with no durable run and can be skipped when admission ancestry is unavailable. The next phase must make this supported flow pass without a skip before review repeats."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `66568e24e43f93ffb984520a690019bbd0cd023d`
- commits: 177 commits in `origin/main..HEAD`; the latest product change is `f1bc838 fix(safety-dance): require durable binary publication proof`.
- staged and unstaged changes: None.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: Task artifacts and the two task-owned untracked evidence directories were excluded from product review.

## Previous Round

- previous artifact: `99-code-review-safety-dance.md`
- CR-343 The binary regression passes without a durable publication: still open
- CR-344 Startup import does not promote an existing admitted receipt: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently branded Safety Dance behavior based on the named source repository, with no product references to that source.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; Phase 4 requires a built binary to complete initialization, authenticated push admission, durable run creation, and publication, and Phase 6 requires local end-to-end proof.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `skills/review-code/SKILL.md`.

## Change Profile

- intent and expected behavior: Add the complete local Git gate, durable daemon, fixed validation pipeline, guarded publication, CLI/TUI/service surfaces, portable skill distribution, identity checks, and native release contract under the Safety Dance identity.
- change description quality: No pull request exists. `npm run check-commits -- origin/main..HEAD` accepted all 177 commit subjects; the latest fix subject identifies its durable publication intent.
- implementation model and review model: Implementation model was not recorded; review model is GPT-5.6 Sol.
- changed-line size and logical cohesion: 40,234 product lines across 232 product files. The six planned phases are cohesive, but the size requires the recorded package, aggregate, and built-binary gates rather than inspection alone.
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/db/run.go`, and `internal/cli/daemon.go` exceed 1,000 lines. No new blocking defect was attributed only to file size.
- dependency or lockfile changes: The new Go module and `go.sum` are part of the planned tool. `npm run test:safety-dance` completed its race, vet, build, identity, and release-contract checks without a dependency diagnostic.

## Tests Reviewed First

- behavior claimed by tests: `TestImportGateReceiptsPromotesPersistedPreAcceptanceReceipt` covers promotion with metadata preservation, and `TestImportGateReceiptsRejectsPersistedReceiptConflict` covers fail-closed conflicts. `TestPublicBinarySmoke` claims a built-binary journey through initialization, daemon restart, authenticated push, completed durable run, publication binding, and matching gate/upstream refs.
- missing or misleading coverage: The aggregate runs the public-binary test without `SD_E2E_BINARY`, so it skips at `tools/safety-dance/internal/e2e/public_binary_test.go:22-25`. `make e2e` supplies the binary but fails because status remains `runs: none`; the test also retains an ancestry-unavailable skip at lines 88-91.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3398` in / `73` out

### Correctness

- assessment and evidence: Receipt promotion now validates gate, full ref, old revision, and new revision before setting `Accepted`, and `ImportGateReceipts` persists the resulting map (`tools/safety-dance/internal/daemon/admission.go:93-108`). The required shipped-binary path is not correct in the supported local environment: `make e2e` times out at `tools/safety-dance/internal/e2e/public_binary_test.go:94-110` with `runs: none`.
- helper coverage: covered, level 3, confidence 0.93

### Readability and Simplicity

- assessment and evidence: The latest receipt change stays in the admission owner, and the binary test states the durable database and ref invariants directly (`tools/safety-dance/internal/e2e/public_binary_test.go:112-135`). The remaining failure is observable at one end-to-end boundary rather than hidden behind helper-only assertions.
- helper coverage: covered, level 2, confidence 0.79

### Architecture

- assessment and evidence: Gate receipt import, daemon reconciliation, durable run construction, and guarded publication remain separated into their owning packages. The public boundary still lacks a passing composition test even though its package-level components pass, so component architecture has not been proven as an operating system (`tools/safety-dance/Makefile:15-16`).
- helper coverage: covered, level 2, confidence 0.62

### Security

- assessment and evidence: Admission token issuance and notification remain bound to managed-hook process ancestry, and the latest import rejects a token whose persisted gate or ref update conflicts with the gate journal (`tools/safety-dance/internal/daemon/admission.go:93-95,378-424,459-505`). The binary test's ancestry skip means the shipped trust boundary can remain unproved while the aggregate is green (`tools/safety-dance/internal/e2e/public_binary_test.go:88-91`).
- helper coverage: covered, level 2, confidence 0.61

### Performance

- assessment and evidence: The latest production change adds only constant-time validation per imported receipt plus the existing single receipt-file rewrite after the scan (`tools/safety-dance/internal/daemon/admission.go:73-108`). No critical or major performance regression was found in the reviewed fix or the pinned behavior.
- helper coverage: covered, level 3, confidence 0.58

## Verification Story

- command or inspection: `go test ./internal/daemon -run 'TestImportGateReceipts|TestAdmission' -count=1`; `npm run test:safety-dance`; `make e2e`; `SD_E2E_BINARY='' go test -v ./internal/e2e -run TestPublicBinarySmoke -count=1`; `npm run check-commits -- origin/main..HEAD`; changed-code and caller inspection.
- result: Focused admission tests passed. The Safety Dance aggregate passed, but its public-binary test skipped because the binary variable was unset. `make e2e` failed after about 20 seconds with `timed out waiting for a completed durable run; last status: ... runs: none`. All 177 commit subjects passed.
- manual, screenshot, or before-and-after evidence: No new UI evidence was required for the latest receipt and end-to-end changes. Hosted release, authorized provider, Windows service, and induced crash evidence remain unavailable.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-345 The shipped-binary gate flow still creates no durable run

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/e2e/public_binary_test.go:84-110`
- failure mode: The plan's required built-binary path cannot demonstrate that an authenticated push creates and completes a durable run. The dedicated target fails with `runs: none`, while the aggregate remains green because it does not provide `SD_E2E_BINARY`; another branch can skip when hook ancestry is unavailable.
- evidence or reproduction: `make e2e` built the current binary, pushed a distinct post-initialization candidate, and failed at line 110 after the status loop observed no run. `npm run test:safety-dance` passed because `go test -race ./...` reached the skip at lines 22-25, and an explicit verbose run reported `SD_E2E_BINARY is not set`. Lines 88-91 retain a second skip for failure at the admission trust boundary.
- fix direction: Trace and repair the generated-hook notification and daemon receipt-reconciliation path so this supported local flow creates the expected run and publication. Make the required aggregate invoke the built-binary target, remove the ancestry-unavailable success path for supported platforms, and retain the database plus ref assertions as the non-vacuous regression.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: None identified from the latest fix or the complete changed-file inventory.
- dependency findings: No new dependency change was introduced after the previous review; current module, identity, and release checks passed.

## Verdict

- decision: request_changes
- overall code-health change: The receipt-import fix closes the previous recovery defect, and the binary regression now fails instead of accepting an unchanged-head false positive. The product still lacks a passing shipped-binary acceptance path.
- rationale: CR-345 is a major requirement and regression-proof gap. A package aggregate that skips the public boundary cannot substitute for the failing required end-to-end target.

## Review Limits

- blocked or unavailable checks: Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence were not available. Axis coverage was judged by `jev-1.13.0` with 3,398 input and 73 output tokens.
- residual manual verification: After CR-345 is fixed, repeat `make e2e` on each supported local platform and retain hosted release/provider/platform evidence as deferred proof where credentials or hosted runners are required.
