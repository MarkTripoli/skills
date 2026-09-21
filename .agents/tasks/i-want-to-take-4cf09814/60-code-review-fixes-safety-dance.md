---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 59-code-review-safety-dance.md
reviewed_head_sha: 390f7c202bca502c19d99191127683a51b2aff8d
fixed_head_sha: 9f104dc
status: complete
summary: "CR-167, CR-168, CR-170, CR-171, CR-172, CR-173, and CR-174 were fixed. CI now preserves the reviewed head and polls within the configured timeout, PR creation uses the durable target branch, pending recovery performs a guarded pending-to-running transition, startup scans configured worktree roots, orphan-gate failures restore snapshots, and Windows task labels and commands are sanitized. CR-169 now routes SCM construction through one factory and fails closed before pipeline execution for providers without an implementation; non-GitHub provider execution remains blocked. Focused Go tests, the full race suite, vet, identity, and Safety Dance aggregate checks passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The reviewed head was `390f7c2`; the repair commit is `9f104dc`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` directories were not staged or changed.

## Finding Dispositions

### CR-167

- disposition: fixed
- evidence: `GetChecks` keeps the durable expected head immutable, compares it with the live PR head before querying checks, and rechecks the same head after discovery. A changed PR head returns an error instead of certifying checks for another commit.
- files changed: `tools/safety-dance/internal/scm/github/github.go`, `tools/safety-dance/internal/pipeline/steps/ci.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/scm/github ./internal/pipeline/steps && go vet ./...`

### CR-168

- disposition: fixed
- evidence: The CI step now repeats PR state and check discovery until all checks pass, cancellation occurs, a terminal failure appears, or `Config.CITimeout` expires. Empty and pending check sets remain non-terminal during the bounded monitor.
- files changed: `tools/safety-dance/internal/pipeline/steps/ci.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/steps`

### CR-169

- disposition: blocked
- evidence: Production host construction now has one centralized factory and refuses unsupported SCM providers before the pipeline can validate or publish. Only the existing GitHub host is implemented in this change; GitLab, Bitbucket, Azure DevOps, Forgejo, and Gitea still need concrete host implementations before their advertised provider paths can complete.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/daemon`

### CR-170

- disposition: fixed
- evidence: The PR step resolves its base branch as run override, merged repository policy, then repository default, and passes that value to both existing-PR lookup and creation.
- files changed: `tools/safety-dance/internal/pipeline/steps/pr.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/steps ./internal/cli`

### CR-171

- disposition: fixed
- evidence: `Manager.Resume` rejects terminal rows and compare-and-sets pending rows to running before registering an executor. Duplicate push notifications treat terminal rows as completed receipts and do not relaunch them. Startup recovery applies the same pending-to-running transition.
- files changed: `tools/safety-dance/internal/daemon/manager.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli`

### CR-172

- disposition: fixed
- evidence: Daemon startup loads global worktree configuration, scans the default root plus every unique configured root, skips absent roots, and applies protected-run paths during pending recovery.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/worktrees`

### CR-173

- disposition: fixed
- evidence: Any pre-existing bare gate is restored from its snapshot after provisioning fails, including an orphan gate with no database row. Fresh gates are removed only when this attempt created them.
- files changed: `tools/safety-dance/internal/gate/gate.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/gate`

### CR-174

- disposition: fixed
- evidence: Windows task labels replace drive colons and the scheduled-task action escapes metacharacters, percent signs, and quotes in `SD_HOME` while invoking the executable without literal backslash-escaped quotes.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `cd tools/safety-dance && GOOS=windows GOARCH=amd64 go test -c -o /tmp/safety-dance-daemon.test.exe ./internal/daemon ./internal/cli ./internal/git`

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./... && go vet ./...`
- result: Passed.
- command: `npm run test:safety-dance`
- result: Passed identity scan, full Go race suite, vet, temporary binary build, and release-contract tests.
- command: `git diff --check`
- result: Passed before the repair commit.

## Remaining Blocks

- CR-169 remains blocked until concrete SCM host implementations exist for the non-GitHub providers exposed by provider detection and configuration.
- Hosted Windows service execution, live provider-backed PR/CI behavior, and hosted `safety-dance-v*` release execution remain unavailable.
