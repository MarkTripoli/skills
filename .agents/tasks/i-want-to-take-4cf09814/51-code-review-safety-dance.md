---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: c608c1bb0ecad30ea501ab823d40923cf38ac557
status: findings
summary: "The complete 94-commit Safety Dance diff was reviewed at c608c1b against origin/main. Seven major findings remain across hook authorization, production validation ownership, first-publication recovery, Windows support, worktree durability, step replay, and global policy routing; the next fix round must close them before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `c608c1bb0ecad30ea501ab823d40923cf38ac557`
- commits: 94 commits in `origin/main..HEAD`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two task-owned untracked evidence directories

## Previous Round

- previous artifact: `49-code-review-safety-dance.md`
- CR-124 Managed-hook ancestry remains forgeable: still open
- CR-125 Production validation owners remain disconnected: still open
- CR-126 Pre-push interruption leaves publication permanently claimed: still open
- CR-127 The Windows release target does not build or authorize mutations: still open
- CR-128 Worktree creation is not crash-durable: still open
- CR-129 Completed-step reuse ignores candidate and policy inputs: still open
- CR-130 Global execution configuration is discarded: still open
- CR-131 Daemon stop bypasses the installed service owner: fixed
- CR-132 Identity checks do not preserve the required copyright notice: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced local Git gate without product references under the Safety Dance identity
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`
- repository instructions: root and worktree `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add a branded local Git gate with authenticated admission, durable branch-scoped runs, fixed typed validation, guarded publication, operator interfaces, skill distribution, identity checks, and native releases
- change description quality: no pull request exists; commit subjects pass the repository check, but there is no pull-request title or body to review
- implementation model and review model: implementation model is not recorded in the selected implementation receipt; review model is GPT-5.6 Sol
- changed-line size and logical cohesion: 269 files, 43,574 additions, and 4 deletions; the product, skill, tests, documentation, and task history form one feature, but the product change is far beyond the repository's split signal
- resulting large-file concerns: `internal/config/config.go` is 3,140 lines and several imported agent, database, Git, and provider files exceed 1,000 lines; the disconnected production owners in CR-134 make this size harder to justify
- dependency or lockfile changes: a new Go module and lockfile were added; `go mod tidy -diff` reports unused direct and indirect dependencies, recorded as ADV-001

## Tests Reviewed First

