---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 83-code-review-safety-dance.md
reviewed_head_sha: 0b78d3ae939ed92fbe3a7280b40a6ebcb4fed40e
fixed_head_sha: ca8c30c
status: blocked
summary: "Fixed CR-292 through CR-295, CR-297, CR-299, CR-301, and CR-302 with release YAML, exclusive receipt locks, gate and service compensation, terminal-run replacement, final-candidate push mode, Windows job ownership, and full-ref TUI changes. CR-296 remains blocked because step completion and HEAD checkpoint persistence still lack one database transaction; hosted release, provider, and platform lifecycle evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review examined `0b78d3a`; fixes are committed at `ca8c30c`; merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not staged.

## Finding Dispositions

### CR-292

- disposition: fixed
- evidence: Release workflow flow mappings are block mappings, so GitHub expressions parse as YAML values. `actionlint .github/workflows/safety-dance-release.yml` passes.
- files changed: `.github/workflows/safety-dance-release.yml`
- regression check: `actionlint .github/workflows/safety-dance-release.yml`; passed.

### CR-293

- disposition: fixed
- evidence: Both receive hooks now acquire the exact lock path with POSIX exclusive creation instead of moving a candidate directory into a possible existing lock. Stale numeric owners remain reclaimable; malformed owners remain held.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/git`; passed.

### CR-294

- disposition: fixed
- evidence: Wizard compensation journals custom gate relocation and restores the default location. Eject recursively removes a verified owned custom bare-gate target before removing the symlink.
- files changed: `tools/safety-dance/internal/cli/wizard.go`, `tools/safety-dance/internal/gate/gate.go`
- regression check: `cd tools/safety-dance && go test ./internal/gate ./internal/wizard`; passed.

### CR-295

- disposition: fixed
- evidence: Branch replacement reloads the prior durable row after joining its handle and supersedes it only while nonterminal. Completed rows remain history while replacement proceeds.
- files changed: `tools/safety-dance/internal/daemon/manager.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`; passed.

### CR-296

- disposition: blocked
- evidence: Recovery now resets an owned worktree to the last durable `HeadSHA` before replay, but `runs.head_sha` and successful step completion remain separate writes. A crash between those writes can still replay a modifying step.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`
- regression check: `cd tools/safety-dance && go test ./internal/worktrees`; passed.

### CR-297

- disposition: fixed
- evidence: Rewrite selection now runs in the pre-push callback against the final reviewed worktree HEAD, after candidate verification and immediately before publication.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/pipeline/steps`; passed.

### CR-298

- disposition: fixed
- evidence: Git publication uses the existing process-tree lifecycle helper, terminating transport descendants with the direct process on cancellation and ordinary exit.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/steps`; passed.

### CR-299

- disposition: fixed
- evidence: Windows managed servers are assigned to kill-on-close job objects. The job closes on every shutdown path, including health-check startup failure; non-Windows builds use a no-op attachment.
- files changed: `tools/safety-dance/internal/agent/server.go`, `tools/safety-dance/internal/agent/server_process_windows.go`, `tools/safety-dance/internal/agent/server_process_other.go`
- regression check: `GOOS=windows GOARCH=amd64 go test -c ./internal/agent`; passed; hosted descendant execution remains unavailable.

### CR-300

- disposition: fixed
- evidence: Admission persists the trusted default-branch revision as `ValidationGeneration`; execution rejects a changed trusted revision instead of merging a mutable later policy. The resolved gate payload remains durable in the accepted run.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/ipc/protocol.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/daemon`; passed.

### CR-301

- disposition: fixed
- evidence: TUI lookup uses the full symbolic ref and canonicalizes it before exact durable-run queries.
- files changed: `tools/safety-dance/internal/cli/tui.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli`; passed.

### CR-302

- disposition: fixed
- evidence: Failed service activation attempts platform cleanup, restores the prior definition or removes the owned one, removes the recovery journal, and joins activation and cleanup errors. Wizard compensation now returns service cleanup errors with the original failure.
- files changed: `tools/safety-dance/internal/daemon/service.go`, `tools/safety-dance/internal/wizard/setup.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon ./internal/wizard`; passed.

## Advisory Decisions

None.

## Verification

- command: `actionlint .github/workflows/safety-dance-release.yml && git diff --check`
- result: Passed.
- command: `cd tools/safety-dance && go test -race ./internal/git ./internal/daemon ./internal/cli ./internal/gate ./internal/pipeline ./internal/agent ./internal/worktrees ./internal/wizard && go vet ./...`
- result: Passed.
- command: `GOOS=windows GOARCH=amd64 go test -c ./internal/agent`
- result: Passed compilation; execution was unavailable on the host.
- command: `npm test`
- result: Passed 137 Node tests, identity validation, plugin synchronization, Go race tests, vet, binary build, and release-contract tests.
- command: `git diff --check`
- result: Passed.

## Remaining Blocks

- CR-296 still needs a database transaction that commits the resulting HEAD checkpoint and step completion together.
- Hosted Windows descendant lifecycle, hosted `safety-dance-v*` release execution, live provider behavior, and induced OS/process crash evidence remain unavailable.
