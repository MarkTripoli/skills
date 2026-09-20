---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 89a3311fa5f3057a71b6450bf61d8e84ab01df23
status: findings
summary: "The 52,763-line Safety Dance change was reviewed at 89a3311 against origin/main. The previous checkpoint fix is present, but response decisions and trusted policy remain insufficiently bound, lifecycle cleanup can leave duplicate or orphaned work, required operator and provider paths are incomplete, and the current root aggregate failed in executable hook admission. The next phase must close these major findings and re-run the complete pinned scope."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `89a3311fa5f3057a71b6450bf61d8e84ab01df23`
- commits: 159 commits after the merge base; no pull request exists for `safety-dance`.
- staged and unstaged changes: none.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: task artifacts, Atomic run state, and retained verification binaries were excluded from product review.

## Previous Round

- previous artifact: `87-code-review-safety-dance.md`
- CR-305 Custom gates still complete without an atomic HEAD checkpoint: fixed
- CR-306 Review responses expose authority before atomic step completion: still open
- CR-307 Trusted policy can come from a different remote than publication: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently branded, complete local Git gate behavior from the referenced repository.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; verification evidence from `16-verification-safety-dance.md` was pinned to the older revision `49c6c2d`, and the latest implementation receipt is `26-implementation-safety-dance.md`.
- repository instructions: root `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed-file contracts enforced by `scripts/validate.mjs`.

## Change Profile

- intent and expected behavior: add the Safety Dance binary, authenticated local gate, durable branch-scoped validation, guarded publication, operator interfaces, canonical skill distribution, identity enforcement, and native releases.
- change description quality: commit subjects identify repair areas, but no pull request title or body exists and the verification artifact predates the reviewed HEAD.
- implementation model and review model: implementation model was not recorded in the selected receipts; review used GPT-5.6 Sol with four focused GPT-5.6 Sol implementation-review passes.
- changed-line size and logical cohesion: 320 files, 52,763 insertions, and 4 deletions form one product import but exceed the plan's split-review signal.
- resulting large-file concerns: `internal/config/config.go`, `internal/cli/daemon.go`, `internal/scm/github/github.go`, and `internal/db/run.go` each exceed 1,000 lines and combine multiple policy or lifecycle responsibilities.
- dependency or lockfile changes: a new Go module and lockfile add Cobra, Bubble Tea, SQLite, Windows IPC, YAML, and supporting transitive dependencies; the aggregate exercised the resolved graph before failing in daemon e2e.

## Tests Reviewed First

- behavior claimed by tests: package tests cover gate setup, admission, durable runs, publication, services, installer adaptation, identity, release packaging, and internal e2e fixtures. The prior verification records 28 locally decidable acceptance items passing at `49c6c2d`.
- missing or misleading coverage: no production test drives the prompt/fix state machine; `make e2e` discards its built binary before running internal package tests; the production identity scan omits `workflows/`; and the current `npm test` run failed in `TestExecutableGateAdmission` despite three isolated reruns passing.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5359` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 5359 in / 73 out`

### Correctness

- assessment and evidence: custom and core step callbacks either complete or fail, so no production caller parks a prompt, while `ActionFix` is persisted as completion. Service stop ordering, daemon shutdown, synchronous post-receive work, provider refusal, and the current aggregate failure also contradict required operator behavior.
- helper coverage: covered, level 3, confidence 0.97

### Readability and Simplicity

- assessment and evidence: product names and package ownership are mostly explicit, but unreachable gate-state helpers and duplicated lifecycle paths obscure which executor owns prompts, fixes, shutdown, and cleanup. Several files exceed 1,000 lines and mix orchestration with policy.
- helper coverage: covered, level 2, confidence 0.53

### Architecture

- assessment and evidence: durable run, gate, worktree, pipeline, and publication packages exist, but the CLI daemon bypasses the prompt executor, removes worktrees without the process-reaping owner, and constructs only a GitHub SCM host despite the multi-provider SCM abstraction.
- helper coverage: covered, level 3, confidence 0.92

### Security

- assessment and evidence: admission authenticates local peers and publication checks reviewed heads, but trusted policy is fetched through a gate `origin` stored in shared Git config. A command running in a linked worktree can mutate that config before a later admission fetch.
- helper coverage: covered, level 2, confidence 0.76

### Performance

- assessment and evidence: branch locks are scoped per repository/ref and database operations are bounded. The synchronous post-receive callback can nevertheless hold a completed `git push` behind prior-run cancellation, worktree creation, policy fetch, and durable replacement.
- helper coverage: covered, level 2, confidence 0.56

## Verification Story

- command or inspection: `go test -race ./internal/pipeline ./internal/db ./internal/cli`; `npm test`; `go test -race -count=3 ./internal/daemon -run TestExecutableGateAdmission -v`; `git diff --check $(git merge-base origin/main HEAD)...HEAD -- . ':(exclude).agents/tasks/**'`.
- result: focused pipeline, database, and CLI tests passed. The current root aggregate failed because `TestExecutableGateAdmission` timed out waiting for asynchronous notification; the same test then passed three isolated race-enabled runs. Product diff whitespace checks passed.
- manual, screenshot, or before-and-after evidence: no new UI or hosted evidence was produced; hosted release, live provider, Windows lifecycle, and induced crash evidence remain unavailable.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-308 Response application is not bound to the current parked prompt

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/db/responses.go:67`
- failure mode: a duplicated or stale decision can complete a later incarnation of the same step or grant review authority after the step stopped being parked.
- evidence or reproduction: the IPC handler checks parked state and inserts in a separate transaction (`internal/cli/daemon.go:366-381`); the schema permits duplicate `(run_id, step)` rows (`internal/db/schema.go:224-230`); `ApplyResponse` consumes only the oldest row, updates by unguarded `stepID`, and never checks status, run ownership, or `RowsAffected` (`internal/db/responses.go:75-109`).
- fix direction: give each prompt a durable generation/nonce, enforce one live response per generation, and consume the response with compare-and-set updates that require the expected run, step, and parked status in the same transaction.

