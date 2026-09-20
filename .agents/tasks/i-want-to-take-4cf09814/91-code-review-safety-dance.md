---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 41f123f1170fafc9ed134068b3a967e8e2fcd28f
status: findings
summary: "The 39,779-line Safety Dance product diff was reviewed at 41f123f against origin/main. Eight critical- or major-severity findings remain: accepted-push custody can disappear before durable run creation, response actions can bypass validation and lack generation and checkpoint binding, fork policy and pull-request authority are misrouted, manual runs bypass gate custody, shutdown can abandon work, and binary end-to-end coverage remains a help-only smoke test. The current npm test aggregate and focused race tests pass, so the next phase must fix these behavioral gaps and add regression proof."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `41f123f1170fafc9ed134068b3a967e8e2fcd28f`
- commits: 162 commits after the merge base; no pull request exists for `safety-dance`.
- staged and unstaged changes: none.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: task artifacts, Atomic run state, and retained verification evidence were excluded from product review.

## Previous Round

- previous artifact: `89-code-review-safety-dance.md`
- CR-308 Response application is not bound to the current parked prompt: still open
- CR-309 Trusted policy still uses remote configuration writable by validation work: still open
- CR-310 Production runs cannot enter the advertised prompt and fix lifecycle: still open
- CR-311 Daemon shutdown abandons active run contexts: still open
- CR-312 Normal run cleanup bypasses the process-reaping owner: fixed
- CR-313 Post-receive still performs durable replacement synchronously: still open
- CR-314 Service-backed stop reports failure after stopping the service: still open
- CR-315 The required aggregate is still intermittent: fixed
- CR-316 Production identity enforcement omits workflow contracts: fixed
- CR-317 The e2e target never drives the binary it builds: still open
- CR-318 Non-GitHub repositories cannot complete setup or publication: declined

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently brand and fully fold the referenced local Git gate into this repository.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; current implementation receipt `26-implementation-safety-dance.md`; verification artifact `16-verification-safety-dance.md` is pinned to the older revision `49c6c2d`.
- repository instructions: root `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed-file contracts enforced by `scripts/validate.mjs`.

## Change Profile

- intent and expected behavior: add the Safety Dance binary, authenticated local gate, durable branch-scoped validation, guarded publication, operator interfaces, canonical skill distribution, identity enforcement, and native releases.
- change description quality: commit subjects identify each repair area, but no pull request title or body exists. The latest fix receipt claims CR-308 through CR-317 fixed and narrows CR-318 to GitHub-only.
- implementation model and review model: implementation model was not recorded in the selected receipts; review used GPT-5.6 Sol plus four focused GPT-5.6 Sol implementation-review passes.
- changed-line size and logical cohesion: 232 product files, 39,779 insertions, and 4 deletions form one imported product but remain far above the plan's split-review signal.
- resulting large-file concerns: `internal/config/config.go` has 3,142 lines, `internal/scm/github/github.go` 1,490, `internal/agent/agent.go` 1,353, `internal/db/run.go` 1,148, and `internal/cli/daemon.go` 976. Response policy, daemon lifecycle, and repository authority still cross these owners.
- dependency or lockfile changes: the new Go module resolves 67 modules. `go mod verify` passed; the aggregate exercised the resolved graph, but no installed vulnerability scanner was available.

## Tests Reviewed First

- behavior claimed by tests: package and aggregate tests cover gate initialization, admission, durable runs, publication, services, runtime installation, identity, and release packaging. The current aggregate reports 137 passing Node tests plus the Safety Dance race, vet, build, identity, and release checks.
- missing or misleading coverage: no test covers duplicate responses to one prompt, restart-time `fix`, a crash between response consumption and checkpoint persistence, push-step overrides, accepted-receipt loss after asynchronous acknowledgement, shutdown racing `Resume`, fork policy and PR routing, `run` against a mismatched gate head, or a built-binary gate and operator flow.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5310` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 5310 in / 73 out`

### Correctness

- assessment and evidence: response recovery can advance after a `fix` without rerunning the failed step, skip can become review approval, push failures can be overridden, manual `run` accepts an unchecked working-tree HEAD, and fork PR routing targets the wrong repository. The public binary e2e test exercises only help output.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: the generic `Interactive` flag hides different policy for review, test, push, PR, and CI failures in one loop. The daemon file owns IPC, admission queueing, worktree creation, trusted-policy fetch, SCM selection, execution, cleanup, and shutdown, which allowed lifecycle and authority rules to diverge.
- helper coverage: covered, level 2, confidence 0.53

### Architecture

- assessment and evidence: Admission owns durable accepted receipts, but the daemon callback returns before persistence and lets Admission delete that receipt. Manager shutdown snapshots handles without closing `Resume`, while fork-aware gate and SCM owners are bypassed by direct `PushURL` construction.
- helper coverage: covered, level 3, confidence 0.89

### Security

- assessment and evidence: local peer authorization and nested-run rejection remain in place, but trusted policy is fetched from a configured fork when `ForkURL` exists, and the manual `run` path can introduce a commit that never passed authenticated gate admission.
- helper coverage: covered, level 3, confidence 0.60

### Performance

- assessment and evidence: the asynchronous callback removes durable replacement from the hook latency path, but it does so by discarding retry custody. Branch locks remain per repository and full ref; no separate unbounded query or hot-path allocation finding was confirmed.
- helper coverage: unavailable

## Verification Story

- command or inspection: `npm test`; `go test -race ./internal/db ./internal/pipeline ./internal/daemon ./internal/cli ./internal/e2e`; `go mod verify`; complete merge-base diff and the nine-file repair diff; `git diff --check` on product files.
- result: `npm test` passed with 137 Node tests and the Safety Dance aggregate. Focused race tests, module verification, and whitespace checks passed. These tests do not exercise the eight failure paths below.
- manual, screenshot, or before-and-after evidence: no new UI, hosted release, Windows lifecycle, live provider, or crash-injection evidence was produced.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-319 Prompt responses are not bound to a prompt generation

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/db/schema.go:224`
- failure mode: two responses accepted for one parked prompt can authorize two different rounds of the same step. The first response starts a fix; the delayed duplicate remains queued and is applied automatically when the same step parks again.
- evidence or reproduction: `responses` has a non-unique index on `(run_id, step, step_id, created_at)` and no generation column (`schema.go:224-234`). The response handler inserts whenever the shared step row is parked (`internal/cli/daemon.go:383-395`), and every fix round reuses that `step_id`. `ApplyResponse` selects the oldest matching row without a prompt generation (`internal/db/responses.go:77-85`).
- fix direction: increment a durable prompt generation each time a step parks, enforce one response per `(step_id, generation)`, and consume it with a compare-and-set against the current parked generation.