- behavior claimed by tests: gate setup and hooks, daemon coordination, publication ordering, operator commands, identity, installer distribution, release packaging, race checks, and local end-to-end flows
- missing or misleading coverage: no test proves an environment marker cannot impersonate a managed hook, first-publication recovery from `push_active`, Windows mutation and shutdown behavior, worktree journal handoff into durable ownership, policy-bound completed-step reuse, or production use of typed agent/provider owners

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4817` in / `73` out

### Correctness

- assessment and evidence: the aggregate passes, but a first publication interrupted after acquiring `push_active` cannot release the claim because `Publish` requires a non-empty verified head at `internal/pipeline/steps/push.go:103-117`. Windows daemon shutdown calls `os.Process.Signal(os.Interrupt)` at `internal/cli/signal_windows.go:7-12`, which Go does not implement on Windows. Worktree creation removes its pending marker before `Manager.Replace` persists ownership at `internal/worktrees/ownership.go:38-53` and `internal/cli/daemon.go:259-268,393-401`.
- helper coverage: covered, level 3, confidence 0.97

### Readability and Simplicity

- assessment and evidence: production execution is split between thousands of lines of imported agent/provider code and a separate eight-line shell-command dispatcher. `internal/cli/daemon.go:493-539` and `internal/pipeline/steps/validation.go:47-78` hide that the typed owners are not used, while `internal/pipeline/runner.go:83-84` reduces replay validity to one status check.
- helper coverage: covered, level 3, confidence 0.64

### Architecture

- assessment and evidence: `internal/cli/daemon.go:468-474` computes the full merged configuration but copies only `Commands` into a `RepoConfig`. The runner then dispatches all named gates to `sh -c` instead of the imported agent, SCM, response, and CI owners. Completed step rows have no candidate, policy, command, owner, or validation-generation binding before they are reused.
- helper coverage: covered, level 3, confidence 0.91

### Security

- assessment and evidence: `managedHookPeer` accepts `SD_MANAGED_HOOK=<expected path>` from any inspected same-user process environment at `internal/daemon/admission.go:123-150`; the hook itself sets that forgeable marker at `internal/git/hook.go:60-63`. Windows mutations are rejected rather than authenticated at `internal/daemon/admission.go:181-212`, despite the release matrix shipping Windows.
- helper coverage: covered, level 3, confidence 0.82

### Performance

- assessment and evidence: no blocking performance defect was found in the reviewed execution paths. Branch coordination bounds active work by repository and ref, IPC calls are local, and the new pending-worktree scan is bounded by the runtime worktree directory; unused dependencies add build and maintenance cost rather than a demonstrated runtime hot-path failure.
- helper coverage: covered, level 3, confidence 0.86

## Verification Story

- command or inspection: `npm test`; focused Go tests for daemon, pipeline, steps, worktrees, and CLI; Windows cross-build to a temporary output; `git diff --check`; `go mod tidy -diff`
- result: `npm test` passed 136 Node tests, the full Go race suite, vet, identity checks, temporary binary build, and 2 release tests. Focused tests and the Windows cross-build passed. `git diff --check` passed. `go mod tidy -diff` exited 1 and proposed removing unused dependencies.
- manual, screenshot, or before-and-after evidence: no pull request, hosted release, live provider run, or Windows runtime session exists; verification artifact 16 records the prior local operator flow and its limits

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-133 Managed-hook authorization trusts a forgeable environment marker

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:123-150`
- failure mode: any same-user process can set `SD_MANAGED_HOOK` to the expected hook path, invoke the hidden token command, and satisfy `managedHookPeer` without running as the installed receive hook under Git.
- evidence or reproduction: the classifier accepts `strings.Contains(env, "SD_MANAGED_HOOK="+hook)` and never proves that the marked hook executable or a Git receive process appears in the authenticated ancestry. The generated hook merely supplies the same environment value at `internal/git/hook.go:60-63`.
- fix direction: authenticate the actual managed hook executable and Git receive ancestry from OS process metadata on every supported platform. Do not treat caller-controlled environment text as proof.

### CR-134 Production validation bypasses the imported typed owners

- type: Refactor suggestion
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:493-539`
- failure mode: intent, review, pull-request, and CI gates can publish after arbitrary configured shell commands exit zero without producing or validating the typed findings, verdicts, provider state, retries, or responses required by the plan.
- evidence or reproduction: every non-push core step calls a thin `steps.*` wrapper, and `internal/pipeline/steps/validation.go:47-78` maps each wrapper to `sh -c`. The imported agent, SCM/provider, retry, response, and CI implementations are not constructed on this production path.
- fix direction: route each named production stage through its responsible typed owner, persist its typed result, and retain shell commands only for the repository-command checks they actually own. Add production-path tests that fail if a placeholder command self-certifies review, PR, or CI.

### CR-135 A first-publication crash leaves the push claim stuck

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/pipeline/steps/push.go:103-117`
- failure mode: if the daemon dies after setting `push_active` but before pushing a branch that does not yet exist upstream, restart sees both the live and verified heads as empty and refuses to release the claim. The run cannot retry or publish.
- evidence or reproduction: the recovery branch releases an interrupted claim only when `VerifiedHead` is non-empty and non-zero. The tests in `internal/pipeline/steps/push_test.go:54-107` cover an existing base and a completed binding, not an active first publication with an absent upstream ref.
- fix direction: persist enough pre-push phase and upstream-absence evidence to distinguish an untouched missing ref from divergence, safely release that claim, and add a crash-recovery test for the first publication of a branch.

