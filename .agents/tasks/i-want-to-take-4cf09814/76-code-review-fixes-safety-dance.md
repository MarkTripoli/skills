---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 75-code-review-safety-dance.md
reviewed_head_sha: 8a7055bb952180562cbc20f07becfcde925965dd
fixed_head_sha: 1dd4553cb1908359b9d4b7c52cc144b8758442e4
status: complete
summary: "CR-247, CR-248, CR-249, CR-250, CR-251, CR-252, CR-254, CR-255, and CR-256 were fixed with focused production-path changes and tests. CR-253 remains blocked because the wizard now collects and validates gate/provider choices but the existing gate owner has no persisted custom-location contract; hosted release, provider, Windows, and live interruption evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review head `8a7055b` advanced to `1dd4553`; five focused fix commits and two documentation/test commits were added on `safety-dance`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` directories were not staged or changed.

## Finding Dispositions

### CR-247

- disposition: fixed
- evidence: Receipt rewrite status is preserved across unlock and local removal failure; stale accepted tokens cannot be reported as successfully revoked.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/git`

### CR-248

- disposition: fixed
- evidence: Reconciliation uses a bounded attempted snapshot, releases claims on every failure, restores receipts when persistence fails, and aggregates errors without retrying one receipt in a tight loop.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`

### CR-249

- disposition: fixed
- evidence: Default `SD_HOME` journals are placed under `SD_HOME/worktrees/.safety-dance-journals`, matching startup discovery and recovery roots.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/worktrees ./internal/cli ./internal/daemon`

### CR-250

- disposition: fixed
- evidence: Bootstrap policy envelopes bind repository identity and trusted revision, are resolved through the shared policy owner, and are permanently retired after committed default-branch policy is observed.
- files changed: `tools/safety-dance/internal/policy/bootstrap.go`, `tools/safety-dance/internal/paths/paths.go`, `tools/safety-dance/internal/cli/wizard.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/policy ./internal/paths ./internal/cli`

### CR-251

- disposition: fixed
- evidence: Pre-receive custody writes now fail closed and revoke issued daemon receipts when local capture or receipt persistence fails before Git can mutate the ref.
- files changed: `tools/safety-dance/internal/git/hook.go`, `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/git ./internal/daemon`

### CR-252

- disposition: fixed
- evidence: Successful terminal cleanup is journaled before the terminal status transition, and startup recovery tests cover pending and removing journals.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/worktrees/ownership.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/worktrees ./internal/cli ./internal/daemon`

### CR-253

- disposition: blocked
- evidence: The production wizard now prompts for `upstream`, `gate`, `provider`, and `commands`, and rejects unsupported provider or gate values. The existing gate API still derives and persists the gate path from `Paths.RepoDir` and has no repository configuration or database field for a selected custom location, so claiming full apply/persist behavior would be false.
- files changed: `tools/safety-dance/internal/cli/wizard.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/wizard`

### CR-254

- disposition: fixed
- evidence: Compact rendering emits prompt and key values without their descriptive prefixes at widths up to eight columns, preserving actionable choices while retaining the line-width bound.
- files changed: `tools/safety-dance/internal/tui/view.go`, `tools/safety-dance/internal/tui/view_test.go`
- regression check: `cd tools/safety-dance && go test ./internal/tui`

### CR-255

- disposition: fixed
- evidence: The identity scanner assembles the source owner token from fragments and rejects both the owner-only token and the retired module identity; the negative fixture covers both cases while the legal license remains allowlisted.
- files changed: `scripts/check-safety-dance-identity.mjs`, `tests/safety-dance-identity.test.mjs`
- regression check: `node --test tests/safety-dance-identity.test.mjs`

### CR-256

- disposition: fixed
- evidence: Receipt locking no longer allows an empty lock directory to be reclaimed while its creator is between directory creation and owner publication; the generated hook lock protocol and focused race coverage preserve single-owner custody.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/git`

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: Cancelled pre-push recovery classification remains a follow-up improvement; publication guards still prevent changed remote heads from being published.

### ADV-002

- disposition: accepted
- reason: Configuration precedence now distinguishes ordinary repository overlays from trusted default-branch policy and bootstrap retirement. Product documentation lists Linux, macOS, and Windows release archives and the Windows executable name.

## Verification

- command: `npm test`
- result: Passed validation and plugin synchronization, 136 Node tests, identity scanning, Go race tests, vet, temporary build, and release-contract tests.
- command: `cd tools/safety-dance && go test ./internal/...`
- result: Passed all current Go internal packages.
- command: `git diff --check origin/main...HEAD -- ':!.agents/tasks/**'`
- result: Passed.

## Remaining Blocks

- CR-253 requires a gate-owner API and durable repository field for custom gate-location persistence and application.
- Hosted Windows execution, live provider behavior, hosted `safety-dance-v*` release execution, and a real concurrent interruption run remain unavailable in this environment.
