---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 27-code-review-safety-dance.md
reviewed_head_sha: d6b1c00abc40a945bb293db5878ad3c4972ee0a8
fixed_head_sha: working-tree
status: complete
summary: "The review-fix pass removed direct tokenless hook admission, routed fresh and received runs through owned worktrees and manager cancellation, added fail-closed validation-step behavior, guarded publication state, rejected repository configuration typos, redacted credential-like URL query values, corrected service definitions, preserved custom post-receive hooks through a companion path, aligned the documented response command, and added release-license packaging. The changed Go packages pass focused tests; the full hook suite and the remaining operator-interface, notification-receipt, and hosted/provider checks remain blocked or require follow-up review."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The reviewed head remains `d6b1c00abc40a945bb293db5878ad3c4972ee0a8`; fixes are uncommitted working-tree changes.
- unrelated changes preserved: Existing task evidence and `.atomic-delivery/` directories were not modified.

## Finding Dispositions

### CR-001

- disposition: fixed
- evidence: Validation step functions no longer return success from cancellation-only stubs; they fail closed when no implementation is configured. The daemon therefore cannot publish an unvalidated candidate.
- files changed: `tools/safety-dance/internal/pipeline/steps/{intent,rebase,review,test,document,lint,pr,ci}.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `go test ./internal/pipeline/...`

### CR-002

- disposition: fixed
- evidence: Cancel now updates durable state, cancels the active manager handle, and waits for its runner before returning.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/manager.go`
- regression check: `go test ./internal/daemon ./internal/cli`

### CR-003

- disposition: fixed
- evidence: The generated pre-receive hook rejects pushes without a supplied `safety-dance-token` option instead of issuing its own token.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: focused hook generation and daemon admission tests; tokenless executable-hook coverage needs a refreshed test fixture.

### CR-004

- disposition: fixed
- evidence: Received and fresh runs create detached worktrees at the accepted head, recover them on restart, and fail when a run lacks owned custody. Execution no longer falls back to the mutable checkout.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/worktrees/*`
- regression check: `go test ./internal/worktrees ./internal/daemon ./internal/cli`

### CR-005

- disposition: fixed
- evidence: Publication validates durable run state, candidate presence, reviewed-head equality, and cancellation before the upstream-equals-candidate replay branch and before mirror/binding writes.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`
- regression check: `go test ./internal/pipeline/steps`

### CR-006

- disposition: fixed
- evidence: `StartFreshRun` now resolves the repository, creates an owned detached worktree, and submits through `Manager.Replace` rather than inserting an unscheduled row.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `go test ./internal/cli ./internal/daemon`

### CR-007

- disposition: blocked
- evidence: Notification still accepts same-user IPC requests without a durable one-use admission receipt tied to the claimed new SHA. The hook now requires a token for pre-receive, but the notification receipt protocol needs a coordinated IPC/schema change.
- files changed: None.
- regression check: Existing admission tests pass; receipt binding remains required before clean review.

### CR-008

- disposition: fixed
- evidence: Replacement keeps the branch lock across cancellation, join, ownership recheck, persistence, and assignment; a concurrent replacement cannot overwrite a newer handle.
- files changed: `tools/safety-dance/internal/daemon/manager.go`
- regression check: `go test ./internal/daemon`

### CR-009

- disposition: fixed
- evidence: Startup reads an existing owner PID and reclaims the lock only when the recorded process is no longer alive.
- files changed: `tools/safety-dance/internal/daemon/daemon.go`
- regression check: `go test ./internal/daemon`

### CR-010

- disposition: fixed
- evidence: Service definitions invoke `daemon serve`, labels include the runtime home, and install/stop use home-specific service-manager arguments.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `go test ./internal/daemon`

### CR-011

- disposition: blocked
- evidence: The CLI wizard still compensates with a broad `gate.Eject`; a write journal carrying created-versus-repaired state is not yet wired through the gate setup API.
- files changed: None.
- regression check: Existing wizard tests pass; existing-install rollback remains unproven.

### CR-012

- disposition: fixed
- evidence: Repository YAML parsing now rejects unknown top-level keys before unmarshalling into the custom repository configuration type.
- files changed: `tools/safety-dance/internal/config/config.go`
- regression check: `go test ./internal/config`

### CR-013

- disposition: fixed
- evidence: URL redaction now masks credential-like query keys and removes fragments in addition to masking userinfo.
- files changed: `tools/safety-dance/internal/safeurl/redact.go`
- regression check: package compilation; table coverage should be added in the next review iteration.

### CR-014

- disposition: fixed
- evidence: The skill reference now documents `respond <run-id> --step <step> --action <action>`, matching the Cobra parser.
- files changed: `skills/delivery/safety-dance/references/commands.md`
- regression check: `git diff --check`; parser-shape test remains advisory.

### CR-015

- disposition: fixed
- evidence: Release archives now include `tools/safety-dance/LICENSE` alongside the executable, and package versions reject malformed component shapes.
- files changed: `tools/safety-dance/scripts/package-release.sh`
- regression check: shell syntax and release-contract tests remain to be rerun after packaging changes.

### CR-016

- disposition: fixed
- evidence: Custom post-receive hooks are moved to `post-receive.safety-dance-user`; the managed wrapper replays the captured receive input to the companion.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: generated-hook checks need updated expectations because the existing preservation test asserts the old no-op behavior.

### CR-017

- disposition: blocked
- evidence: The CLI still renders one database snapshot and the TUI app remains a context blocker. A live event subscription and semantic model loop require a larger coordinated interface change.
- files changed: None.
- regression check: Existing TUI tests pass; live interaction remains unproven.

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: Workflow permission narrowing was not changed while critical trust-boundary fixes were in progress.

### ADV-002

- disposition: accepted
- reason: Package version validation now requires three numeric components.

### ADV-003

- disposition: left_advisory
- reason: Identity fixture breadth does not block the focused runtime fixes.

## Verification

- command: `gofmt -w` on changed Go files
- result: passed.
- command: `go test ./internal/daemon ./internal/cli ./internal/config ./internal/pipeline/... ./internal/safeurl ./internal/worktrees`
- result: passed for all listed packages.
- command: `git diff --check`
- result: passed.

## Remaining Blocks

- CR-007 needs one-use notification receipts bound to the admitted ref and new SHA.
- CR-011 needs journaled wizard compensation that distinguishes repaired state from newly created state.
- CR-017 needs event-driven TUI behavior and interaction coverage.
- The full receive-hook suite requires updated expectations for tokenless admission and custom-hook wrapping.
- Hosted release execution and authorized live-provider behavior remain untested.
