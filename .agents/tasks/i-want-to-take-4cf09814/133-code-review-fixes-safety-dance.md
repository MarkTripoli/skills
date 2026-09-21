---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/132-code-review-safety-dance.md
reviewed_head_sha: 5407863f44608c7ec41a5004759b77bad5cdda87
fixed_head_sha: f786ccc
status: complete
summary: "CR-416 and CR-417 are fixed in f786ccc: the unused same-user operator bearer file and automatic client loading were removed, managed-hook authorization now always requires both the per-gate capability and OS-observed hook ancestry, and post-receive forwards its capability on every path. The focused Go tests, full Go suite, vet, and npm test passed; native Windows, hosted release, and live-provider evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains the review base; the reviewed product head was `5407863`, and the repair ends at `f786ccc`. No merge or rebase was performed.
- unrelated changes preserved: task-owned `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/`, `evidence/`, and `progress.md` remain untracked and untouched.

## Finding Dispositions

### CR-416

- disposition: fixed
- evidence: The daemon no longer creates an operator-capability bearer file. IPC clients no longer read or attach that file, and the server no longer treats a same-user file value as authorization. Mutating RPC handlers continue to require `AuthorizeMutationPeer`, which rejects validation markers, incomplete ancestry, non-Safety-Dance peers, and ancestry without a verified interactive shell. The regression test preserves the marked-ancestor rejection.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/ipc/client.go`, `tools/safety-dance/internal/ipc/server.go`, `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test ./... && go vet ./...`; `npm test`

### CR-417

- disposition: fixed
- evidence: `hookAuthorized` now requires managed-hook ancestry before accepting a capability and requires the per-gate capability for persisted daemon admissions. The empty-capability fallback was removed. The post-receive hook now passes `--hook-capability` on its normal path, matching the fallback paths. `TestHookCapabilityNeverBypassesManagedAncestry` proves a copied capability cannot authorize a non-hook peer.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/admission_test.go`, `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git ./internal/ipc`; `npm test`

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git ./internal/ipc`
- result: passed.
- command: `cd tools/safety-dance && go test ./... && go vet ./...`
- result: passed with no diagnostics.
- command: `npm test`
- result: passed; validation, plugin synchronization, 137 Node tests, Go race tests, vet, build, local end-to-end tests, identity checks, and release-contract tests passed.
- command: `git diff --check`
- result: passed before the code commit.

## Remaining Blocks

- Native Windows startup and mutation execution remain unavailable in this macOS checkout.
- Hosted `safety-dance-v*` release execution and authorized live-provider behavior remain untested.
