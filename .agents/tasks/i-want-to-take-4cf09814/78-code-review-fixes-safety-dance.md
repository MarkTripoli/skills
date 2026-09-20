---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 77-code-review-safety-dance.md
reviewed_head_sha: b606cce05d2263e00577f1e9b722adf59023ceff
fixed_head_sha: e187b1f
status: complete
summary: "CR-257 through CR-265 were addressed in the receipt hook, terminal cleanup, bootstrap policy, worktree journal, wizard, compact TUI, and CLI documentation owners. Focused Go packages, the full Go suite, vet, and the root npm aggregate passed; hosted release, live provider, and real crash-interruption evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review covered `b606cce`; this phase added commit `e187b1f` with nine reviewed-path fixes.
- unrelated changes preserved: Existing task-owned `.atomic-delivery/` and `evidence/` directories remain untracked and were not staged.

## Finding Dispositions

### CR-257

- disposition: fixed
- evidence: Post-receive receipt lookup now selects the newest matching receipt, so an older revoked token cannot shadow a later accepted update.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test ./internal/git`

### CR-258

- disposition: fixed
- evidence: Post-receive input-capture failure is logged and falls back to direct notification of accepted ref lines instead of silently exiting before daemon notification.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test ./internal/git`

### CR-259

- disposition: fixed
- evidence: Empty receipt locks remain protected during the publication window but become reclaimable after a five-second filesystem-age threshold, allowing recovery after a creator dies before PID publication.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/git`

### CR-260

- disposition: fixed
- evidence: Successful cleanup intent is journaled before `RunCompleted` is persisted; startup can now resume removal after a crash between those operations.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/worktrees ./internal/daemon`

### CR-261

- disposition: fixed
- evidence: Bootstrap retirement creates its parent directory, wizard bootstrap revisions come from the fetched upstream default branch rather than the current feature checkout, and compensation restores an existing bootstrap file instead of deleting it.
- files changed: `tools/safety-dance/internal/policy/bootstrap.go`, `tools/safety-dance/internal/paths/paths.go`, `tools/safety-dance/internal/cli/wizard.go`
- regression check: `cd tools/safety-dance && go test ./internal/policy ./internal/paths ./internal/cli ./internal/config`

### CR-262

- disposition: fixed
- evidence: Custom worktree roots place journals beside the selected root and no longer search backward for an ancestor named `worktrees`; default `SD_HOME/worktrees` placement retains its shared journal root.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/worktrees ./internal/cli`

### CR-263

- disposition: fixed
- evidence: Wizard gate and provider choices are validated, persisted in `.safety-dance.yaml`, and the selected absolute gate location is applied by relocating the initialized gate behind its stable runtime path. The supported provider remains GitHub, matching the existing SCM implementation.
- files changed: `tools/safety-dance/internal/cli/wizard.go`, `tools/safety-dance/internal/config/config.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/config ./internal/wizard`

### CR-264

- disposition: fixed
- evidence: Narrow rendering wraps semantic values instead of truncating them; production action choices compact to `a/f/s/x`, while short prompts and keys remain visible within the width bound.
- files changed: `tools/safety-dance/internal/tui/view.go`
- regression check: `cd tools/safety-dance && go test ./internal/tui`

### CR-265

- disposition: fixed
- evidence: CLI documentation now lists the setup wizard, bare-command wizard/TUI routing, supported setup choices, rollback behavior, and ANSI-free output mode.
- files changed: `tools/safety-dance/docs/cli.md`
- regression check: `npm test` identity and repository validation passed.

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: Cancelled unpublished recovery remains a follow-up classification improvement; publication guards still prevent changed remote heads from being published.

## Verification

- command: `cd tools/safety-dance && go test ./... && go vet ./...`
- result: Passed all Go packages and vet.
- command: `npm test`
- result: Passed validation, plugin synchronization, 136 Node tests, identity checks, Go race tests, vet, temporary build, and release-contract tests.
- command: `git diff --check`
- result: Passed.

## Remaining Blocks

- Hosted Windows execution, live provider behavior, hosted `safety-dance-v*` release execution, and an actual induced crash at each reviewed interruption point remain unavailable in this environment.
