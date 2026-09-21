---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: ba710021eadf4079ec870cf2a8c39c05c533bd59
status: findings
summary: "The complete 91-commit Safety Dance diff was reviewed at ba71002 against origin/main. Nine major findings remain across admission trust, validation ownership, restart recovery, Windows release support, worktree durability, policy-bound step reuse, global configuration, service shutdown, and legal-notice enforcement; the next fix round must close them before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `ba710021eadf4079ec870cf2a8c39c05c533bd59`
- commits: 91 commits from `2aa346a` through `ba71002`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked task-runtime directories

## Previous Round

- previous artifact: `47-code-review-safety-dance.md`
- CR-112 Nested descendants can still bypass mutation authorization: still open
- CR-113 Production validation and operator response owners remain disconnected: still open
- CR-114 Interrupted publication cannot reconcile after restart: still open
- CR-115 Windows releases ship a gate that rejects every mutation: still open
- CR-116 The setup wizard cannot accept or apply its advertised choices: fixed
- CR-117 Daemon stop and restart can signal an unrelated process: fixed
- CR-118 Worktree ownership is not crash-durable: still open
- CR-119 One branch replacement blocks admission for every branch: fixed
- CR-120 Restart reuses validation completed under different inputs: still open
- CR-121 TUI mutations can target another branch's run: fixed
- CR-122 Cross-platform release packaging executes a foreign notice binary: fixed
- CR-123 Global configuration is not applied to runs: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced local Git gate as a fully independent, renamed product
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and changed-file conventions enforced by `scripts/validate.mjs`

## Change Profile

- intent and expected behavior: ship Safety Dance as an authenticated local Git gate with durable branch runs, fixed validation, guarded publication, operator interfaces, runtime skill distribution, and checksummed releases
- change description quality: commit subjects identify phased implementation and repair work; no pull request exists, so no title or body could be reviewed
- implementation model and review model: implementation model not recorded in the selected implementation artifact; review model `GPT-5.6 Sol`, with four `agent-implementation-reviewer` slice reviews
- changed-line size and logical cohesion: 214 shipped files add 36,377 lines and delete 4; the six planned phases are logically related but the combined scope exceeds a single-review-sized change
- resulting large-file concerns: `internal/config/config.go` is 3,140 lines, and the tool contains 35,639 Go lines; disconnected imported subsystems make ownership difficult to verify
- dependency or lockfile changes: new Go module and sums; `go mod tidy -diff` reports unused direct dependencies and a materially smaller module graph

## Tests Reviewed First

- behavior claimed by tests: the saved verification records 136 passing Node tests, Go race/vet/build checks, local end-to-end publication, runtime distribution, identity scanning, and release-contract checks at `49c6c2d`; current focused native tests and `npm run test:safety-dance` pass at `ba71002`
- missing or misleading coverage: no test cross-builds the Windows command, the release test omits its Windows matrix entry, the identity fixture omits the required copyright line, and no production-path test proves typed agent/provider execution or input-bound restart reuse

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5158` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 5158 in / 73 out`

### Correctness

- assessment and evidence: native checks pass, but production pull-request validation always resolves an empty command, pre-push crash recovery remains stuck, completed steps are reused without input provenance, installed-service stop bypasses the service owner, and the Windows release target does not compile. See CR-125 through CR-131.
- helper coverage: covered, level 3, confidence 0.97

### Readability and Simplicity

- assessment and evidence: the active daemon path is direct enough to trace, but it routes all named stages through one shell-command adapter while retaining thousands of lines of typed agent and provider machinery. The 3,140-line configuration file and duplicated dormant ownership concepts make the shipped behavior harder to establish.
- helper coverage: covered, level 2, confidence 0.58

### Architecture

- assessment and evidence: CLI orchestration owns validation, publication, service shutdown, and parts of recovery instead of delegating complete invariants to the imported agent, provider, worktree, and service owners. CR-125, CR-128, CR-130, and CR-131 identify the resulting boundary failures.
- helper coverage: covered, level 3, confidence 0.93

### Security

- assessment and evidence: admission authorizes any ancestry whose command text resembles a gate hook and does not bind the process to the installed managed hook or a Git receive process. Windows mutation authorization is hard-disabled rather than implemented. See CR-124 and CR-127.
- helper coverage: covered, level 3, confidence 0.59

### Performance

- assessment and evidence: no blocking hot-path query or unbounded user-data loop was confirmed. The unused direct dependency graph increases downloads and release-notice generation, recorded as ADV-001.
- helper coverage: unavailable

## Verification Story

