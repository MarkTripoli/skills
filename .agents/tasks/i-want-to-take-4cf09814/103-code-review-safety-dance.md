---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 7a94cc23deb9facd5a7f8ef755a94b89f96bf116
status: findings
summary: "The complete Safety Dance change was reviewed through 7a94cc2 against origin/main. The latest path-normalization and wizard-config changes pass focused checks, but the required built-binary init-to-publication flow still creates no durable run, so the next phase must repair and prove that boundary before review repeats."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `7a94cc23deb9facd5a7f8ef755a94b89f96bf116`
- commits: 180 commits in `origin/main..HEAD`; the latest product change is `6ed3ac1 fix(safety-dance): normalize gate paths and wizard config`.
- staged and unstaged changes: None.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: Task artifacts and the two task-owned untracked evidence directories were excluded from product review.

## Previous Round

- previous artifact: `101-code-review-safety-dance.md`
- CR-345 The shipped-binary gate flow still creates no durable run: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently branded Safety Dance behavior based on the named source repository, with no product references to that source.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; Phase 4 requires a built binary to complete initialization, authenticated push admission, durable run creation, and publication, while Phase 6 requires the local end-to-end target in aggregate verification.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `skills/review-code/SKILL.md`.

## Change Profile

- intent and expected behavior: Add the local Git gate, durable daemon, fixed validation pipeline, guarded publication, CLI/TUI/service surfaces, portable skill distribution, identity checks, and native release contract under the Safety Dance identity.
- change description quality: No pull request exists. `npm run check-commits -- origin/main..HEAD` accepted all 180 commit subjects; the latest product commit identifies path normalization and wizard configuration as its scope.
- implementation model and review model: Implementation model was not recorded; review model is GPT-5.6 Sol.
- changed-line size and logical cohesion: 40,234 inserted and 4 deleted product lines across 232 product files. The six planned phases are cohesive, but the size requires the package, aggregate, and built-binary gates recorded by the plan.
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/db/run.go`, and `internal/cli/daemon.go` exceed 1,000 lines. No new blocking defect was attributed only to file size.
- dependency or lockfile changes: The new Go module and `go.sum` are part of the planned tool. The latest fix introduced no dependency or lockfile change.

## Tests Reviewed First

- behavior claimed by tests: Existing admission tests cover executable ancestry, receipt import, and authenticated admission. `TestPublicBinarySmoke` requires a built command to initialize a repository, accept a candidate push, finish one durable run, persist its publication, and reconcile gate and upstream refs.
- missing or misleading coverage: The latest two-line production fixes add no focused symlink-alias or generated wizard-config regression test. More importantly, `go test -race ./...` skips `TestPublicBinarySmoke` when `SD_E2E_BINARY` is absent, while the dedicated `make e2e` target supplies the binary and still fails with `runs: none`.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3338` in / `73` out

### Correctness

- assessment and evidence: Repository configuration now accepts the `provider` and `gate` fields emitted by the wizard (`tools/safety-dance/internal/config/config.go:2355-2373`), and admission path comparison now resolves existing symlink aliases (`tools/safety-dance/internal/daemon/admission.go:333-346`). The required built-binary path remains incorrect: `make e2e` accepts the push but times out at `tools/safety-dance/internal/e2e/public_binary_test.go:94-110` with no durable run.
- helper coverage: covered, level 3, confidence 0.94

### Readability and Simplicity

- assessment and evidence: The latest changes remain at the config parser and admission path-normalization boundaries rather than duplicating wizard or hook logic. The public-binary test states the run, publication, upstream-ref, and gate-ref postconditions directly at `tools/safety-dance/internal/e2e/public_binary_test.go:112-135`.
- helper coverage: covered, level 2, confidence 0.78

### Architecture

- assessment and evidence: Gate receipt import, daemon reconciliation, durable run construction, and guarded publication remain separated into their owning packages. Their shipped composition is still unproved because the dedicated public-binary target fails before durable run construction (`tools/safety-dance/Makefile:15-16`; `tools/safety-dance/internal/e2e/public_binary_test.go:94-110`).
- helper coverage: covered, level 3, confidence 0.53

### Security

- assessment and evidence: The latest path normalization narrows macOS path-alias mismatches while retaining managed-hook ancestry checks, and config decoding still uses `KnownFields(true)` after the explicit allowlist (`tools/safety-dance/internal/config/config.go:2360-2373`). The built-binary test still permits an ancestry-unavailable skip at `tools/safety-dance/internal/e2e/public_binary_test.go:88-91`, so the shipped admission trust boundary can remain unproved in aggregate checks.
- helper coverage: covered, level 3, confidence 0.53

### Performance

- assessment and evidence: The latest production delta adds one `filepath.EvalSymlinks` call during admission path normalization and two constant-time config allowlist entries (`tools/safety-dance/internal/daemon/admission.go:333-346`; `tools/safety-dance/internal/config/config.go:2355-2367`). No critical or major performance regression was found in the latest fix or the pinned behavior.
- helper coverage: covered, level 3, confidence 0.56

## Verification Story

- command or inspection: `make e2e`; `go test ./internal/config ./internal/daemon -run 'TestManagedHookPeer|TestCommandHasExecutable|TestImportGateReceipts|TestAdmission|Test.*Config|Test.*Repo' -count=1`; `npm run check-commits -- origin/main..HEAD`; complete changed-file inventory; latest product diff and caller inspection.
- result: Focused config and daemon tests passed. All 180 commit subjects passed. `make e2e` failed after about 22 seconds because `TestPublicBinarySmoke` observed `runs: none` through its deadline.
- manual, screenshot, or before-and-after evidence: No new interface evidence was required for the two latest backend changes. Hosted release, authorized provider, Windows service, and induced crash evidence remain unavailable.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-346 The shipped-binary gate flow still creates no durable run

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/e2e/public_binary_test.go:84-110`
- failure mode: The plan's required built-binary path accepts a candidate push but never constructs a durable run, so it cannot validate or publish that candidate. The root aggregate can remain green because it does not set `SD_E2E_BINARY`, and the test can also skip when admission ancestry is unavailable.
- evidence or reproduction: At current HEAD, `make e2e` built the command, initialized the isolated gate, pushed the post-initialization candidate, and failed after about 22 seconds with `timed out waiting for a completed durable run; last status: ... runs: none`. The latest fix artifact records the same failure after path normalization and config parsing were repaired.
- fix direction: Trace the accepted post-receive notification through daemon receipt import and run construction, repair the responsible boundary, and make `make e2e` pass with its database and ref assertions. Include the built-binary target in aggregate verification and remove the ancestry-unavailable success path on supported platforms.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: None identified from the latest fix or the complete changed-file inventory.
- dependency findings: The latest fix adds no dependency. Existing module, identity, packaging, and release-contract dependency checks were previously proven and are unaffected by the two changed product files.

## Verdict

- decision: request_changes
- overall code-health change: The latest fixes remove two blockers encountered before notification, but the system still stops before durable run creation in its required shipped-binary path.
- rationale: CR-346 is a major functional and regression-proof gap. Passing package checks cannot replace the failing acceptance target for the product's primary gate-to-publication behavior.

## Review Limits

- blocked or unavailable checks: Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence were not available. Axis coverage was judged by `jev-1.13.0` with 3,338 input and 73 output tokens.
- residual manual verification: After CR-346 is fixed, repeat `make e2e` on each supported local platform and retain hosted release, provider, and platform evidence as deferred proof where credentials or hosted runners are required.
