---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 101-code-review-safety-dance.md
reviewed_head_sha: 66568e24e43f93ffb984520a690019bbd0cd023d
fixed_head_sha: 6ed3ac1
status: blocked
summary: "CR-345 remains blocked because the mandatory built-binary smoke test still ends with no durable run. This phase fixes two defects exposed while tracing that path: macOS symlink aliases no longer defeat managed-hook ancestry checks, and wizard-generated provider and gate configuration is accepted; focused tests pass, but make e2e still fails at the required publication assertion."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review head `66568e2`; this phase added commit `6ed3ac1` with path canonicalization and repository-config allowlist changes.
- unrelated changes preserved: Existing task-owned untracked `.atomic-delivery/` and `evidence/` directories were not staged or modified.

## Finding Dispositions

### CR-345

- disposition: blocked
- evidence: Tracing the built-binary flow found that the macOS `/var` and `/private/var` aliases could make `managedHookPeer` reject a real managed hook. `cleanPath` now resolves existing symlinks before comparing hook ancestry paths (`tools/safety-dance/internal/daemon/admission.go:333-346`). The same trace found that the wizard writes top-level `provider` and `gate` fields that strict repository parsing rejected; both fields are now allowlisted (`tools/safety-dance/internal/config/config.go:2355-2365`).
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/config/config.go`
- regression check: `go test ./internal/config ./internal/daemon -run 'TestManagedHookPeer|TestCommandHasExecutable|TestImportGateReceipts|TestAdmission|Test.*Config|Test.*Repo' -count=1` passed; `git diff --check` passed. `make e2e` still fails at `tools/safety-dance/internal/e2e/public_binary_test.go:110` after the status poll reports `runs: none`, so the required built-binary publication path is not proven.

## Advisory Decisions

None.

## Verification

- command: `gofmt -w internal/config/config.go internal/e2e/public_binary_test.go internal/daemon/admission.go internal/cli/daemon.go`
- result: Passed.
- command: `go test ./internal/config ./internal/daemon -run 'TestManagedHookPeer|TestCommandHasExecutable|TestImportGateReceipts|TestAdmission|Test.*Config|Test.*Repo' -count=1`
- result: Passed.
- command: `git diff --check`
- result: Passed.
- command: `make e2e`
- result: Failed at the mandatory `TestPublicBinarySmoke` check after 20 seconds; the last status was `runs: none`.

## Remaining Blocks

- CR-345 requires a supported built-binary run to create, complete, and publish a durable run with database and ref assertions; `make e2e` remains failing.
- Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence remain unavailable.
