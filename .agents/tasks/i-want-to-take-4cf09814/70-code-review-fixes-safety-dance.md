---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 69-code-review-safety-dance.md
reviewed_head_sha: 0b9551cc05443b8aa2b2c64f28800ae0c736932b
fixed_head_sha: 59e09483b03e1d2acfee38c9b495be456fb6c7c6
status: complete
summary: "CR-226 through CR-230 are fixed in the daemon, wizard, run-custody, custom-gate, and receive-hook paths. Cancelled publication recovery now performs only reconciliation and cleanup, wizard rollback never ejects an untouched gate, gate policy is pinned before run execution, custom gates inherit nested-run isolation, and multi-ref receipt custody is locked and revoked on partial rejection. Focused Go race tests, vet, and the full npm aggregate passed; hosted release, provider, Windows execution, and concurrent-hook runtime evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review used base `4458fbf21e199dad45376b8164f78c2165ac1d20` and head `0b9551cc05443b8aa2b2c64f28800ae0c736932b`; the fixes are committed at `59e09483b03e1d2acfee38c9b495be456fb6c7c6` on the same branch and base.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` directories were not staged or changed.

## Finding Dispositions

### CR-226

- disposition: fixed
- evidence: Restarted cancelled runs with `push_active` enter `recoverCancelledPublication`, which performs remote verification, gate-mirror update, durable binding, and claim clearing without running pull-request or CI steps. The daemon callback treats the original cancelled publication owner as cleanup-eligible and removes its worktree without reopening the terminal run.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/pipeline/... ./internal/e2e/...`; `npm test`

### CR-227

- disposition: fixed
- evidence: Wizard compensation now invokes a gate rollback only when `InitWithRollback` returned a mutation handle. It no longer falls back to `gate.Eject` when initialization failed before mutating an existing gate.
- files changed: `tools/safety-dance/internal/cli/wizard.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/wizard ./internal/gate`

### CR-228

- disposition: fixed
- evidence: Admission resolves the effective trusted gate list and stores it in `runs.gates_json` in the same transaction that creates the run. Empty policy is represented by `[]`; execution rejects legacy unpinned rows instead of resolving policy from current configuration.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/db/runs.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/db ./internal/daemon ./internal/pipeline/...`; `npm test`

### CR-229

- disposition: fixed
- evidence: Custom gate subprocesses now receive `SD_PARENT_RUN_ID` and the platform shell configuration used by repository validation commands. Nested mutation attempts therefore fail through both CLI and daemon authorization paths.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/daemon ./internal/pipeline/...`

### CR-230

- disposition: fixed
- evidence: Receive hooks append receipts only after admission succeeds, revoke every receipt accumulated before a later ref rejection, and serialize receipt append/removal with an atomic directory lock and unique temporary files. Post-receive receipt consumption uses the same lock and unique replacement path.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/git ./internal/daemon`; `npm test`

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./internal/cli ./internal/db ./internal/git ./internal/daemon ./internal/pipeline/... ./internal/e2e/...`
- result: Passed.
- command: `cd tools/safety-dance && go vet ./...`
- result: Passed with no diagnostics.
- command: `git diff --check`
- result: Passed with no whitespace errors.
- command: `npm test`
- result: Passed validation, plugin sync, 136 Node tests, identity checks, full Go race/vet/build aggregate, and release-contract tests.

## Remaining Blocks

- Hosted Windows service execution, live provider behavior, hosted `safety-dance-v*` release execution, and concurrent receive-hook runtime evidence remain unavailable in this environment.