### CR-309 Trusted policy still uses remote configuration writable by validation work

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/daemon.go:491`
- failure mode: code running in one linked run worktree can change the gate's shared `origin`; a later admission or recovery then loads trusted policy from that substituted remote while publication still targets the persisted repository URL.
- evidence or reproduction: both trusted fetches name `origin` in the bare gate (`internal/cli/daemon.go:497-515,725-744`), and the repository documents that linked worktrees share the bare repository's local config (`internal/git/hook.go:399-418`). Publication separately uses `repo.PushURL()` (`internal/cli/daemon.go:798-807`).
- fix direction: fetch policy through the persisted publication URL or an immutable remote identity, and verify that policy authority and publication authority are identical before admission and execution.

### CR-310 Production runs cannot enter the advertised prompt and fix lifecycle

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/runner.go:168`
- failure mode: failed review or custom gates terminate the run instead of parking for `respond`, and a manually planted `fix` response is recorded as successful completion without executing repair.
- evidence or reproduction: the runner only consumes responses for an already parked row, but normal callbacks are always completed or failed at `runner.go:199-227`; `ParkStepForApproval` and `StartStepFixRound` have no production caller (`internal/db/step.go:181-249`). `ApplyResponse` maps every non-abort, non-skip action, including `fix`, to `completed` (`internal/db/responses.go:85-103`).
- fix direction: connect the production runner to one gate executor that parks failed actionable gates, performs fix rounds, revalidates, and atomically records the resulting checkpoint; add built-binary response tests for approve, fix, skip, abort, restart, and duplicate input.

### CR-311 Daemon shutdown abandons active run contexts

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:485`
- failure mode: stopping or restarting the daemon can leave validation descendants running; the next daemon then resumes the same durable record and can duplicate external work.
- evidence or reproduction: new runs detach from daemon lifetime with `context.WithCancel(context.Background())` (`internal/daemon/manager.go:112-127`), and shutdown closes IPC and returns without cancelling or joining manager handles (`internal/cli/daemon.go:485-488`). Unix subprocess cleanup depends on context cancellation.
- fix direction: give `Manager` a shutdown method that rejects new work, cancels every handle, waits for completion with a bounded policy, and only then releases daemon ownership and exits.

### CR-312 Normal run cleanup bypasses the process-reaping owner

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:267`
- failure mode: a daemonized or new-session descendant can survive run completion while its worktree is removed, leaving an unreachable process with a deleted working directory.
- evidence or reproduction: normal cleanup calls `worktrees.RemoveDetached` directly at `internal/cli/daemon.go:271-279`. `procreap.SweepRunWorktree` states every removal caller must sweep first (`internal/procreap/procreap.go:232-246`), but production search finds only repository eject invoking the sweep.
- fix direction: route every run-worktree removal, including startup recovery and normal completion, through one cleanup owner that sweeps descendants before removal and persists retryable cleanup state.

### CR-313 Post-receive still performs durable replacement synchronously

- type: Potential issue
- severity: major
- category: Performance and scalability
- location: `tools/safety-dance/internal/git/hook.go:182`
- failure mode: Git has accepted the ref, but the user's push remains blocked while the daemon creates a worktree, fetches policy, and waits for any prior same-branch run to cancel and join.
- evidence or reproduction: the hook's subshell invokes `daemon notify-push` without backgrounding at `internal/git/hook.go:187-206`; the notification callback synchronously calls `recordPush`, which reaches `Manager.Replace` (`internal/cli/daemon.go:542-616`), and replacement waits on the prior handle (`internal/daemon/manager.go:79-97`).
- fix direction: durably acknowledge the accepted receipt quickly, queue branch replacement inside the daemon, and let the hook exit after bounded authenticated delivery while reconciliation retains custody on failure.

