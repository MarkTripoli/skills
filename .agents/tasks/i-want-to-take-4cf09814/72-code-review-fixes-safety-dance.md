---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 71-code-review-safety-dance.md
reviewed_head_sha: 0369fd99aa6e4a2bcf2aecac71c0f299903571a6
fixed_head_sha: 3afd8a8
status: complete
summary: "CR-231 through CR-239 are addressed in cancelled-publication recovery, manual-run policy pinning, receipt custody and locking, wizard bootstrap policy, admission reconciliation, worktree journal discovery, and Windows custom-gate execution. Focused Go tests, vet, diff checks, and the full npm aggregate passed; hosted Windows, provider, release, and concurrent-interruption evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review targeted base `4458fbf21e199dad45376b8164f78c2165ac1d20` and head `0369fd99aa6e4a2bcf2aecac71c0f299903571a6`; product fixes are committed at `3afd8a8` on the same branch and base.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` directories were not staged or changed.

## Finding Dispositions

### CR-231

- disposition: fixed
- evidence: Cancelled recovery now refuses to invoke publication unless the upstream already equals the reviewed candidate. When it does equal the candidate, `steps.Publish` only reconciles the mirror and durable binding; it cannot push a cancelled candidate.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/e2e`

### CR-232

- disposition: fixed
- evidence: Public fresh-run creation now calls `pinGatesForAdmission` before `Manager.Replace` and stores the resulting `GatesJSON`, matching receive-hook run creation. The setup wizard explicitly writes `allow_repo_commands: true` so its initial local command policy is usable when the upstream default branch has no configuration; later runs prefer the committed trusted policy.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/cli/wizard.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/daemon ./internal/e2e`

### CR-233

- disposition: fixed
- evidence: Pre-receive and post-receive custody now remove the exact token record, including explicit-token pushes. Post-receive retains the receipt until notification succeeds, allowing daemon reconciliation after transient notification failure.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test ./internal/git ./internal/daemon`

### CR-234

- disposition: fixed
- evidence: Receive-hook receipt locks now have bounded acquisition, PID ownership, stale-owner recovery, and signal cleanup. A stale lock no longer wedges later pushes indefinitely.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test ./internal/git`

### CR-235

- disposition: fixed
- evidence: Wizard-generated configuration opts into its initial local command policy, and execution uses that policy only when the trusted default branch has no configuration. Once the default branch contains `.safety-dance.yaml`, execution uses that committed policy.
- files changed: `tools/safety-dance/internal/cli/wizard.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/e2e`

### CR-236

- disposition: fixed
- evidence: Receipt revocation restores the in-memory receipt and claimed state when durable deletion fails, so a rejected update cannot disappear from memory while remaining restorable from stale disk state.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon`

### CR-237

- disposition: fixed
- evidence: Reconciliation claims receipt tokens under the mutex, releases the mutex during Git inspection and run creation, then reacquires it only to finalize custody. Slow same-branch replacement no longer blocks unrelated admission, notification, or revocation operations.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`

### CR-238

- disposition: fixed
- evidence: Daemon startup adds journal roots derived from active persisted worktree placements outside the configured default root. Journal placement is exposed through `JournalRootFor`, so edited or removed configuration does not hide recovery journals.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/worktrees/ownership.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/worktrees`

### CR-239

- disposition: fixed
- evidence: Custom gates select `cmd.exe /D /S /C` on Windows and use `shellenv.CombinedOutputShellCommand`, which performs the required job setup, resume, output capture, and process-tree cleanup. POSIX gates retain `sh -c`.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli && go vet ./...`

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test ./internal/cli ./internal/daemon ./internal/git ./internal/worktrees ./internal/e2e && go vet ./...`
- result: Passed.
- command: `git diff --check`
- result: Passed.
- command: `npm test`
- result: Passed validation, plugin synchronization, 136 Node tests, identity checks, Go race/vet/build aggregate, and release-contract tests.

## Remaining Blocks

- Hosted Windows service and custom-gate execution remain untested in this environment.
- Live provider behavior, hosted `safety-dance-v*` release execution, and a real concurrent receive-hook interruption run remain unavailable.
