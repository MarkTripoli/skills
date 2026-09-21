---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/130-code-review-safety-dance.md
reviewed_head_sha: 925205016931a21175d779ea5ef4b6a6b7fa6de4
fixed_head_sha: edd68a1
status: complete
summary: "The four major review findings are repaired in edd68a1: mutation requests carry a daemon-issued operator capability, managed hooks carry a per-gate capability, daemon startup no longer depends on a Unix session, and GitHub PR calls normalize refs/heads/* at the provider boundary. Go race tests, the full Go suite, go vet, the public binary end-to-end test, and npm test passed; native Windows execution, hosted release execution, and live provider credentials remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains ahead of `safety-dance`; the repair applies to reviewed product HEAD `9252050` and ends at `edd68a1`. No merge or rebase was performed.
- unrelated changes preserved: task-owned `.atomic-delivery/`, `evidence/`, and `progress.md` remain untracked and untouched.

## Finding Dispositions

### CR-412

- disposition: fixed
- evidence: IPC requests now carry a daemon-generated operator capability stored beside the endpoint with mode `0600`; the server rejects every non-health request without the matching capability before dispatch. The daemon no longer treats inherited process-session membership as authority, and mutation ancestry still rejects validation markers and incomplete ancestry.
- files changed: `tools/safety-dance/internal/ipc/protocol.go`, `tools/safety-dance/internal/ipc/client.go`, `tools/safety-dance/internal/ipc/server.go`, `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/admission.go`
- regression check: `go test -race ./internal/daemon ./internal/pipeline/steps ./internal/scm/github`; `go test ./...`; `go test ./internal/e2e/...` through `make e2e`; `npm test`

### CR-413

- disposition: fixed
- evidence: Gate provisioning creates a random per-gate hook capability with mode `0600`. Generated pre-receive and post-receive hooks read it after resolving the gate path and pass it to token issuance, admission, notification, and receipt revocation; persisted daemon admission validates the capability instead of trusting hook-path argv. Pre-capability gates retain the existing authenticated ancestry check until the next hook repair creates the capability.
- files changed: `tools/safety-dance/internal/git/hook.go`, `tools/safety-dance/internal/gate/gate.go`, `tools/safety-dance/internal/ipc/protocol.go`, `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/git/testdata/hook-helper/main.go`
- regression check: `go test -race ./internal/daemon ./internal/pipeline/steps`; `go test ./...`; executable hook admission in `go test ./internal/daemon`; `npm test`

### CR-414

- disposition: fixed
- evidence: Windows no longer fails startup because `serveDaemon` no longer requires a Unix process session. Unix service-managed daemons also accept clients from another terminal session when the authenticated operator capability is present; the operator capability is propagated automatically by IPC clients.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/ipc/client.go`, `tools/safety-dance/internal/ipc/server.go`
- regression check: `go test ./...`; `go vet ./...`; public binary smoke and local end-to-end checks passed through `npm test`.

### CR-415

- disposition: fixed
- evidence: GitHub `FindPR` and `CreatePR` now require `refs/heads/<branch>`, strip the prefix before passing `--head`, preserve fork-owner qualification at the provider boundary, and reject tags, remote refs, unqualified names, and empty branch names. Internal run coordination retains the canonical full ref.
- files changed: `tools/safety-dance/internal/scm/github/github.go`, `tools/safety-dance/internal/scm/github/branch_ref_test.go`
- regression check: `go test ./internal/scm/github`; `go test ./...`; `go vet ./...`

## Advisory Decisions

None.

## Verification

- command: `go test -race ./internal/daemon ./internal/pipeline/steps ./internal/scm/github`
- result: passed.
- command: `go test ./...`
- result: passed.
- command: `go vet ./...`
- result: passed with no diagnostics.
- command: `npm test`
- result: passed; 137 Node tests, identity validation, plugin synchronization, Go race suite, vet, binary build, local end-to-end, and release-contract tests passed.
- command: `git diff --check`
- result: passed before the code commit.

## Remaining Blocks

- Native Windows startup and mutation execution remain unavailable in this macOS checkout.
- Hosted `safety-dance-v*` release execution and authorized live-provider behavior remain untested.
- Pre-capability gates use the existing authenticated ancestry fallback until repaired; newly provisioned or repaired gates use the per-gate capability.
