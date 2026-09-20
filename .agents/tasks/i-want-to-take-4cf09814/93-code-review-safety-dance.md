---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: d0315b20b5a8a624c509f799d14ecc3d75fdb2ba
status: findings
summary: "The 39,852-line product diff was reviewed at d0315b2 against origin/main, including the c0107de repair round. Nine major findings remain: response authority is still stale or non-atomic, existing databases cannot migrate, accepted-push retries and notifications violate lifecycle guarantees, manual and enterprise-fork paths retain trust-boundary errors, and the built binary lacks the required end-to-end regression. The next fix round must repair these boundaries and add focused migration, concurrency, retry, and shipped-binary tests."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` against `origin/main`
- reviewed HEAD: `d0315b20b5a8a624c509f799d14ecc3d75fdb2ba`
- commits: 165 commits after the merge base; the latest product repair is `c0107de6166c2b1e576a82184f53c8f21c790512`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked evidence directories were context only, not review subjects

## Previous Round

- previous artifact: `91-code-review-safety-dance.md`
- CR-319 Prompt responses are not bound to a prompt generation: still open
- CR-320 Interactive responses can bypass required validation and publication gates: still open
- CR-321 Response authority and HEAD checkpointing are split across transactions: still open
- CR-322 Accepted push custody is deleted before a run is durable: fixed
- CR-323 Fork policy and pull-request authority are routed to the fork: still open
- CR-324 Shutdown can hard-kill or miss newly registered work: fixed
- CR-325 The public `run` command bypasses gate-head custody: still open
- CR-326 The e2e target still does not exercise the shipped workflow: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate as independently branded Safety Dance without source-product references outside the required license
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`
- repository instructions: root `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add the Safety Dance binary, authenticated local gate, durable branch-scoped runs, fixed validation pipeline, guarded publication, operator interfaces, skill distribution, identity checks, and binary releases
- change description quality: commit subjects identify implementation, verification, review, and repair rounds; no pull request exists, so there is no title or body to assess
- implementation model and review model: implementation model not recorded; review used GPT-5.6 Sol with fresh specialist passes from GPT-5.6 Sol and GPT-6 Astra
- changed-line size and logical cohesion: 232 product files, 39,848 additions and 4 deletions; the feature is one product, but its size warrants subsystem and lifecycle review rather than a single aggregate-green inference
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, and several agent adapters exceed 1,000 lines; no separate major finding is based on size alone
- dependency or lockfile changes: the new Go module and `go.sum` are product-local; focused and aggregate Go checks pass, and no dependency defect was found in this round

## Tests Reviewed First

- behavior claimed by tests: package tests cover gate setup, authenticated admission, durable runs, publication ordering, CLI units, service definitions, TUI views, skill installation, identity scanning, and release packaging; `make e2e` builds the binary and runs `internal/e2e`
- missing or misleading coverage: no test upgrades the preceding SQLite schema, exercises stale prompt identity, crashes between response application and policy validation, retries an accepted receipt after policy-fetch failure, races manual run creation with a newer gate head, covers enterprise fork PR heads, proves post-receive latency, or drives the built binary through init, daemon, generated hooks, publication, response, and restart

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5009` in / `73` out

### Correctness

- assessment and evidence: nine major defects remain in schema upgrade, prompt identity, response state transitions, receipt replay, branch replacement, fork PR routing, post-receive behavior, and shipped-binary acceptance. Focused race tests pass but do not cover these failure paths.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: the changed paths generally keep database, daemon, pipeline, gate, and SCM ownership explicit. The response path now splits one operator decision across `ApplyResponse`, later policy validation, and `CompleteStepWithRunHead`, which obscures the durable state transition and causes CR-328 and CR-329.
- helper coverage: covered, level 2, confidence 0.78

### Architecture

- assessment and evidence: the repository installer remains the sole skill-distribution owner, and publication stays in the pipeline owner. Admission acknowledgement now performs run construction synchronously, while manual gate validation occurs outside the manager's branch lock; those misplaced lifecycle boundaries cause CR-332 and CR-334.
- helper coverage: covered, level 3, confidence 0.66

### Security

