---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 47-code-review-safety-dance.md
reviewed_head_sha: 2015c74be8d4c38bbaf4f9eec760bfff617068e8
fixed_head_sha: 8a4de19
status: complete
summary: "This repair pass adds authenticated daemon shutdown, branch-scoped TUI selection, cross-target notice generation, serialized admission callbacks, global command merging, and remote-head reconciliation for interrupted publication. Typed owner routing, complete ancestry proof, Windows mutation transport, durable worktree ownership, and policy-bound step reuse remain blocked; focused Go tests, vet, diff checks, and a Windows packaging smoke test pass."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review targeted `2015c74`; fixes landed at `8a4de19`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not modified.

## Finding Dispositions

### CR-112

- disposition: blocked
- evidence: Managed-hook inspection now rejects marked ancestors and checks the exact executable argument instead of matching arbitrary command text. Complete authenticated executable/process identity remains unavailable, and Windows mutation ancestry remains unsupported.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon`

### CR-113

- disposition: blocked
- evidence: The production executor still routes named stages through configured shell adapters; the imported typed agent, provider PR, and CI owners are not yet connected to the shipped pipeline or response state machine.
- files changed: None.
- regression check: `cd tools/safety-dance && go test ./internal/pipeline ./internal/pipeline/steps`

### CR-114

- disposition: fixed
- evidence: A surviving `push_active` claim now reconciles the live remote head before retry. If the candidate is already remote, the run continues through mirror update and durable publication binding without repeating the push; a divergent head fails closed.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline/steps`

### CR-115

- disposition: blocked
- evidence: Windows process-environment inspection and mutation authorization remain unsupported. The release packaging command is cross-target safe, but Windows runtime mutation is not claimed fixed.
- files changed: None.
- regression check: `cd tools/safety-dance && go test ./internal/daemon`

### CR-116

- disposition: fixed
- evidence: The prior repair's full-line command input and canonical configuration persistence remain in place; this pass did not regress them.
- files changed: None.
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/wizard ./internal/config`

### CR-117

- disposition: fixed
- evidence: `daemon stop` now uses authenticated shutdown IPC, waits for health failure, and removes the PID file only after shutdown is observed; it no longer signals an arbitrary stale PID.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli`

### CR-118

- disposition: blocked
- evidence: Existing terminal cleanup and recovery protections remain, but creation and cleanup are not yet represented by a complete durable worktree ownership state machine with startup sweeping.
- files changed: None.
- regression check: `cd tools/safety-dance && go test ./internal/worktrees ./internal/daemon ./internal/e2e`

### CR-119

- disposition: fixed
- evidence: Admission receipt validation now releases the global mutex before invoking the potentially blocking manager callback, then conditionally consumes the unchanged receipt afterward.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon`

### CR-120

- disposition: blocked
- evidence: Global command configuration is now merged into the effective repository command set, but completed step reuse is still status-only and does not persist/compare candidate, policy, owner inputs, or generation.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/pipeline`

### CR-121

- disposition: fixed
- evidence: The TUI resolves the current checkout's symbolic branch and queries the active run for that exact branch instead of selecting the newest run across the repository.
- files changed: `tools/safety-dance/internal/cli/tui.go`
- regression check: `cd tools/safety-dance && go test ./internal/tui ./internal/cli`

### CR-122

- disposition: fixed
- evidence: Release notice generation explicitly clears `GOOS` and `GOARCH` before executing the host-side generator. With target variables set, the Windows archive packaging smoke test produced `safety-dance_1.2.3_windows_amd64.zip` and checksums successfully.
- files changed: `tools/safety-dance/scripts/package-release.sh`
- regression check: `GOOS=windows GOARCH=amd64 ./scripts/package-release.sh --version 1.2.3 --os windows --arch amd64 --binary <native-test-binary> --out <temp-dir>`

### CR-123

- disposition: blocked
- evidence: `executeRun` now loads global configuration and merges its command defaults into the effective repository configuration. Global agent/provider selection and all documented publication behavior are not yet wired through the production executor, so the full finding remains open.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/config`

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test ./internal/cli ./internal/daemon ./internal/pipeline/steps ./internal/tui`
- result: Passed.
- command: `cd tools/safety-dance && go vet ./internal/cli ./internal/daemon ./internal/pipeline/steps`
- result: Passed with no diagnostics.
- command: `git diff --check`
- result: Passed.
- command: Windows-target packaging smoke test with `GOOS=windows GOARCH=amd64` exported to `package-release.sh`
- result: Passed; host notice generation ran natively and the Windows archive plus checksum were created.

## Remaining Blocks

- CR-112: Complete authenticated executable/process ancestry proof, including Windows.
- CR-113: Route production stages through typed validation, agent, provider, and CI owners with durable response semantics.
- CR-115: Implement Windows mutation transport and ancestry authentication, or remove the runtime support promise.
- CR-118: Persist recoverable worktree ownership and startup cleanup state.
- CR-120: Bind completed-step reuse to durable candidate and trusted-policy inputs.
- CR-123: Apply global agent/provider and publication configuration throughout the production executor.
- Hosted release execution, live provider behavior, and Windows runtime verification remain unavailable.