### CR-320 Interactive responses can bypass required validation and publication gates

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/runner.go:171`
- failure mode: after restart, a `fix` response advances to the next step without rerunning the failed callback. During a live run, `skip` or `approve` can turn any failing step, including review and push, into success; skipping review records the current HEAD as review-approved, and approving a failed push advances without a publication binding.
- evidence or reproduction: the recovery branch consumes every non-abort response and immediately `continue`s (`runner.go:171-196`), while `ActionFix` leaves the row in `fixing` (`internal/db/responses.go:84-98`). The active branch enables interaction for every core step (`internal/cli/daemon.go:840-841`), clears `err` for approve and skip (`runner.go:203-248`), then unconditionally calls `CompleteStepWithRunHead`, which rewrites skipped status to completed and records review authority (`runner.go:253-269`, `internal/db/step.go:411-433`).
- fix direction: define explicit response policy per gate; never permit push, custody, mirror, or binding failures to be approved or skipped; preserve skipped status; and make restart-time `fix` execute and revalidate the same step before advancing.

### CR-321 Response authority and HEAD checkpointing are split across transactions

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/runner.go:220`
- failure mode: a crash after consuming approve or skip but before recording the worktree HEAD leaves a completed step with a stale run checkpoint. Restart skips the step by fingerprint and can restore the stale HEAD, losing validated or repaired commits and leaving review authority incomplete.
- evidence or reproduction: the live path calls `ApplyResponse` with an empty checkpoint (`runner.go:220`); that transaction deletes the response and completes or skips the step (`internal/db/responses.go:100-130`). The runner resolves and stores HEAD later through `CompleteStepWithRunHead` (`runner.go:253-269`).
- fix direction: resolve the candidate checkpoint before response consumption and atomically consume the response, transition the expected prompt generation, persist the step result, update run HEAD, and record review authority.

