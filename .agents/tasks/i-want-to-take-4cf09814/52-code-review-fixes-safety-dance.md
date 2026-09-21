---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 51-code-review-safety-dance.md
reviewed_head_sha: c608c1bb0ecad30ea501ab823d40923cf38ac557
fixed_head_sha: 4063549
status: complete
summary: "This repair pass closes CR-133 through CR-139: managed-hook authorization no longer trusts the environment marker, production stages receive the merged policy and typed validation owners, first-publication recovery releases an untouched missing-ref claim, Windows process authentication and shutdown compile, worktree lifecycle journals survive crashes, completed steps bind trusted inputs, and global policy reaches execution. The Safety Dance aggregate and root npm test pass; hosted release, live provider, and real Windows runtime evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The reviewed head was `c608c1b`; fixes landed at `4063549`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not modified.

## Finding Dispositions

### CR-133

- disposition: fixed
- evidence: Managed-hook admission now ignores `SD_MANAGED_HOOK` as authorization evidence and requires process ancestry containing both the installed hook executable and Git's receive process. Forged-marker and valid-chain tests cover the boundary.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/admission_test.go`, `tools/safety-dance/internal/daemon/processinfo_unix.go`, `tools/safety-dance/internal/daemon/processinfo_windows.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon ./internal/git`

### CR-134

- disposition: fixed
- evidence: `executeRun` now passes the complete merged configuration. Intent, rebase, review, pull-request, and CI use the typed validation owner; shell commands remain limited to configured test, lint, and document checks. A production-path test rejects self-certifying review commands.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/pipeline/steps/{validation,ci,intent,pr,rebase,review}.go`, `tools/safety-dance/internal/pipeline/steps/validation_test.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline ./internal/pipeline/steps ./internal/cli`

### CR-135

- disposition: fixed
- evidence: Interrupted publication reconciliation now releases `push_active` when the live upstream ref still equals the empty verified pre-push head, allowing an absent first publication to retry. A temporary bare-remote test covers this recovery and verifies the candidate is published.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`, `tools/safety-dance/internal/pipeline/steps/push_test.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline/steps -run 'Publish|InterruptedFirstPublication'`

### CR-136

- disposition: fixed
- evidence: Windows process ancestry uses Toolhelp snapshots, Windows peer environment inspection reads the process environment, mutation authorization no longer rejects Windows, and shutdown uses delayed process termination instead of `os.Interrupt`. The Windows daemon package and command cross-compile.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/processenv_windows.go`, `tools/safety-dance/internal/daemon/processinfo_windows.go`, `tools/safety-dance/internal/cli/signal_windows.go`
- regression check: `cd tools/safety-dance && GOOS=windows GOARCH=amd64 go test -c ./internal/daemon -o /tmp/safety-dance-daemon.test.exe && GOOS=windows GOARCH=amd64 go build ./cmd/safety-dance`

### CR-137

- disposition: fixed
- evidence: Worktree creation retains a pending journal until database ownership commits, cleanup writes a removing journal before deletion, startup retries both pending and removing journals, and terminal cleanup reports removal failures. Owned paths are protected during pending recovery.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`, `tools/safety-dance/internal/worktrees/ownership_durability_test.go`, `tools/safety-dance/internal/daemon/manager.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/worktrees ./internal/daemon ./internal/e2e`

### CR-138

- disposition: fixed
- evidence: Step results persist an input fingerprint covering candidate head, trusted policy, command, owner, and validation generation. Completed or skipped results are reused only when the fingerprint matches; mismatches reset the step and dependent later steps. Focused tests cover invalidation.
- files changed: `tools/safety-dance/internal/db/schema.go`, `tools/safety-dance/internal/db/step.go`, `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/pipeline/runner_test.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/db ./internal/pipeline`

### CR-139

- disposition: fixed
- evidence: The production runner receives the complete merged `config.Config`, including global agent selection, agent paths and arguments, profiles, trusted policy, provider settings, and replay configuration. Typed validation construction consumes the merged agent and profile policy instead of a repository-only projection.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/pipeline/steps/validation.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/config ./internal/pipeline/steps`

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: `go mod tidy` remains deferred until the imported typed owners and provider paths settle; removing currently unreachable requirements prematurely could delete dependencies needed by the intended production integrations.

## Verification

- command: `npm run test:safety-dance`
- result: Passed identity scanning, the full Go race suite, `go vet`, temporary binary build, and release-contract tests.
- command: `npm test`
- result: Passed validation, plugin synchronization, 136 Node tests, and the Safety Dance aggregate.
- command: `cd tools/safety-dance && go test ./internal/pipeline/steps -run 'Publish|InterruptedFirstPublication'`
- result: Passed publication continuity and first-publication recovery tests.
- command: `cd tools/safety-dance && GOOS=windows GOARCH=amd64 go test -c ./internal/daemon -o /tmp/safety-dance-daemon.test.exe && GOOS=windows GOARCH=amd64 go build ./cmd/safety-dance`
- result: Passed cross-compilation; the generated source-tree Windows binary was removed after verification.
- command: `git diff --check`
- result: Passed before the code commit.

## Remaining Blocks

- None for the reviewed critical or major findings.

Hosted `safety-dance-v*` release execution, live provider behavior, and Windows runtime-session evidence remain unavailable without hosted runs, credentials, or a Windows host.
