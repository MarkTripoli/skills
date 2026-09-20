---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 55-code-review-safety-dance.md
reviewed_head_sha: 42bc5357d0ff0326dd30511b824aed075d35939b
fixed_head_sha: 0bcdb25
status: complete
summary: "CR-150 through CR-154 are fixed: daemon lock paths are no longer unlinked during close, quoted Windows hook paths are parsed as single ancestry fields, existing-gate rollback restores configuration, stamp, hook bytes, modes, and absence, status merges terminal branches with active branches, and notification receipts are claimed before callbacks. Focused race tests, the full Go race suite, vet, build, identity checks, release checks, and the root npm aggregate passed; hosted Windows, release, and live-provider evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review examined `42bc535`; this repair commit advances the branch to `0bcdb25`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Pre-existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` directories were not staged or changed.

## Finding Dispositions

### CR-150

- disposition: fixed
- evidence: `Ownership.Close` keeps the lock pathname in place, unlocks and closes the owned descriptor, clears the descriptor, and is idempotent. A replacement daemon can therefore acquire the same inode without an earlier owner unlinking the replacement's pathname.
- files changed: `tools/safety-dance/internal/daemon/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`

### CR-151

- disposition: fixed
- evidence: `commandLineFields` parses single- and double-quoted command-line fields before path normalization, so a Windows hook path containing spaces remains one executable field. A focused quoted-path test covers managed-hook matching; the prior Windows cross-compilation remains part of the product checks.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/admission_test.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`

### CR-152

- disposition: fixed
- evidence: Existing-gate snapshots now journal `config`, `config.worktree`, the gate stamp, every pre-existing hook, file modes, and absence. Restore removes newly created hook files, restores saved bytes and modes, and removes files that were absent before repair. A focused test covers metadata restoration and created-hook removal.
- files changed: `tools/safety-dance/internal/gate/gate.go`, `tools/safety-dance/internal/gate/gate_test.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/gate`

### CR-153

- disposition: fixed
- evidence: `statusCommand` always loads active runs, keys them by repository and branch, then fills unseen branches with their newest history row. Active rows take precedence for the same key; a terminal branch remains visible beside another branch's active run. A focused CLI test covers the mixed state.
- files changed: `tools/safety-dance/internal/cli/status.go`, `tools/safety-dance/internal/cli/status_test.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli`

### CR-154

- disposition: fixed
- evidence: Notification receipt delivery now claims a token under the admission mutex before invoking the run-start callback. Concurrent delivery returns an in-progress error; callback failure releases the claim so retry remains possible; successful delivery removes the receipt and claim. A two-client IPC test requires exactly one callback.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/admission_test.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: The Go module graph remains unchanged. `go mod tidy` is deferred until imported provider and typed-owner integrations settle; it is not a critical or major finding.

## Verification

- command: `cd tools/safety-dance && go test -race ./... && go vet ./... && go build ./cmd/safety-dance`
- result: Passed; the generated source-tree binary was removed after the build.
- command: `npm test`
- result: Passed validation, plugin synchronization, 136 Node tests, the Safety Dance identity scan, full Go race suite, vet, temporary build, and two release-contract tests.
- command: `git diff --check`
- result: Passed for the repair commit.

## Remaining Blocks

- Hosted Windows hook execution, hosted `safety-dance-v*` release execution, and authorized live-provider behavior remain unavailable in this environment.
