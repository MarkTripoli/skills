---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 37-code-review-safety-dance.md
reviewed_head_sha: 037ecf1
fixed_head_sha: 54d7072
status: complete
summary: "This repair pass fails closed for disconnected rebase, review, pull-request, and CI owners; propagates durable step-write failures; binds receipt replay to a stable token; serializes cancellation against publication; uses effective trusted configuration; scopes default and TUI runs to the current repository; authenticates mutating IPC ancestry; protects service-definition ownership; makes wizard prompts truthful; and injects release version metadata. Windows admission remains blocked because authenticated named-pipe ancestry is not implemented; hosted release, live provider, and platform-manager evidence remain untested."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review targeted `037ecf13fc2befa3772bd618ad5688dbf45d0060`; this pass committed product fixes at `ec79e97` and `54d7072`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not modified.

## Finding Dispositions

### CR-049

- disposition: fixed
- evidence: Rebase, review, pull-request, and CI steps now return explicit unavailable-owner errors instead of running the generic diff check. The daemon therefore fails before publication when any required imported owner is disconnected; the production path cannot self-certify those gates.
- files changed: `tools/safety-dance/internal/pipeline/steps/rebase.go`, `review.go`, `pr.go`, `ci.go`
- regression check: `go test ./...`; the unavailable-owner errors are exercised through the fixed pipeline path.

### CR-050

- disposition: fixed
- evidence: `Runner.Run` returns `FailStep` and `CompleteStep` persistence errors. `Publish` also reports failure to clear `push_active` instead of discarding the cleanup error.
- files changed: `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/pipeline/steps/push.go`
- regression check: `go test ./internal/pipeline/... ./internal/pipeline/steps`

### CR-051

- disposition: fixed
- evidence: Token issuance rejects peers whose authenticated process ancestry carries `SD_PARENT_RUN_ID`, while the existing managed-hook ancestry requirement remains in force. The check runs before the hook token is issued.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `go test ./internal/daemon -run 'Admission|ExecutableGate'`

### CR-052

- disposition: fixed
- evidence: `start_fresh_run`, `respond`, and `cancel_run` now require an authenticated Safety Dance CLI peer and reject nested validation descendants at the IPC handler boundary.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/admission.go`
- regression check: `go test ./internal/cli ./internal/daemon`

### CR-053

- disposition: fixed
- evidence: Admission notifications carry the single-use token as a durable identity. `recordPush` checks `GetRunByLaunchNonce` before creating a worktree or replacing a branch run, so receipt replay binds to the existing run.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `go test ./internal/daemon ./internal/cli ./internal/e2e`

### CR-054

- disposition: fixed
- evidence: `CancelRun` requires `push_active=0` and reports a conflict when publication owns the irreversible write. Publication binding already commits only while the run remains active and push-owned.
- files changed: `tools/safety-dance/internal/db/runs.go`
- regression check: `go test ./internal/db ./internal/pipeline/steps ./internal/e2e`

### CR-055

- disposition: fixed
- evidence: The daemon loads pushed configuration from the run-owned worktree, loads the default-branch configuration from the repository remote, combines both with `EffectiveRepoConfig`, and passes only that result to validation steps.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `go test ./internal/cli ./internal/config ./internal/pipeline/steps`

### CR-056

- disposition: fixed
- evidence: The default command and TUI resolve the current repository first and query `GetActiveRun` by repository ID. They no longer select the newest active run across all repositories.
- files changed: `tools/safety-dance/internal/cli/default.go`, `tools/safety-dance/internal/cli/tui.go`
- regression check: `go test ./internal/cli ./internal/tui`

### CR-057

- disposition: fixed
- evidence: The production wizard now asks only for the supported upstream and explicitly asks whether to install the service. The upstream choice updates the repository origin before gate initialization; unsupported gate-location and provider prompts are not shown. Generic setup tests retain their configurable three-prompt behavior.
- files changed: `tools/safety-dance/internal/cli/wizard.go`, `tools/safety-dance/internal/wizard/setup.go`
- regression check: `go test ./internal/wizard ./internal/cli`

### CR-058

- disposition: fixed
- evidence: Service definitions include a Safety Dance ownership marker and runtime-home binding. Install refuses foreign collisions, and stop refuses to remove definitions without the matching marker and home.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `go test ./internal/daemon -run Service`

### CR-059

- disposition: blocked
- evidence: Unix managed-hook ancestry now fails closed for nested validation descendants. Windows still returns unsupported from `managedHookPeer`; authenticated named-pipe ancestry and a Git-for-Windows e2e fixture were not implemented in this pass. The release contract must not claim Windows admission readiness until that owner exists.
- files changed: None.
- regression check: `go test ./internal/daemon`; Windows admission remains untested and blocked.

### CR-060

- disposition: fixed
- evidence: The release workflow injects the validated semantic version, commit prefix, and UTC build date through `-ldflags` when building each archive.
- files changed: `.github/workflows/safety-dance-release.yml`
- regression check: `npm test`; release-contract tests passed.

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: The TUI polling renderer remains unchanged because reducing terminal redraws is independent of the critical and major trust-boundary repairs.

### ADV-002

- disposition: left_advisory
- reason: Missing-binary guidance remains a documentation improvement and does not displace the required safety fixes.

## Verification

- command: `cd tools/safety-dance && go test ./...`
- result: Passed all Go packages.
- command: `cd tools/safety-dance && go vet ./...`
- result: Passed with no diagnostics.
- command: `npm test`
- result: Passed validation, plugin sync, 136 Node tests, Go race tests, vet, build, identity, and release-contract checks.
- command: `git diff --check`
- result: Passed before the code commits.

## Remaining Blocks

- CR-059 remains blocked until Windows named-pipe peer ancestry and Git-for-Windows admission e2e coverage exist.
- Hosted release execution, Windows service-manager execution, live provider behavior, and dependency vulnerability scanning remain untested.