- command or inspection: `npm run test:safety-dance`; focused Go tests and vet for CLI, daemon, pipeline, worktrees, and TUI; `GOOS=windows GOARCH=amd64 go build ./cmd/safety-dance`; `go mod tidy -diff`; complete diff and changed-test inspection
- result: native aggregate and focused checks passed. The Windows cross-build failed with `internal/cli/daemon.go:231:27: undefined: syscall.Kill`; `go mod tidy -diff` reported unused direct dependencies.
- manual, screenshot, or before-and-after evidence: saved verification covers the built-binary local flow at `49c6c2d`; no hosted release, live-provider, Windows runtime, or screenshot evidence exists

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-124 Managed-hook ancestry remains forgeable

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:123`
- failure mode: a same-user process can satisfy token issuance by placing an ancestor whose command string ends in `hooks/pre-receive` or `hooks/post-receive` beneath the gate path, without proving that the executable is the installed managed hook or that Git invoked it for the receive transaction.
- evidence or reproduction: `managedHookPeer` sets a sticky Boolean from parsed `ps` command text at lines 138-143. It does not verify the hook file identity, parent `git-receive-pack`, or an OS-authenticated executable identity; the latest fix artifact also records complete ancestry proof as blocked.
- fix direction: bind issuance to verifiable managed-hook identity and the expected Git receive ancestry, with platform-specific authenticated process inspection and negative tests for renamed or directly invoked hook-shaped processes.

### CR-125 Production validation owners remain disconnected

- type: Refactor suggestion
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:47`
- failure mode: production runs execute every intent, review, test, document, lint, pull-request, and CI stage as an arbitrary shell command instead of using the imported typed agent, response, provider, and CI owners. The pull-request stage cannot run at all because `PR` passes `"pr"` while `requiredCommand` recognizes only `"pull-request"`.
- evidence or reproduction: `executeRun` dispatches only `steps.*` wrappers at `internal/cli/daemon.go:489-534`; `Validate` uses `sh -c` at `validation.go:68`; `pr.go:6` calls `Validate(ctx, "pr")`, which maps to no command at `validation.go:51` and fails at line 66. No CLI production path constructs the imported agent or provider runners.
- fix direction: route each stage through its typed owner and durable response state machine, then add a production-path test that reaches review, pull-request creation, and CI completion without substituting shell placeholders.

### CR-126 Pre-push interruption leaves publication permanently claimed

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/pipeline/steps/push.go:102`
- failure mode: after a crash that persisted `push_active` but occurred before the remote write, restart sees the old verified remote head, returns `active publication requires reconciliation`, and never clears or safely resumes the claim. The run cannot publish without manual database intervention.
- evidence or reproduction: the recovery branch handles only `live == candidate` at lines 103-111. A non-candidate live head returns before the deferred claim clear is installed at line 118, even when the live head still equals the previously verified head and no competing publication occurred.
- fix direction: persist enough publication phase and verified-head evidence to distinguish pre-push interruption from divergence, then atomically resume or release only the safe pre-push case while keeping genuinely divergent heads blocked.

### CR-127 The Windows release target does not build or authorize mutations

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:231`
- failure mode: every tagged release fails its Windows matrix build, so the dependent publish job never runs. Even after compilation, Windows mutation and token authorization remain rejected by unsupported process-environment inspection.
- evidence or reproduction: `GOOS=windows GOARCH=amd64 go build ./cmd/safety-dance` fails with `undefined: syscall.Kill`; `.github/workflows/safety-dance-release.yml:17,40-45` includes Windows and requires the full matrix before publish. `AuthorizeMutationPeer` rejects Windows at `internal/daemon/admission.go:181`, and `processenv_windows.go:7-9` always returns unsupported.
- fix direction: use a cross-platform shutdown primitive and implement authenticated Windows mutation ancestry, or remove Windows from the build, packaging, plan, and support contract until runtime behavior is implemented. Add the exact Windows cross-build to release-contract tests.

