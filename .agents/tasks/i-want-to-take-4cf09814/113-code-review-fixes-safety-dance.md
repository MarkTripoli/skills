---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/112-code-review-safety-dance.md
reviewed_head_sha: 6b40fe26850cd0e6fc836ce6e12cffbc8b780a08
fixed_head_sha: 7709870
status: complete
summary: "CR-358 through CR-367 were addressed: validation adapters now preserve the parent marker and use a reduced environment, GitHub aliases resolve to their canonical host, recovery resets and cleans owned worktrees, publication mirrors use submitted-head custody, Windows services reject foreign tasks before mutation, release tags run repository preflight and vulnerability scanning, evidence storage and publication are wired, and the unused runner was removed. Local Go, end-to-end, vulnerability, and root aggregate checks passed; hosted provider, Windows, and release execution remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` moved from review base `4458fbf21e199dad45376b8164f78c2165ac1d20` to `1837afdde1ce8d17e892c379d39ef5e585e9dfc3`; product fixes are committed at `d36a6e3` and `7709870`.
- unrelated changes preserved: task-owned `.atomic-delivery/`, `evidence/`, and `progress.md` remain unmodified and untracked.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-358

- disposition: fixed
- evidence: Antigravity now forwards `opts.Env`; all validation agents and configured commands use the reduced subprocess environment. Mutation authorization still requires an authenticated IPC peer and rejects a detected parent-run marker.
- files changed: `tools/safety-dance/internal/agent/antigravity.go`, `tools/safety-dance/internal/agent/env.go`, `tools/safety-dance/internal/pipeline/steps/validation.go`, `tools/safety-dance/internal/cli/daemon.go`.
- regression check: `go test -race ./...` passed.

### CR-359

- disposition: fixed
- evidence: `newSCMHost` resolves SSH aliases once and passes the resolved host to both the GitHub adapter and repository slug builder while preserving the original Git remote.
- files changed: `tools/safety-dance/internal/cli/daemon.go`.
- regression check: `go test ./internal/cli ./internal/e2e` passed.

### CR-360

- disposition: fixed
- evidence: detached worktree recovery now unconditionally resets to the durable head, removes tracked and ignored residue, then verifies the head and clean status.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`.
- regression check: `go test -race ./...` passed.

### CR-361

- disposition: fixed
- evidence: publication recovery uses immutable submitted-head custody for gate CAS, treats an already-candidate gate as idempotent success, and rejects missing custody.
- files changed: `tools/safety-dance/internal/cli/daemon.go`.
- regression check: `go test ./internal/pipeline/... ./internal/cli` and `make e2e` passed.

### CR-362

- disposition: fixed
- evidence: Windows installation checks a same-name scheduled task before writing local state, and restart requires current task ownership before issuing scheduler mutations.
- files changed: `tools/safety-dance/internal/daemon/service.go`.
- regression check: `go test -race ./...` passed; hosted Windows execution remains unavailable.

### CR-363

- disposition: fixed
- evidence: the release workflow's build and publish jobs now depend on a preflight that runs `npm test`; the preflight also runs `govulncheck` from the Go module directory.
- files changed: `.github/workflows/safety-dance-release.yml`.
- regression check: root `npm test` passed and release-contract tests passed.

### CR-364

- disposition: fixed
- evidence: validation children no longer inherit the daemon's complete environment. The allowlist removes SSH agent and XDG credential surfaces while preserving only execution and locale variables plus the explicit parent-run marker.
- files changed: `tools/safety-dance/internal/agent/env.go`, `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/pipeline/steps/validation.go`.
- regression check: `go test -race ./...` and `make e2e` passed.

### CR-365

- disposition: fixed
- evidence: the module now requires Go 1.26.6, which includes the fixes reported by the review's standard-library scan, and release preflight runs `govulncheck`.
- files changed: `tools/safety-dance/go.mod`, `.github/workflows/safety-dance-release.yml`.
- regression check: `govulncheck ./...` reported no reachable vulnerabilities; Go tests, vet, and build passed.

### CR-366

- disposition: fixed
- evidence: run evidence directories now honor local root, retention, and max-run bounds. Typed evidence is materialized under the run directory; configured orphan-branch publication uses the evidence publisher and commit-pinned PR links; existing media files are uploaded through the provider attachment capability.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/pipeline/steps/validation.go`, `tools/safety-dance/internal/pipeline/steps/pr.go`.
- regression check: `go test ./internal/pipeline/steps ./internal/cli` and `make e2e` passed.

### CR-367

- disposition: fixed
- evidence: the unreferenced `internal/agent/runner.go` abstraction and isolated test were deleted; production execution remains on the adapter path.
- files changed: `tools/safety-dance/internal/agent/runner.go`, `tools/safety-dance/internal/agent/runner_test.go`.
- regression check: `go test -race ./...` passed.

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: cross-branch concurrency remains required by the product contract. A global worker limit and cleanup of inactive branch locks are follow-up capacity work and were not needed to close the reviewed correctness and security findings.

## Verification

- command: `cd tools/safety-dance && go test -race ./...`
- result: Passed.
- command: `cd tools/safety-dance && make e2e`
- result: Passed.
- command: `tmp=$(mktemp -d); GOBIN="$tmp" go install golang.org/x/vuln/cmd/govulncheck@v1.8.0; (cd tools/safety-dance && "$tmp/govulncheck" ./... )`
- result: Passed with no reachable vulnerabilities.
- command: `npm test`
- result: Passed; validation, plugin sync, 137 Node tests, Go race tests, vet, binary end-to-end, and release-contract tests all passed.
- command: `git diff --check`
- result: Passed.

## Remaining Blocks

- Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced crash evidence remain unavailable from this environment.