### CR-322 Accepted push custody is deleted before a run is durable

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:287`
- failure mode: Git accepts the ref and the hook receives success, but a daemon crash, shutdown, or later `recordPush` error can leave no run and no retry record for that accepted commit.
- evidence or reproduction: the admission callback launches `recordPush` in an untracked goroutine and immediately returns nil (`daemon.go:287-295`). `notifyPush` treats that return as completion and deletes the persisted receipt (`internal/daemon/admission.go:421-447`), while `recordPush` has not yet created a worktree or run. The reconciliation loop can only retry receipts that still exist.
- fix direction: retain the accepted receipt until durable run or queue persistence succeeds. A fast hook acknowledgement needs a database-backed queue or receipt state whose worker completion, not goroutine launch, removes custody.

### CR-323 Fork policy and pull-request authority are routed to the fork

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/daemon.go:513`
- failure mode: when a fork is configured, its default branch supplies trusted commands and gates, and pull-request commands target the fork rather than the parent repository. A fork contribution can therefore use the wrong policy authority and cannot open the intended cross-repository pull request.
- evidence or reproduction: `Repo.PushURL()` selects `ForkURL` (`internal/db/repo.go:23-31`), and both trusted-policy fetches use that value (`daemon.go:505-547,739-776`). `newSCMHost` also constructs `github.New` from the push URL (`daemon.go:663-672`), although gate initialization states that origin remains the parent used for PRs (`internal/gate/gate.go:129-131`) and the existing `github.NewWithFork` owner is otherwise unused (`internal/scm/github/github.go:58-65`).
- fix direction: bind trusted policy and the SCM host to `UpstreamURL`; use `ForkURL` only for branch publication and construct the GitHub host with `NewWithFork` so the PR head names the fork owner.

### CR-324 Shutdown can hard-kill or miss newly registered work

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/manager.go:158`
- failure mode: shutdown can return while a resumed or replacement run still uses the database and worktree. On Windows, authenticated shutdown terminates the process before manager cancellation, process reaping, PID cleanup, or deferred database cleanup runs.
- evidence or reproduction: `Shutdown` takes one snapshot of `keys` (`manager.go:158-169`), `Resume` never checks `stopping` (`manager.go:172-207`), and `Replace` does not recheck after releasing the mutex to wait for a prior run (`manager.go:84-103`). The daemon keeps serving IPC until after `manager.Shutdown` (`internal/cli/daemon.go:498-501`). The Windows shutdown helper calls `TerminateProcess` after 100 ms instead of notifying the daemon's signal channel (`internal/cli/signal_windows.go:11-20`).
- fix direction: close admission and registration first, make `Resume` and every `Replace` relock reject stopping, wait through a bounded join, and have the shutdown RPC signal an internal channel on every platform rather than terminating the process.

### CR-325 The public `run` command bypasses gate-head custody

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/run.go:30`
- failure mode: a local checkout commit that never passed authenticated gate admission can enter validation and publication through `safety-dance run`.
- evidence or reproduction: the command sends the working checkout's branch and `HEAD` (`run.go:30-40`); the daemon creates a detached worktree directly from `repo.WorkingPath` and that caller-supplied SHA (`internal/cli/daemon.go:337-349`). It never checks the corresponding gate ref, despite the IPC contract requiring an exact gate branch head under the branch lock (`internal/ipc/protocol.go:95-107`).
- fix direction: resolve and compare the canonical gate ref while holding the branch lock, reject a mismatched requested SHA, and create the run worktree from the verified gate object.

### CR-326 The e2e target still does not exercise the shipped workflow

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/e2e/public_binary_test.go:12`
- failure mode: public init, daemon, generated hooks, authenticated push, status, respond, abort, publication, and restart wiring can break while every required aggregate check passes.
- evidence or reproduction: the only built-binary test runs `--help`, `daemon --help`, and `status --help` (`public_binary_test.go:12-21`). Gate and publication cases still call internal packages directly. `npm test` runs ordinary `go test -race ./...`, where the binary test skips because `SD_E2E_BINARY` is unset, and `test:safety-dance` never invokes `make e2e` (`package.json:20-21`).
- fix direction: make one temporary-repository test drive the built binary through init, daemon start, generated gate push, durable status/respond/abort, publication, and restart, then include `make e2e` in the aggregate.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: no separate task-caused orphan was confirmed. `github.NewWithFork` is implemented but bypassed by production host construction; CR-323 records the resulting functional gap.
- dependency findings: `go mod verify` passed for 67 modules, and the aggregate compiled and tested them. No lockfile inconsistency was found; vulnerability scanning remains unavailable.

## Verdict

- decision: request_changes
- overall code-health change: the latest repair closes identity scanning, Unix stop ordering, process sweeping, and the intermittent aggregate failure, but it introduces or leaves unsafe custody, response, fork, manual-run, shutdown, and verification paths.
- rationale: three critical and five major findings contradict authenticated admission, durable accepted-ref custody, required-gate enforcement, restart safety, and built-binary acceptance proof.

## Review Limits

- blocked or unavailable checks: hosted `safety-dance-v*` release execution, authorized live-provider behavior, Windows service execution, induced process-crash recovery, dependency vulnerability scanning, and pull-request title/body review were unavailable. The performance axis judgment returned `unclear`, so helper coverage for that axis was skipped and decided from the pinned diff.
- residual manual verification: after fixes, exercise prompt actions across restart, fork publication and cross-repository PR creation, Windows stop/restart, manual `run` gate mismatch, and the built-binary gate flow on supported platforms.
