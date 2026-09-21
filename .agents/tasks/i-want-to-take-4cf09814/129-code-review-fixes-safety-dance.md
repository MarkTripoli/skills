---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/128-code-review-safety-dance.md
reviewed_head_sha: cf0eb586d6fd3b02e45b09c3919d894a9b1cb2a3
fixed_head_sha: 44c4f52
status: blocked
summary: "CR-409 is fixed by capturing the daemon's kernel-owned Unix process session before serving and requiring mutation peers to remain in that trusted session, with Darwin no longer using the Linux-only /proc bypass. CR-410 remains blocked because managed-hook provenance still relies on caller-controlled ancestry command-line path text. CR-411 has a deterministic native Windows replacement-race seam and no optional skip, but native Windows execution remains unavailable here."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains two commits ahead of `safety-dance`; this repair is based on the reviewed `cf0eb58` tree and needs re-review against the moved base.
- unrelated changes preserved: task-owned `.atomic-delivery/`, `evidence/`, and `progress.md` remain untracked and untouched.

## Finding Dispositions

### CR-409

- disposition: fixed
- evidence: The daemon captures its own kernel-reported session with `CaptureTrustedOperatorSession` before serving IPC. `AuthorizeMutationPeer` now fails closed unless the peer session is available and equals that captured trusted session; it no longer compares two untrusted descendants. Unix session lookup uses `unix.Getsid`, including Darwin, rather than the Linux-only `/proc` implementation.
- files changed: `tools/safety-dance/internal/daemon/session_authority.go`, `tools/safety-dance/internal/daemon/session_unix.go`, `tools/safety-dance/internal/daemon/session_windows.go`, `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/admission_test.go`
- regression check: `go test -race ./internal/daemon ./internal/pipeline/steps` passed; `go test ./...` passed; `make e2e` passed with the built binary.

### CR-410

- disposition: blocked
- evidence: The current managed-hook admission path still calls `commandHasExecutable` against OS-reported ancestry command text and expected hook paths. A same-user descendant can forge that argv text, so this review finding is not honestly closed by the session repair.
- files changed: None for this finding.
- regression check: Existing daemon and hook tests pass, but no test proves rejection of an attacker below `git-receive-pack` that supplies the exact managed path without Git launching the hook.

### CR-411

- disposition: blocked
- evidence: `evidence_open_windows.go` now exposes a test-only seam immediately after the managed root handle is pinned. The Windows test replaces an intermediate directory with a junction at that point and fails rather than skipping when rename or junction creation fails. Linux cross-compilation passed, but this checkout cannot execute the native Windows test.
- files changed: `tools/safety-dance/internal/pipeline/steps/evidence_open_windows.go`, `tools/safety-dance/internal/pipeline/steps/evidence_open_windows_test.go`
- regression check: `GOOS=windows GOARCH=amd64 go test -c ./internal/pipeline/steps -o /tmp/safety-dance-steps.test.exe` passed; native Windows execution remains unavailable.

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/pipeline/steps`
- result: passed.
- command: `cd tools/safety-dance && go test ./...`
- result: passed for all packages.
- command: `cd tools/safety-dance && go vet ./...`
- result: passed with no diagnostics.
- command: `cd tools/safety-dance && make e2e`
- result: passed using the built `safety-dance` binary.
- command: `cd tools/safety-dance && GOOS=windows GOARCH=amd64 go test -c ./internal/pipeline/steps -o /tmp/safety-dance-steps.test.exe`
- result: passed; native execution was unavailable.
- code commit: `44c4f52` (`fix(safety-dance): bind mutations to trusted sessions`).

## Remaining Blocks

- CR-410 requires replacing forgeable hook-path argv matching with a daemon-issued capability or equivalent OS-backed receive-transaction proof, plus an adversarial descendant test.
- CR-411 requires running the replacement-race test on a native Windows runner.
- `origin/main` moved after the reviewed base; the resulting diff must be reviewed against the current merge target.
- Hosted release execution and authorized live-provider concurrency remain unavailable.