### CR-136 The advertised Windows runtime cannot mutate or stop the daemon

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/admission.go:181-212`
- failure mode: every Windows start, respond, abort, and shutdown IPC mutation is rejected, and the shutdown handler's replacement signal does not terminate the process. The release workflow still publishes a Windows archive.
- evidence or reproduction: `AuthorizeMutationPeer` returns `unsupported or unauthenticated IPC peer` whenever `runtime.GOOS == "windows"`. `internal/cli/signal_windows.go:7-12` calls `Process.Signal(os.Interrupt)`, while Go's Windows implementation does not support Interrupt. `.github/workflows/safety-dance-release.yml:13-17` includes `windows/amd64`; a cross-build only proves compilation.
- fix direction: implement authenticated Windows process ancestry and a working daemon termination mechanism, with a Windows runtime test, or remove Windows from the supported release and documentation contract.

### CR-137 Worktree ownership is not durable across creation and removal

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/worktrees/ownership.go:17-86`
- failure mode: a crash after `CreateDetached` removes its marker but before `Manager.Replace` persists the run leaves an unowned Git worktree. Cleanup has no durable removing state, ignores removal failure, and startup recovery only resumes pending/running runs, so terminal leftovers can remain indefinitely.
- evidence or reproduction: the marker is deleted at lines 50-51 before callers persist ownership at `internal/cli/daemon.go:263-268,397-401`. Terminal cleanup ignores `RemoveDetached` errors at `internal/cli/daemon.go:207-213`; `internal/daemon/manager.go:113-147` recovers only pending and running runs. No test references `RecoverPending` or the pending marker.
- fix direction: keep a durable creating record through database ownership commit, add a durable removing state, retry both states at startup, and test crashes at each boundary plus cleanup failure.

### CR-138 Completed steps are reused without binding their trusted inputs

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/runner.go:65-85`
- failure mode: restart skips a completed review, test, or other gate even when the candidate head, trusted policy, command, owner, or validation generation has changed. Publication can rely on evidence produced for different inputs.
- evidence or reproduction: reuse checks only `StepStatusCompleted` or `StepStatusSkipped`; the test at `internal/pipeline/runner_test.go:49-78` asserts status-only reuse and records no input fingerprint.
- fix direction: persist and compare a fingerprint of every safety-relevant step input before reuse. Invalidate the step and all dependent later steps when any input differs.

### CR-139 Global execution and provider policy is discarded

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:468-474`
- failure mode: machine-level agent selection, model and argument policy, provider profiles, timeouts, review roles, worktree roots, and related settings parse successfully but do not control production runs. Operators receive behavior different from their accepted configuration.
- evidence or reproduction: `config.Merge` returns the full resolved `Config`, but production copies only `mergedConfig.Commands` back into `effectiveConfig`. The step context accepts only `*RepoConfig`, and validation reads only commands at `internal/pipeline/steps/validation.go:23-25,47-70`.
- fix direction: pass the complete resolved configuration to the responsible production owners and prove global agent, provider, timeout, review-role, publication, and worktree settings affect execution without allowing pushed policy to override trusted values.

## Advisories

### ADV-001 The Go module retains unused dependencies

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `tools/safety-dance/go.mod:5-47`
- evidence: `go mod tidy -diff` proposes removing unused direct Bubble Tea, Bubbles, Lip Gloss, Termenv, TOON, and related indirect modules, and updates the selected `x/sys` version. This matches the disconnected imported implementation in CR-134.
- suggestion: after production owner wiring is settled, run `go mod tidy`, review the resulting module and notice changes, and keep only dependencies reachable from the shipped product and its tests.

## Dead Code and Dependency Review

- newly orphaned code: much of the imported typed agent, provider, response, and CI implementation is disconnected from the shipped pipeline; CR-134 records the required production wiring rather than recommending uncertain deletion
- dependency findings: `go mod tidy -diff` reports unused module requirements; ADV-001 records the non-blocking cleanup

## Verdict

- decision: request_changes
- overall code-health change: the branch adds the intended product shape and extensive checks, but the shipped trust, durability, replay, and platform boundaries do not yet satisfy the plan
- rationale: seven major findings can admit unauthorized gate calls, self-certify validation, strand publication and worktrees after crashes, ship a nonfunctional Windows mutation path, or reuse evidence under changed policy

## Review Limits

- blocked or unavailable checks: no pull request metadata, hosted `safety-dance-v*` run, authorized live-provider run, or Windows runtime host was available
- residual manual verification: after fixes, exercise managed-hook ancestry attacks, first-publication restart, worktree crash boundaries, typed provider stages, global policy overrides, and Windows start/respond/abort/stop on their real platforms
