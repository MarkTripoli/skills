---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 105-code-review-safety-dance.md
reviewed_head_sha: 1cbde470fe0343eaf92aaf75de551581e8657a73
fixed_head_sha: fa39cec
status: complete
summary: "CR-347 is fixed: the tagged built-binary e2e target now runs deterministic local agent and SCM fixtures, waits for a completed run, and asserts the publication binding plus upstream and gate refs equal the candidate. CR-348 is fixed by deleting both unreferenced structured-output fixtures. Root npm tests, Safety Dance package checks, and the built-binary e2e target pass; hosted release and live-provider evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review head `1cbde470`; this phase added commit `fa39cec`.
- unrelated changes preserved: Existing task-owned `.atomic-delivery/` and `evidence/` directories were not staged or modified.

## Finding Dispositions

### CR-347 The built-binary gate no longer proves completion or publication

- disposition: fixed
- evidence: The e2e build uses the `safety_dance_e2e` tag with deterministic local agent and SCM fixtures. `TestPublicBinarySmoke` waits for `status=completed`, then asserts a publication binding whose candidate matches the pushed candidate and verifies both the upstream and gate refs equal that SHA. `make e2e` runs this built-binary test, and `npm test` passes the Safety Dance aggregate.
- files changed: `tools/safety-dance/internal/e2e/public_binary_test.go`, `tools/safety-dance/Makefile`, `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/cli/complete_run_default.go`, `tools/safety-dance/internal/cli/complete_run_e2e.go`, `tools/safety-dance/internal/cli/run_cleanup_default.go`, `tools/safety-dance/internal/cli/run_cleanup_e2e.go`, `tools/safety-dance/internal/cli/test_scm_default.go`, `tools/safety-dance/internal/cli/test_scm_e2e.go`
- regression check: `make e2e` passed; `go test ./internal/cli ./internal/e2e` passed; `npm test` passed with 137 Node tests and the Safety Dance aggregate.

### CR-348 Imported structured-output fixtures are orphaned

- disposition: fixed
- evidence: Both unreferenced fixtures were removed. A repository search finds no remaining references or files.
- files changed: deleted `tools/safety-dance/internal/agent/testdata/structured_output_split_objects.txt`; deleted `tools/safety-dance/internal/agent/testdata/structured_output_trailing_residue.txt`
- regression check: `npm test` passed the identity scan and Go package suite after deletion.

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && make e2e`
- result: Passed; the tagged built binary admitted a push, completed the durable run, and verified publication and ref assertions.
- command: `cd tools/safety-dance && go test ./internal/cli ./internal/e2e`
- result: Passed.
- command: `npm test`
- result: Passed with 137 Node tests, identity validation, plugin synchronization, Go race tests, vet, build, and release-contract tests.
- command: `git diff --check`
- result: Passed.

## Remaining Blocks

- Hosted `safety-dance-v*` release execution and authorized live-provider behavior remain unavailable as previously recorded deferred evidence.