- assessment and evidence: peer authentication, nested-run rejection, explicit push leases, file permissions, and upstream policy loading remain present. Stale prompt approval, post-commit action validation, and gate-head revalidation gaps still permit authority to attach to a different durable state than the operator or gate approved.
- helper coverage: covered, level 3, confidence 0.52

### Performance

- assessment and evidence: no new unbounded query or hot-loop defect was found. The post-receive IPC call can wait up to the 30-second client timeout and its server-side callback can wait without a bound for prior-run cancellation and policy fetches, so accepted pushes can stall at the user-visible boundary.
- helper coverage: covered, level 3, confidence 0.70

## Verification Story

- command or inspection: `go test -race ./internal/db ./internal/pipeline ./internal/daemon ./internal/cli ./internal/e2e`; prior verification and the repair receipt also record `go test -race ./...`, `make e2e`, and `npm test`
- result: the focused race-enabled command passed at reviewed HEAD; the recorded aggregate checks passed, but they do not exercise the nine failure paths below. A preceding-schema reproduction failed with `OperationalError: no such column: prompt_generation`.
- manual, screenshot, or before-and-after evidence: the earlier verification records a manual binary flow, but no durable automated test reproduces it. Hosted release, live provider, Windows service, and induced process-crash evidence remain unavailable.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-327 Prompt identity still does not reach response clients

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/ipc/protocol.go:200`
- failure mode: a delayed action displayed for prompt generation N can arrive after another actor starts generation N+1 and will be accepted as authority for N+1.
- evidence or reproduction: `RespondParams` carries neither step ID nor generation, CLI and TUI callers therefore cannot send one, and `RecordResponse` treats `Generation == 0` as a wildcard before binding the action to the current database generation at `internal/db/responses.go:38-41`.
- fix direction: expose step ID and prompt generation in status and prompt views, require both in `RespondParams`, and reject zero or mismatched identity transactionally.

### CR-328 Disallowed responses mutate durable state before rejection

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/runner.go:248`
- failure mode: `review/skip` is accepted by the daemon, committed as a skipped review, and only then rejected by `responseAllowed`. A crash in that interval leaves a reusable skipped review whose matching fingerprint advances the recovered pipeline.
- evidence or reproduction: the daemon only blocks approve or skip for push, pull-request, and CI at `internal/cli/daemon.go:372-376`; `ApplyResponse` commits skipped state at `internal/db/responses.go:104-125`; the runner checks policy afterward at lines 260-262 and reuses skipped results at lines 165-168.
- fix direction: validate the action against the step before recording or applying it, keep one policy owner, and add a restart regression for rejected review skip.

### CR-329 Live response completion samples and writes the checkpoint twice

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/runner.go:248`
- failure mode: an approved review or skipped gate is committed once by `ApplyResponse`, then the live path samples HEAD again and overwrites it through `CompleteStepWithRunHead`. Skip becomes completed, and a HEAD change between samples can become review-approved without another decision.
- evidence or reproduction: the live response loop exits at lines 275-280 and always reaches the second checkpoint at lines 286-300. `ApplyResponse` already commits status and review authority at `internal/db/responses.go:104-125`; `CompleteStepWithRunHead` repeats both writes at `internal/db/step.go:412-437`.
- fix direction: make successful response application final for that step and bypass normal completion, or perform validation, action, checkpoint, and final status in one transaction with one HEAD sample.

### CR-330 Existing databases fail before prompt-generation migrations run

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/db/schema.go:235`
- failure mode: restarting the new binary against a database created by the previous revision fails during startup, so existing durable runs and receipts are unavailable.
- evidence or reproduction: `db.Open` executes all of `schemaSQL` before `migrationStatements` at `internal/db/db.go:33-40`. The new index references `responses.prompt_generation` before the migration at `schema.go:244` adds it. Applying the current schema to a database initialized from 41f123f reproduced `OperationalError: no such column: prompt_generation`.
- fix direction: migrate the column first, reconcile legacy duplicate rows deliberately, create the unique index afterward, and add an upgrade test from the preceding schema.

