---
type: code-review-fixes
date: 2026-09-22
branch: onboard-finishes-only-when
review_artifact: .agents/tasks/onboard-finishes-only-when/02-code-review-onboard-finishes-only-when.md
reviewed_head_sha: b6f2567649fa5bcfed2677895b6cbc6191ee2676
fixed_head_sha: ac4859cb92fe4c9fc33166b20c2442413d961c4f
status: complete
summary: "Fixed both major review findings: installed services are explicitly reinstalled during token-repair restart, and IPC handler contexts are cancelled when clients disconnect. The required race test suite passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review artifact commit advanced HEAD from `b6f2567649fa5bcfed2677895b6cbc6191ee2676` to `4f76973`; the reviewed code was unchanged. The fixes are committed at `ac4859cb92fe4c9fc33166b20c2442413d961c4f`.
- unrelated changes preserved: None; only the four reviewed code/test files changed.

## Finding Dispositions

### CR-001

- disposition: fixed
- evidence: `restartDaemon` now calls `Service.Uninstall`, `Service.Install`, and then waits for health at `tools/slack-coordinator/internal/cli/daemon.go:174-185`, so a clean daemon shutdown is followed by an explicit relaunch on Linux and macOS. `TestRestartDaemonReinstallsAnInstalledLinuxService` records the disable, reload, and enable commands at `tools/slack-coordinator/internal/cli/service_test.go:102-131`.
- files changed: `tools/slack-coordinator/internal/cli/daemon.go`; `tools/slack-coordinator/internal/cli/service_test.go`.
- regression check: The focused `go test -race -count=1 ./internal/assistant ./internal/onboard ./internal/cli ./internal/ipc` passed, including the Linux supervisor test.

### CR-002

- disposition: fixed
- evidence: `ipc.Server.handleConn` now reads socket lines in a dedicated goroutine, cancels the request context on EOF/error, and dispatches requests serially from the line channel at `tools/slack-coordinator/internal/ipc/server.go:125-165`. `TestHandlerContextCancelsWhenClientDisconnects` proves a blocked handler observes cancellation after its Unix client closes at `tools/slack-coordinator/internal/ipc/ipc_test.go:59-101`.
- files changed: `tools/slack-coordinator/internal/ipc/server.go`; `tools/slack-coordinator/internal/ipc/ipc_test.go`.
- regression check: The focused `go test -race -count=1 ./internal/assistant ./internal/onboard ./internal/cli ./internal/ipc` passed without races.

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: The review explicitly accepted the current `!` verb precedence; changing it would alter the task's specified routing placement and was not required for the two major findings.

### ADV-002

- disposition: left_advisory
- reason: `WaitDaemon` still uses the existing bounded five-second polling helper and the requested fixes do not require changing its API or behavior.

### ADV-003

- disposition: left_advisory
- reason: The checkpoint remains mode 0600 and the existing repair behavior is unaffected; changing persistence was outside the required findings.

### ADV-004

- disposition: left_advisory
- reason: The app name is unavailable when repair starts without a checkpoint; the review accepted this bounded behavior and no app-name API change was required.

## Verification

- command: `cd tools/slack-coordinator && go test -race -count=1 ./internal/assistant ./internal/onboard ./internal/cli ./internal/ipc`
- result: Passed: `internal/assistant`, `internal/onboard`, `internal/cli`, and `internal/ipc` all returned `ok` under the race detector.

## Remaining Blocks

- None.
