---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 79-code-review-safety-dance.md
reviewed_head_sha: 4a4891c5dfb3c3b362076fb9bddae7dc416f1437
fixed_head_sha: 221af91
status: complete
summary: "Fixed thirteen of fourteen reviewed major findings across receive-hook recovery, setup rollback, worktree recovery, bootstrap writes, service restart, TUI controls, validation defaults, no-CI handling, and identity scanning. CR-268 remains blocked because managed-hook ancestry enforcement needs an executable authorization fixture without weakening existing IPC tests; Go and root aggregate checks passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review 79 examined `4a4891c`; this phase added code commit `221af91` and this receipt. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not staged.

## Finding Dispositions

### CR-266

- disposition: fixed
- evidence: Both post-receive input-capture failure branches recover the matching token from the persisted receipt ledger and notify the daemon with that token; the first branch no longer reads an unset shell variable.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test ./internal/git`; passed.

### CR-267

- disposition: fixed
- evidence: Empty receipt-lock directories are never reclaimed by age. Only a published PID whose process is no longer live can be reclaimed.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/git`; passed.

### CR-268

- disposition: blocked
- evidence: The existing token issuance path enforces managed-hook ancestry, but admission, revoke, and notify still rely on token binding without independently enforcing that ancestry. A complete fix requires replacing direct IPC test setup with an executable managed-hook authorization fixture; no safe production-only change was completed in this phase.
- files changed: None.
- regression check: Existing daemon and executable-hook tests pass, but they do not prove the missing authorization boundary.

### CR-269

- disposition: fixed
- evidence: Fresh initialization now returns a rollback that deletes the inserted repository row, restores the managed remote and gate snapshot, and removes a newly created bare gate after later wizard compensation fails.
- files changed: `tools/safety-dance/internal/gate/gate.go`
- regression check: `cd tools/safety-dance && go test ./internal/gate ./internal/cli`; passed.

### CR-270

- disposition: fixed
- evidence: Repeated custom-gate setup accepts the existing owned symlink target, and eject removes the resolved bare-repository target before removing the stable symlink.
- files changed: `tools/safety-dance/internal/cli/wizard.go`, `tools/safety-dance/internal/gate/gate.go`
- regression check: `cd tools/safety-dance && go test ./internal/gate ./internal/cli ./internal/wizard`; passed.

### CR-271

- disposition: fixed
- evidence: Removal recovery accepts protected worktree paths and skips journals belonging to active or recoverable runs instead of deleting them unconditionally.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/worktrees ./internal/cli ./internal/daemon`; passed.

### CR-272

- disposition: fixed
- evidence: Journal-root selection resolves the default `~/.safety-dance/worktrees` layout even when `SD_HOME` is unset.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/worktrees`; passed.

### CR-273

- disposition: fixed
- evidence: Bootstrap policy writes now use a mode-0600 temporary file, `Sync`, close, and same-directory atomic rename, preserving the previous trusted policy across interrupted writes.
- files changed: `tools/safety-dance/internal/policy/bootstrap.go`
- regression check: `cd tools/safety-dance && go test ./internal/policy`; passed.

### CR-274

- disposition: fixed
- evidence: Installed service restart now uses the service owner's restart operation and preserves the owned persistent definition; ad-hoc stop/start remains the fallback when no service is installed.
- files changed: `tools/safety-dance/internal/daemon/service.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon ./internal/cli`; passed.

### CR-275

- disposition: fixed
- evidence: Compact TUI shortcuts now map `a/f/s/x` to approve, fix, skip, and abort respectively.
- files changed: `tools/safety-dance/internal/tui/app.go`
- regression check: `cd tools/safety-dance && go test ./internal/tui`; passed.

### CR-276

- disposition: fixed
- evidence: `tui --plain` is registered and forces ANSI-free one-shot output even on a terminal.
- files changed: `tools/safety-dance/internal/cli/tui.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/tui`; passed.

### CR-277

- disposition: fixed
- evidence: Typed validation requires gate neutralization only when trusted configuration enables `disable_project_settings`; the default false path invokes the selected agent.
- files changed: `tools/safety-dance/internal/pipeline/steps/validation.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline/steps`; passed.

### CR-278

- disposition: fixed
- evidence: Trusted `no_ci` configuration marks CI ready without provider polling or timeout.
- files changed: `tools/safety-dance/internal/pipeline/steps/ci.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline/steps`; passed.

### CR-279

- disposition: fixed
- evidence: Production identity scanning now includes `.claude-plugin/plugin.json`.
- files changed: `scripts/check-safety-dance-identity.mjs`
- regression check: `npm test`; passed.

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test ./... && go vet ./...`
- result: Passed.
- command: `npm test`
- result: Passed validation, plugin synchronization, 136 Node tests, identity checks, Go race tests, vet, temporary build, and release-contract tests.
- command: `git diff --check`
- result: Passed.

## Remaining Blocks

- CR-268 remains blocked pending an executable managed-hook authorization fixture and production enforcement for admission, revoke, and notify.
- Hosted Windows execution, live provider behavior, hosted `safety-dance-v*` release execution, and induced crash interruption remain unavailable.