### CR-314 Service-backed stop reports failure after stopping the service

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:162`
- failure mode: `safety-dance daemon stop` unloads or stops the installed service and then attempts IPC against the terminated daemon, returning `authenticated daemon shutdown failed`; stale PID state can remain.
- evidence or reproduction: `stopDaemon` calls `stopInstalledService` before checking the PID and calling `MethodShutdown` (`internal/cli/daemon.go:167-180`). `serveDaemon` does not remove its PID file on exit (`internal/cli/daemon.go:194-216,485-488`), and service tests do not exercise the CLI ordering.
- fix direction: choose one shutdown owner: request authenticated shutdown before service deactivation or treat confirmed service stop as terminal, then remove only the owned PID/socket state and test the public command on injected service managers.

### CR-315 The required aggregate is still intermittent

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/hook_e2e_test.go:121`
- failure mode: the repository's required `npm test` gate fails nondeterministically, so the change cannot produce a reliable merge signal.
- evidence or reproduction: at reviewed HEAD, `npm test` failed with `TestExecutableGateAdmission: timed out waiting for asynchronous notification`. Immediately afterward, `go test -race -count=3 ./internal/daemon -run TestExecutableGateAdmission -v` passed all three isolated runs, confirming load-sensitive behavior rather than a deterministic assertion.
- fix direction: instrument and synchronize the post-receive notification lifecycle instead of relying on the three-second poll; prove the repair with repeated full aggregate runs, not only isolated package retries.

### CR-316 Production identity enforcement omits workflow contracts

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `scripts/check-safety-dance-identity.mjs:17`
- failure mode: retired source identity can enter `workflows/delivery.md` or another shipped workflow file without failing CI.
- evidence or reproduction: the production `shippedRoots` list omits `workflows/` (`check-safety-dance-identity.mjs:17,30-47`), although this change modifies `workflows/delivery.md`. Fixture tests use a non-root scan, which traverses all temporary files and does not exercise the narrower production root list.
- fix direction: add the shipped workflow tree to the production roots and add a repository-layout fixture that proves a retired token in `workflows/delivery.md` fails.

### CR-317 The e2e target never drives the binary it builds

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/Makefile:15`
- failure mode: public argument wiring, generated hooks, authenticated IPC, daemon lifecycle, wizard behavior, and operator controls can regress while `make e2e` remains green.
- evidence or reproduction: `build` creates a binary in a temporary directory and deletes it when that recipe exits (`Makefile:3-4`); `e2e` then runs only `go test ./internal/e2e/...` (`Makefile:15-16`). The e2e package directly invokes internal runner, manager, and push functions (`internal/e2e/e2e_test.go:19-218`).
- fix direction: build once into a test-owned temporary path and execute the public binary through init, daemon, generated gate push, durable status/respond/abort, publication, and restart scenarios.

### CR-318 Non-GitHub repositories cannot complete setup or publication

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:649`
- failure mode: repositories detected as GitLab, Bitbucket, Azure DevOps, Forgejo, or Gitea are rejected before PR and CI stages, despite the imported provider model and setup-provider choice.
- evidence or reproduction: SCM detection defines six providers (`internal/scm/scm.go:22-31`), but the wizard rejects every value except `github` (`internal/cli/wizard.go:94-97`) and daemon construction refuses every non-GitHub provider (`internal/cli/daemon.go:649-658`).
- fix direction: connect the imported provider owners behind `scm.Host` with fixture-backed PR/CI tests, or narrow the documented and planned product contract explicitly before release.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: `ParkStepForApproval`, `StartStepFixRound`, and the awaiting/fix-review status model are not reached by the production pipeline; this is captured by CR-310.
- dependency findings: no lockfile inconsistency was found. Dependency execution reached the Go race suite, but the aggregate failed before vet, build, and release checks could complete in that run.

## Verdict

- decision: request_changes
- overall code-health change: the branch adds the intended product boundaries, but unresolved trust, lifecycle, operator, provider, and verification gaps keep it below the task's required safety level.
- rationale: eleven major findings remain, including two re-raised previous-round trust-boundary findings and one reproduced required-check failure.

## Review Limits

- blocked or unavailable checks: hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service and descendant lifecycle, induced process-crash recovery, and pull-request title/body review were unavailable.
- residual manual verification: rerun the built binary on Linux, macOS, and Windows after fixes; exercise every prompt action and non-GitHub provider fixture; run repeated full aggregates and the first hosted release.