### CR-128 Worktree creation is not crash-durable

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:388`
- failure mode: a crash after `git worktree add` but before `Manager.Replace` persists the run leaves an unowned worktree that startup recovery cannot identify or remove. Cleanup also has no durable pending/removing state, so interrupted cleanup can leak owned worktrees indefinitely.
- evidence or reproduction: `recordPush` creates the directory at lines 388-390 and persists ownership only through `Manager.Replace` at line 393. `Manager.Recover` reads existing run rows only (`internal/daemon/manager.go:113-147`), and the worktree package exposes create, remove, and recover operations without a creation or cleanup journal (`internal/worktrees/ownership.go:12-62`).
- fix direction: persist a worktree ownership transaction or journal before creation, transition it after verification, and sweep only recorded terminal or abandoned entries during startup with crash-point tests.

### CR-129 Completed-step reuse ignores candidate and policy inputs

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/runner.go:83`
- failure mode: restart skips a completed validation step solely from its status even when the candidate, trusted command, agent/provider selection, or validation generation changed. A run can therefore reuse approval produced under weaker or different policy.
- evidence or reproduction: lines 65-84 load the first row by step name and immediately continue for `completed` or `skipped`; no candidate or policy fingerprint is persisted or compared. `executeRun` reloads trusted and global configuration on each execution at `internal/cli/daemon.go:439-469`, so restart inputs can differ while the step is still skipped.
- fix direction: persist a canonical fingerprint of candidate head, trusted policy, selected owner, command, and generation with every result, and reuse only an exact match; otherwise invalidate that step and every dependent later step.

### CR-130 Global execution configuration is discarded

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:464`
- failure mode: global agent, review-agent, provider, timeout, and publication settings never reach production execution, so operators cannot apply the documented global policy and runs behave differently from their configuration.
- evidence or reproduction: `config.Merge` returns the merged configuration at line 468, but line 469 copies only `Commands` back into the repository configuration passed to every step. The selected agent/provider owners are not constructed elsewhere in `executeRun`.
- fix direction: construct one typed effective execution policy from global and trusted repository configuration, pass that policy to the responsible owners, and test global-only, repository-only, and override cases through the production daemon path.

### CR-131 Daemon stop bypasses the installed service owner

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:145`
- failure mode: `daemon stop` shuts down only the current process and leaves an installed launchd/systemd/task definition enabled. Launchd's `KeepAlive` restarts the daemon immediately, causing stop to time out; other platforms retain a service that can restart later despite the command reporting a stop.
- evidence or reproduction: `stopInstalledService` exists at lines 137-143 but `stopDaemon` never calls it. The Darwin definition sets `KeepAlive` at `internal/daemon/service.go:48`, while the stop loop treats any healthy restarted daemon as failure at `daemon.go:161-171`.
- fix direction: stop the exact owned service definition first through `daemon.Service`, then use authenticated IPC for an unmanaged foreground daemon. Add installed-service stop and restart tests that exercise ownership and prevent immediate relaunch.

### CR-132 Identity checks do not preserve the required copyright notice

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `scripts/check-safety-dance-identity.mjs:48`
- failure mode: deleting or changing the imported copyright attribution still passes the aggregate identity check, violating the plan's legal-preservation acceptance criterion.
- evidence or reproduction: the scanner requires only `MIT License` and `Permission is hereby granted` at lines 48-52. The passing fixture at `tests/safety-dance-identity.test.mjs:8-19` intentionally contains only those two fragments and omits `tools/safety-dance/LICENSE:3`.
- fix direction: compare the legal file byte-for-byte with a checked-in canonical notice or assert the full immutable copyright and permission text, and add mutation tests for the copyright line and every required notice paragraph.

## Advisories

### ADV-001 The Go module retains unused direct dependencies

- type: Refactor suggestion
- severity: minor
- category: Performance and scalability
- location: `tools/safety-dance/go.mod:6`
- evidence: `go mod tidy -diff` removes direct Bubble Tea, Bubbles, Lip Gloss, Termenv, and Toon dependencies plus their transitive graph. Release notice generation walks the module graph, so unused modules also inflate packaged notices.
- suggestion: run and commit `go mod tidy` after the production owner wiring settles, then generate notices from the final compiled module graph.

## Dead Code and Dependency Review

- newly orphaned code: the imported typed agent and provider implementations are reachable as packages but not as production validation owners; CR-125 covers the task-caused disconnected behavior
- dependency findings: `go mod tidy -diff` reports unused direct and transitive dependencies; ADV-001 records the non-blocking cleanup

## Verdict

- decision: request_changes
- overall code-health change: the branch adds the intended product shape and passing native checks, but it leaves core trust, durability, platform, policy, lifecycle, and legal invariants unenforced
- rationale: nine major findings contradict explicit plan requirements or block a supported release path; green native tests do not exercise those failures

## Review Limits

- blocked or unavailable checks: no pull request exists; hosted GitHub release, authorized live-provider behavior, and Windows runtime execution were unavailable. Windows compilation was checked and failed. The axis helper returned `unclear` for performance, so that judgment was skipped and the axis was decided from the diff and dependency inspection.
- residual manual verification: rerun a hosted `safety-dance-v*` release, Windows mutation flow, live provider pull-request/CI flow, and installed service lifecycle after the findings are fixed
