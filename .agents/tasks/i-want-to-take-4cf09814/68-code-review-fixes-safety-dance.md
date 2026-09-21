---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 67-code-review-safety-dance.md
reviewed_head_sha: 51a5491848dabfb692e2e6678e76a72d830472c7
fixed_head_sha: 85025dc
status: complete
summary: "CR-217 through CR-225 are addressed in the production paths: cleanup journals are trusted metadata, cancelled publication owners resume reconciliation, wizard compensation is creation-aware, preserved-hook receipts revoke durably, worktree cleanup resolves its owning Git source, Windows queries use supported XML syntax, unsupported provider settings fail closed, custom gates execute in the durable runner, and release packaging/publishing resolve their paths and repository. Focused Go tests and the full npm aggregate pass; hosted Windows, provider, and release execution remain untested."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review head was `51a5491848dabfb692e2e6678e76a72d830472c7`; fixes are committed at `85025dc` on the same `origin/main` merge base.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` directories were not staged or changed.

## Finding Dispositions

### CR-217

- disposition: fixed
- evidence: Pending and removal journals now live under the trusted Safety Dance worktree metadata directory, not beside or below checked-out content. Recovery scans only that directory, and the journal still records the exact source and directory before Git removal.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`
- regression check: `cd tools/safety-dance && go test ./internal/worktrees`; `npm test`

### CR-218

- disposition: fixed
- evidence: Startup recovery keeps cancelled runs that still own `push_active`; publication accepts that owner only for live remote reconciliation, then performs mirror and durable binding work without the cancelled request context.
- files changed: `tools/safety-dance/internal/daemon/manager.go`, `tools/safety-dance/internal/pipeline/steps/push.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/pipeline/... ./internal/e2e/...`; `npm test`

### CR-219

- disposition: fixed
- evidence: Wizard compensation ejects a gate only after this attempt reached gate initialization. Validation errors before initialization restore configuration and origin without touching an existing gate.
- files changed: `tools/safety-dance/internal/cli/wizard.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/wizard ./internal/gate`

### CR-220

- disposition: fixed
- evidence: The daemon now registers `revoke-push-receipt`. Preserved-hook cleanup parses whitespace-delimited Git input consistently with the receipt format and removes the exact rejected update before later notifications can replay it.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git`; `npm test`

### CR-221

- disposition: fixed
- evidence: Cleanup and restart recovery resolve the Git source that actually owns each worktree instead of assuming the bare gate. The exact source is written into the trusted removal journal and reused after restart.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/worktrees ./internal/cli ./internal/daemon`; `npm test`

### CR-222

- disposition: fixed
- evidence: Windows scheduled-task queries use `schtasks /XML`, the supported XML switch, before managed-marker, runtime-home, and binary ownership checks. Foreign task collision handling remains fail-closed.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`; hosted Windows execution remains unavailable.

### CR-223

- disposition: fixed
- evidence: GitLab, Bitbucket, and Azure DevOps provider settings are rejected during configuration parsing instead of being accepted as executable policy. The runtime continues to fail closed for unsupported detected hosts; the default configuration documents GitHub only.
- files changed: `tools/safety-dance/internal/config/config.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/config ./internal/cli ./internal/scm`; `npm test`

### CR-224

- disposition: fixed
- evidence: Release packaging converts the output and binary paths to absolute paths before changing directories. The publish job passes `--repo "$GITHUB_REPOSITORY"`, so it does not require a checkout to identify the release repository.
- files changed: `tools/safety-dance/scripts/package-release.sh`, `.github/workflows/safety-dance-release.yml`
- regression check: `npm test`; hosted Windows packaging and hosted release execution remain unavailable.

### CR-225

- disposition: fixed
- evidence: Resolved trusted gates are pinned to the run, expanded deterministically after their anchor core steps, executed in the durable runner, and persisted as ordinary step results. A failing command returns the runner error before push or later steps.
- files changed: `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline ./internal/cli ./internal/e2e`; `npm test`

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./... && go vet ./... && go build -o /tmp/safety-dance-review ./cmd/safety-dance`
- result: Passed all Go packages under race detection, vet, and binary build.
- command: `npm test`
- result: Passed validation, plugin sync, 136 Node tests, identity checks, full Go race/vet/build aggregate, and release-contract tests.
- command: `git diff --check`
- result: Passed with no whitespace errors.

## Remaining Blocks

- Hosted Windows service execution, live non-GitHub provider behavior, and hosted `safety-dance-v*` release execution remain unavailable in this environment.
