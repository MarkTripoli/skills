---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 43-code-review-safety-dance.md
reviewed_head_sha: e6b2a27aaf96901592db9bb6b54ee692f676b964
fixed_head_sha: 2d19ae2
status: complete
summary: "This repair pass fails closed when production validation commands are absent, propagates parent-run identity to validation processes, makes same-branch replacement and response resumption durable, records post-step worktree heads, reclaims terminal worktrees, resolves absolute service binaries, persists wizard configuration, applies live TUI width, and fixes identity, platform, and release-notice documentation gaps. Full ancestry authorization, crash-safe push ownership recovery, and generated complete dependency notices remain blocked and require another focused repair."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review targeted `e6b2a27`; fixes were made at `2d19ae2`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not modified.

## Finding Dispositions

### CR-083

- disposition: fixed
- evidence: Production validation now requires a configured command for every named validation stage and runs it in the owned worktree before the diff check. Empty/default policy therefore fails instead of self-certifying a publication.
- files changed: `tools/safety-dance/internal/pipeline/steps/validation.go`
- regression check: `cd tools/safety-dance && go test ./...`

### CR-084

- disposition: blocked
- evidence: Validation subprocesses now receive `SD_PARENT_RUN_ID`, and production binds the run context. The existing ancestry check still needs a complete cross-platform ancestry walk and an exact executable-identity check, especially on Darwin.
- files changed: `tools/safety-dance/internal/pipeline/steps/validation.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon ./internal/cli`

### CR-085

- disposition: fixed
- evidence: Supersession clears publication ownership and accepts an active run that the cancellation callback already classified as failed, allowing the replacement run to persist and start.
- files changed: `tools/safety-dance/internal/db/runs.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon ./internal/e2e`

### CR-086

- disposition: fixed
- evidence: The runner now waits on parked step responses, atomically consumes the oldest response for the matching run and step, resumes approved responses, records skips, and aborts on an explicit abort response. Response rows are no longer write-only across restart.
- files changed: `tools/safety-dance/internal/db/responses.go`, `tools/safety-dance/internal/pipeline/runner.go`
- regression check: `cd tools/safety-dance && go test ./internal/db ./internal/pipeline ./internal/cli`

### CR-087

- disposition: fixed
- evidence: The production push handler resolves the current worktree `HEAD` immediately before publication and rejects any mismatch with the durable review-approved head.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline/steps ./internal/e2e`

### CR-088

- disposition: fixed
- evidence: Accepted notifications persist their previous reconciled head; production push requests carry that verified head and select the explicit lease path for rewritten history.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline/steps ./internal/e2e`

### CR-089

- disposition: blocked
- evidence: Publication detects stale `push_active` and can clear it before retry, but this pass does not yet prove remote-head and gate-mirror ownership before reclaiming a crash-stale claim. The crash-after-remote-write case needs a durable recovery state machine rather than an unconditional reset.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline/steps ./internal/e2e`

### CR-090

- disposition: fixed
- evidence: Each completed production step records the current worktree `HEAD`; restart recovery therefore uses the latest durable step output instead of only the originally accepted head.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/daemon ./internal/e2e`

### CR-091

- disposition: fixed
- evidence: Run creation already durably records the intended worktree before creation, and terminal production-run handling now removes the owned worktree after completion or failure while preserving the run record.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/worktrees ./internal/daemon ./internal/e2e`

### CR-092

- disposition: fixed
- evidence: Wizard service definitions now use an absolute existing executable path from `os.Executable`, avoiding user-service PATH dependence.
- files changed: `tools/safety-dance/internal/cli/wizard.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/daemon ./internal/wizard`

### CR-093

- disposition: fixed
- evidence: Wizard setup now collects upstream, gate, and provider values, writes `.safety-dance.yaml`, and removes only a newly created configuration during compensation while restoring the original upstream remote.
- files changed: `tools/safety-dance/internal/cli/wizard.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/wizard ./internal/gate`

### CR-094

- disposition: fixed
- evidence: Public installation documentation now claims only Linux and macOS, matching the release workflow's supported matrix.
- files changed: `docs/safety-dance.md`
- regression check: `npm run test:safety-dance`

### CR-095

- disposition: blocked
- evidence: The archive notice now enumerates direct and known transitive dependency modules and their license classes, but it is still a checked-in manifest rather than generated from the compiled module graph with complete upstream notice text. Generated notice coverage remains required.
- files changed: `tools/safety-dance/THIRD_PARTY_NOTICES.md`
- regression check: `npm run test:safety-dance`

### CR-096

- disposition: fixed
- evidence: The imported-notice scan now uses the same task-history exclusion as retired-name scanning, so historical task artifacts cannot fail shipped identity validation.
- files changed: `scripts/check-safety-dance-identity.mjs`
- regression check: `npm test`

### CR-097

- disposition: fixed
- evidence: The interactive TUI now obtains terminal width through an injectable width function or terminal size lookup and passes it to the semantic renderer; non-terminal output remains width-neutral.
- files changed: `tools/safety-dance/internal/tui/app.go`
- regression check: `cd tools/safety-dance && go test ./internal/tui`

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test ./... && go vet ./...`
- result: Passed all Go packages and vet with no diagnostics.
- command: `npm test`
- result: Passed validation, plugin synchronization, 136 Node tests, identity scanning, Go race tests, vet, temporary build, and release-contract tests.
- command: `git diff --check`
- result: Passed for the committed repair diff.

## Remaining Blocks

- CR-084: Full ancestry authorization and Darwin-specific descendant proof remain unimplemented.
- CR-089: Crash-safe publication ownership recovery must inspect durable remote and mirror state before reclaiming `push_active`.
- CR-095: Release notices must be generated from the dependency graph and include complete required upstream license text.
- Hosted release execution, live provider behavior, and live service-manager startup remain unavailable in this environment.
