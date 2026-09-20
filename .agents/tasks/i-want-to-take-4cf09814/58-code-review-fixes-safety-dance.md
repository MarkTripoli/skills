---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 57-code-review-safety-dance.md
reviewed_head_sha: dcbe68f259b8cfbbab118a5a05dc410f38ca5f1e
fixed_head_sha: 758af0c
status: complete
summary: "CR-155 through CR-166 were addressed in the Safety Dance runtime. Agent resolution now selects an available owner and review fallback, pull-request and CI steps require provider-backed operations, cancellation and duplicate notification recovery are run-specific, configured worktree roots are honored, rollback preserves orphan gates and symlink hooks, Windows environment and service paths are corrected, the wizard preserves prompt order, and the hook banner uses Safety Dance identity. Focused Go tests, Windows cross-compilation, identity checks, and the Safety Dance aggregate passed; hosted Windows execution, live provider behavior, and hosted release evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review examined `dcbe68f`; this repair advances the worktree with uncommitted fixes. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` directories were not staged or changed.

## Finding Dispositions

### CR-155

- disposition: fixed
- evidence: `executeRun` calls `Config.ResolveAgent` before pipeline registration, so default `auto` resolves to an available harness and preserves the resolved fallback list.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./...`

### CR-156

- disposition: fixed
- evidence: Pull-request creation and CI now require an SCM owner, check provider availability, create or find a PR, persist its URL, and derive CI success from observed PR state and passing checks. A typed `pass` cannot self-certify either stage.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/pipeline/steps/{validation,pr,ci}.go`
- regression check: `cd tools/safety-dance && go test -race ./... && go vet ./...`

### CR-157

- disposition: fixed
- evidence: Cancellation captures the requested run and only cancels the active handle when its run ID still matches, preventing a replacement on the same branch from being cancelled.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/manager.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli`

### CR-158

- disposition: fixed
- evidence: A duplicate launch nonce resumes an existing pending or running row when no live handle exists instead of acknowledging it as already started without an executor.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/manager.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli`

### CR-159

- disposition: fixed
- evidence: Nested-run and managed-hook markers are detected from both byte-string environments and Windows UTF-16LE environment blocks.
- files changed: `tools/safety-dance/internal/daemon/envmarker.go`, `tools/safety-dance/internal/daemon/admission.go`
- regression check: `GOOS=windows GOARCH=amd64 go test -c ./internal/daemon`

### CR-160

- disposition: fixed
- evidence: New run creation loads global worktree configuration, validates the selected checkout, resolves one `worktrees.Layout`, and records the configured path. Accepted-push recovery uses the same layout.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/worktrees`

### CR-161

- disposition: fixed
- evidence: Initialization records whether the deterministic bare gate existed before the attempt and removes the directory only when this attempt created it; existing orphan refs and files survive rollback.
- files changed: `tools/safety-dance/internal/gate/gate.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/gate`

### CR-162

- disposition: fixed
- evidence: Gate snapshots use `Lstat`, preserve symlink targets, restore links rather than followed bytes, and retain modes and absence state.
- files changed: `tools/safety-dance/internal/gate/gate.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/gate`

### CR-163

- disposition: fixed
- evidence: Wizard labels are rendered and read in the supplied order, including `upstream` before `commands`; command parsing no longer consumes input during label construction.
- files changed: `tools/safety-dance/internal/wizard/setup.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/wizard`

### CR-164

- disposition: fixed
- evidence: Windows scheduled-task command construction no longer emits literal backslash-escaped quotes around the executable.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `GOOS=windows GOARCH=amd64 go test -c ./internal/daemon`

### CR-165

- disposition: fixed
- evidence: The post-receive banner now renders Safety Dance text and the hook regression test asserts the branded banner token; the retired rendered name is gone from the shipped hook.
- files changed: `tools/safety-dance/internal/git/hook.go`, `tools/safety-dance/internal/git/hook_test.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/git && node scripts/check-safety-dance-identity.mjs`

### CR-166

- disposition: fixed
- evidence: Review uses the configured reviewer role when present and typed execution traverses the resolved fallback agent list, retrying construction or execution failures with the next owner.
- files changed: `tools/safety-dance/internal/pipeline/steps/validation.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/steps ./internal/cli`

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./... && go vet ./...`
- result: Passed.
- command: `GOOS=windows GOARCH=amd64 go test -c -o <temp> ./internal/daemon ./internal/cli ./internal/git`
- result: Passed; Windows test binaries cross-compiled.
- command: `npm run test:safety-dance`
- result: Passed identity scan, Go race suite, vet, temporary build, and release-contract tests.
- command: `git diff --check`
- result: Passed.

## Remaining Blocks

- Hosted Windows hook and scheduled-task execution, live provider-backed PR/CI behavior, hosted `safety-dance-v*` release execution, and the follow-up clean code review remain unavailable or pending.