### CR-331 Accepted receipt retries wedge on the first leftover worktree

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:623`
- failure mode: if worktree creation succeeds but trusted-policy loading fails, the accepted receipt remains for retry. Every retry targets the existing worktree, fails `git worktree add`, and removes the pending journal, leaving the accepted push permanently unable to create a run automatically.
- evidence or reproduction: `recordPush` creates the nonce-derived worktree before `pinGatesForAdmission` at lines 623-630. `CreateDetached` leaves its journal after successful creation, but a retry rewrites that journal and removes it when `git worktree add` fails because the directory exists at `internal/worktrees/ownership.go:59-78`.
- fix direction: detect and verify the existing journaled worktree on replay, preserve the journal until durable run ownership commits, and test a transient policy-fetch failure followed by successful reconciliation.

### CR-332 Manual run gate verification races with newer accepted heads

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:335`
- failure mode: a manual run can verify head A, then a newer push can advance the gate and start run B while the manual path creates a worktree and fetches policy. The stale manual request later enters `Manager.Replace`, cancels B, and installs A as the active run.
- evidence or reproduction: verification occurs at lines 335-339, while replacement does not acquire the per-branch lock until `internal/daemon/manager.go:65-67`; worktree and policy operations occur between those points at lines 340-351.
- fix direction: revalidate the gate ref inside the shared replacement critical section immediately before cancelling or persisting a replacement, and add a barrier-based race test.

### CR-333 Enterprise fork pull requests use the hostname as head owner

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:685`
- failure mode: a GitHub Enterprise fork receives `--head <host>:<branch>` instead of `--head <fork-owner>:<branch>`, so pull-request creation targets the wrong owner and fails.
- evidence or reproduction: `newSCMHost` passes `HostPrefixedSlug(fork)` to `NewWithFork`. Enterprise slugs are `host/owner/repo`, while `NewWithFork` calls `repoOwner`, which returns the first segment at `internal/scm/github/github.go:58-65,136-141`.
- fix direction: pass `github.RepoSlug(fork)` for fork ownership while retaining the host-prefixed upstream slug for `--repo`, then add GitHub Enterprise fork command assertions.

### CR-334 Accepted pushes block on complete run construction

- type: Potential issue
- severity: major
- category: Performance and scalability
- location: `tools/safety-dance/internal/cli/daemon.go:287`
- failure mode: post-receive waits on worktree creation, network policy fetch, prior-run cancellation and join, database writes, and ownership commit. A slow network or stuck prior run stalls the user's already-accepted `git push` until the 30-second client timeout, while server work may continue longer.
- evidence or reproduction: the admission callback now calls `recordPush` synchronously at lines 287-289; `recordPush` performs the full lifecycle at lines 614-639. The hook invokes `daemon notify-push` in a foreground subshell at `internal/git/hook.go:182-207`, and IPC uses a 30-second default call timeout.
- fix direction: acknowledge after durable queue or accepted-receipt persistence, process run construction in a managed worker, and remove the receipt only after durable run creation succeeds.

### CR-335 The shipped workflow still has no binary end-to-end regression

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `tools/safety-dance/internal/e2e/public_binary_test.go:12`
- failure mode: public init, daemon lifecycle, generated hooks, authenticated push, durable controls, publication, and restart can break while both `make e2e` and `npm test` pass.
- evidence or reproduction: the binary test runs only empty-state `status` and three help commands at lines 27-31. Other e2e tests call internal packages directly, and `package.json:21` runs `go test -race ./...` without `SD_E2E_BINARY`, so the binary test skips in the root aggregate.
- fix direction: add one temporary-repository journey driven through the built executable from init through authenticated gate push, durable status or response, publication, and daemon restart; include that target in the root aggregate.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none identified
- dependency findings: no critical or major dependency, lockfile, license, or generated-metadata issue found; hosted release execution remains unproven

## Verdict

- decision: request_changes
- overall code-health change: Safety Dance adds the intended product boundaries and broad regression coverage, but the latest repair still leaves durable-state, admission, and public-flow failures on required paths.
- rationale: nine major findings remain, including a reproduced upgrade failure and several authority or retry paths that aggregate-green tests do not exercise.

## Review Limits

- blocked or unavailable checks: no pull request title or body exists; hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence were unavailable. Axis coverage used `jev-1.13.0`, tokens `5009` in / `73` out.
- residual manual verification: confirm the first hosted release assets and checksums, one authorized live-provider run, and native service behavior on each supported platform after the local blockers are fixed.
