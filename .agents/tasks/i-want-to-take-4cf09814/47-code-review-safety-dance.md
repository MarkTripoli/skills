---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 2015c74be8d4c38bbaf4f9eec760bfff617068e8
status: findings
summary: "The complete 88-commit Safety Dance diff was reviewed at 2015c74 against origin/main. Aggregate tests pass, but typed validation and response owners remain disconnected, publication recovery can strand an already-published run, nested authorization is bypassable, and Windows gate operations are entirely rejected. The next fix round must close these trust, durability, setup, branch-scoping, and release failures before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` (`origin/main`)
- reviewed HEAD: `2015c74be8d4c38bbaf4f9eec760bfff617068e8`
- commits: 88 commits after the merge base; `npm run check-commits -- origin/main..HEAD` accepted all 88 subjects. No pull request exists for this branch.
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: committed task artifacts and the two untracked task-evidence directories; review scope is the 214 product files with 36,333 insertions and 4 deletions outside `.agents/tasks/`.

## Previous Round

- previous artifact: `45-code-review-safety-dance.md`
- CR-098 Nested descendants can bypass mutation authorization: still open
- CR-099 The wizard writes configuration that the daemon rejects: fixed
- CR-100 Wizard rollback destroys an existing repository configuration: fixed
- CR-101 Explicit runs are cancelled when their IPC request ends: fixed
- CR-102 Same-branch replacement still rejects its cancelled predecessor: fixed
- CR-103 Response resumption cannot preserve operator intent: still open
- CR-104 Initial and fast-forward publications are treated as rewrites: fixed
- CR-105 Crash-stale publication ownership is reclaimed without reconciliation: still open
- CR-106 Terminal cleanup can delete a recoverable run's worktree: fixed
- CR-107 Post-review worktree changes are silently omitted from publication: fixed
- CR-108 Release archives omit compiled dependency notices: fixed
- CR-109 The production pipeline does not use the imported validation owners: still open
- CR-110 macOS never receives responsive TUI width: fixed
- CR-111 Windows behavior required by the plan is absent: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; the requested independently branded import must preserve the source system's gate, durable-run, validation, and guarded-publication behavior.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; the latest implementation receipt is `26-implementation-safety-dance.md`, and `16-verification-safety-dance.md` records all locally decidable items passing at its pinned revision.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`; the changed skill keeps the canonical line-6 links and the repository installer remains the distribution owner.

## Change Profile

- intent and expected behavior: add a branded local Git gate with authenticated admission, durable branch-scoped execution, typed validation, guarded publication, operator interfaces, skill distribution, and checksummed native releases.
- change description quality: commit subjects pass repository validation. No pull-request title or body exists, so pull-request description quality could not be evaluated.
- implementation model and review model: implementation receipts do not consistently record one model; this review used GPT-5.6 Sol with focused implementation-review workers.
- changed-line size and logical cohesion: 214 product files and 36,337 changed lines form one product import, but the scope is far above the review guide's split threshold and retains disconnected imported subsystems.
- resulting large-file concerns: `internal/config/config.go` is 3,140 added lines, and the agent, SCM, database, and Git packages each carry substantial imported behavior. The critical concern is not size alone: the production runner bypasses the typed agent and SCM owners.
- dependency or lockfile changes: the Go module and `go.sum` add pinned dependencies; no npm lockfile changed. Release packaging now generates notices from the module graph, but the generator cannot execute under cross-compilation environment variables.

## Tests Reviewed First

- behavior claimed by tests: gate admission, durable runs, branch overlap, publication ordering, CLI controls, wizard compensation, TUI rendering, installer distribution, identity scanning, native packaging, and aggregate race/build checks.
- missing or misleading coverage: tests do not exercise a removable nested-run marker, interrupted `push_active` reconciliation, Windows mutation admission, full-line wizard commands, branch-specific TUI actions, changed validation inputs on restart, or packaging while `GOOS` targets Darwin or Windows. The release matrix test explicitly checks only Linux and Darwin.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5880` in / `73` out

### Correctness

- assessment and evidence: the fixed pipeline calls generic shell validation instead of imported typed owners (`internal/cli/daemon.go:476-523`, `internal/pipeline/steps/validation.go:47-78`), restart rejects an interrupted publication claim instead of reconciling it (`internal/pipeline/steps/push.go:102-104`), and Windows rejects every gate-token and mutation request (`internal/daemon/admission.go:123-125,179-182`). Setup, TUI branch selection, worktree custody, and release packaging have additional production failures recorded below.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: the public path is direct enough to trace, but two validation systems coexist: large typed agent/SCM packages and eight generic `sh -c` adapters. Wizard fields are collected without being applied, and recovery errors instruct reconciliation that has no implementation, leaving ownership unclear.
- helper coverage: covered, level 2, confidence 0.63

### Architecture

- assessment and evidence: daemon admission, manager, database, worktree, and publication boundaries exist, but their handoffs are not atomic. Worktrees are created before durable ownership, the admission mutex spans a blocking manager replacement, and completed steps are reused without binding them to policy or candidate inputs.
- helper coverage: covered, level 3, confidence 0.91

### Security

- assessment and evidence: mutation authorization trusts a process basename anywhere in ancestry and an environment marker that descendants can remove (`internal/daemon/admission.go:177-208`). Trusted policy is fetched for repository commands, but completed results survive later trusted-policy changes without input comparison (`internal/pipeline/runner.go:65-85`).
- helper coverage: covered, level 3, confidence 0.69

### Performance

- assessment and evidence: no unbounded query or hot-path allocation defect was found. The material scalability failure is blocking: `notifyPush` holds one global mutex while same-branch replacement may wait for a prior run, so unrelated branch admissions cannot proceed concurrently (`internal/daemon/admission.go:275-288`, `internal/daemon/manager.go:62-67`).
- helper coverage: covered, level 3, confidence 0.59

## Verification Story

- command or inspection: `npm test`; `go test ./internal/daemon ./internal/pipeline/steps ./internal/cli`; `npm run check-commits -- origin/main..HEAD`; `GOOS=windows GOARCH=amd64 go run ./scripts/generate-notices.go` from `tools/safety-dance`.
- result: the aggregate passed with 136 Node tests, the Safety Dance race/vet/build aggregate, and 2 release tests; focused Go packages and all 88 commit subjects passed. The cross-target notice command failed with `generate-notices.exe: exec format error`, reproducing CR-123.
- manual, screenshot, or before-and-after evidence: the prior verification artifact records built-binary local behavior and leaves hosted release and live-provider checks untested. No screenshot or hosted workflow evidence exists.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-112 Nested descendants can still bypass mutation authorization

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:177`
- failure mode: a validation descendant can remove `SD_PARENT_RUN_ID` and invoke or masquerade as a `safety-dance` process, after which daemon start, response, and cancellation handlers authorize it.
- evidence or reproduction: `AuthorizeMutationPeer` treats any ancestor whose first command token has basename `safety-dance` as trusted and rejects nesting only when an environment string is present. Validation commands receive the marker at `internal/pipeline/steps/validation.go:68-70`, but a command can run `env -u SD_PARENT_RUN_ID safety-dance ...`; executable name is not provenance.
- fix direction: authorize mutations from an authenticated executable/process identity and classify the complete active-step ancestry independently of mutable descendant environment; add a regression that removes the marker before attempting mutation.

### CR-113 Production validation and operator response owners remain disconnected

- type: Refactor suggestion
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:476`
- failure mode: the product can publish after eight arbitrary shell commands without invoking the imported typed agent, review, provider pull-request, or CI owners; the generic stages never create approval states, so normal production runs cannot use the durable response path.
- evidence or reproduction: every named stage routes through `steps.Validate`, whose only behavior is `sh -c` plus `git diff --check` (`internal/pipeline/steps/validation.go:47-78`). `steps.Review`, `steps.PR`, and `steps.CI` are one-line wrappers around that function. The response consumer only runs for persisted `awaiting_approval` or `fix_review` states (`internal/pipeline/runner.go:86-113`), but the production steps never create those states. Imported `internal/agent` and `internal/scm` packages have no callers from `internal/cli`.
- fix direction: route each fixed pipeline stage through its typed imported owner, persist typed evidence and approval states, and prove response resume through the production executor before publication.

### CR-114 Interrupted publication cannot reconcile after restart

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/push.go:102`
- failure mode: a crash after `push_active` is persisted, including after the remote accepts the candidate, causes restart to fail the run permanently without reconciling the upstream, gate mirror, or durable binding.
- evidence or reproduction: `Publish` acquires the claim at lines 105-107 and records the binding only at lines 129-142. `Manager.Recover` resumes pending/running records, but `Publish` immediately rejects any surviving active claim with “reconcile before retry”; no reconciliation caller exists. The daemon then marks the run failed and may remove its worktree.
- fix direction: implement explicit crash recovery that inspects the durable claim, candidate, live upstream, and gate mirror, then either completes the binding or safely retries without repeating a completed publication.

### CR-115 Windows releases ship a gate that rejects every mutation

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/admission.go:123`
- failure mode: the published Windows binary cannot issue a managed-hook token, start a run, respond, or cancel.
- evidence or reproduction: `managedHookPeer` returns false whenever `runtime.GOOS == "windows"`, and `AuthorizeMutationPeer` returns “unsupported or unauthenticated IPC peer” on the same platform. The release workflow still publishes `windows/amd64` at `.github/workflows/safety-dance-release.yml:17`.
- fix direction: implement authenticated Windows hook ancestry and mutation authorization using the peer PID supplied by the transport, add Windows-specific tests, or remove Windows from every release and support promise until complete.

### CR-116 The setup wizard cannot accept or apply its advertised choices

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/wizard/setup.go:49`
- failure mode: ordinary commands containing spaces, such as `go test ./...`, cannot be entered as one of the eight commands, and the collected gate and provider choices have no effect.
- evidence or reproduction: `fmt.Fscanln` scans into one string before splitting on semicolons, so whitespace terminates input. Production writing persists only `model.ValidationCommands`; `model.Gate` and `model.Provider` are discarded at `internal/cli/wizard.go:81-113`. Existing wizard tests do not exercise the `commands` prompt.
- fix direction: read the complete command line, validate each command, persist or apply gate/provider choices through their owning configuration types, and add a production wizard test with commands containing spaces.

### CR-117 Daemon stop and restart can signal an unrelated process

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:146`
- failure mode: a stale PID file can make `daemon stop` send SIGTERM to a reused PID, while restart can report success against the old daemon before shutdown completes.
- evidence or reproduction: `stopDaemon` reads the PID, calls `process.Signal` without verifying executable or authenticated daemon ownership, ignores the signal error, removes the PID file, and prints success at lines 154-171. Restart immediately invokes start, whose health check can still reach the prior process.
- fix direction: add an authenticated shutdown RPC or verify process identity and runtime-home ownership, wait for socket and singleton-lock release, and report signal or timeout failures.

### CR-118 Worktree ownership is not crash-durable

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:248`
- failure mode: a crash can strand a registered Git worktree before its run is recorded or after its run becomes terminal, with no startup path able to identify and clean it.
- evidence or reproduction: fresh and hook-triggered paths create the worktree before `Manager.Replace` persists ownership (`internal/cli/daemon.go:248-258,382-390`). Completion writes a terminal state before worktree removal (`internal/cli/daemon.go:190-210`), while recovery resumes only pending/running records (`internal/daemon/manager.go:115-145`).
- fix direction: persist ownership before creation, use a recoverable creation/cleanup state, remove via Git's worktree owner, and sweep only durably recorded non-resumable worktrees at startup.

### CR-119 One branch replacement blocks admission for every branch

- type: Potential issue
- severity: major
- category: Performance and scalability
- location: `tools/safety-dance/internal/daemon/admission.go:275`
- failure mode: a slow same-branch cancellation and join blocks unrelated pre-receive admission and notification work, violating cross-branch concurrency.
- evidence or reproduction: `notifyPush` holds `Admission.mu` while calling `a.notify` at lines 275-288. That callback reaches `Manager.Replace`, which may wait indefinitely for the previous run at `internal/daemon/manager.go:62-67`; admission receipt writes need the same global mutex.
- fix direction: verify and copy the receipt under the mutex, release it before the callback, then conditionally consume the same receipt after success.

### CR-120 Restart reuses validation completed under different inputs

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/runner.go:65`
- failure mode: a policy or candidate-input change while the daemon is down can leave review, test, or lint marked complete and permit publication without evaluation under the current trusted policy.
- evidence or reproduction: the runner skips every completed or skipped step solely by status at lines 83-85. Restart reloads trusted configuration from the current upstream default branch at `internal/cli/daemon.go:439-457`, but no stored command, policy identity, candidate head, or validation generation is compared before reuse.
- fix direction: persist each step's candidate, trusted-config identity, command/owner inputs, and generation; reuse a result only when all durable inputs match.

### CR-121 TUI mutations can target another branch's run

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/tui.go:40`
- failure mode: when branches run concurrently, the TUI opened from one branch can approve, skip, fix, or abort the newest run from a different branch.
- evidence or reproduction: the TUI requests `GetActiveRun(repo.ID, "")`, and the empty branch selector returns the newest active repository run. Actions then use that run ID at `internal/cli/tui.go:83-105`.
- fix direction: resolve and pass the current full branch ref, or require explicit run selection and display it before every mutation.

### CR-122 Cross-platform release packaging executes a foreign notice binary

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `.github/workflows/safety-dance-release.yml:29`
- failure mode: Darwin and Windows matrix jobs build `generate-notices` for the target OS and then try to execute it on the Linux runner, so those release assets cannot be packaged.
- evidence or reproduction: the workflow exports target `GOOS` and `GOARCH` for the whole build-and-package step. `package-release.sh:25` runs `go run ./scripts/generate-notices.go` under those variables. `GOOS=windows GOARCH=amd64 go run ./scripts/generate-notices.go` fails locally with `generate-notices.exe: exec format error`; the release test checks only a native Linux invocation and omits Windows entirely.
- fix direction: generate notices under the host toolchain before setting cross-compilation variables, or clear `GOOS`/`GOARCH` for the generator; exercise Darwin and Windows packaging contracts in tests.

### CR-123 Global configuration is not applied to runs

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:433`
- failure mode: settings documented in `$SD_HOME/config.yaml` do not affect validation, agent/provider choice, or publication behavior; only repository configuration is used.
- evidence or reproduction: `executeRun` loads pushed and trusted repository configs and merges only those at lines 433-457. `LoadGlobal` is used by the IPC client only to obtain connection timeout (`internal/ipc/client.go:80-91`), despite `docs/configuration.md:1-5` promising global configuration with repository overrides.
- fix direction: load global configuration in the daemon, merge repository overrides according to the documented precedence and trusted-field rules, and test effective behavior rather than parsing alone.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: the imported typed agent, review/provider, and SCM execution paths are effectively orphaned from the shipped pipeline; this is gated as CR-113 rather than treated as optional deletion.
- dependency findings: Go dependencies are pinned in `go.sum`. The generated-notice path covers the module graph but breaks non-native release jobs as CR-122; hosted execution remains unproven.

## Verdict

- decision: request_changes
- overall code-health change: the latest fix closes several lifecycle defects, but the system still exposes incompatible validation paths and incomplete trust, recovery, Windows, setup, and branch-isolation boundaries.
- rationale: four critical and eight major findings affect the core gate and published release. Passing local aggregate tests do not exercise the failing production and cross-platform paths.

## Review Limits

- blocked or unavailable checks: no pull request title/body, hosted release run, Windows host, or authorized live-provider run was available. The release cross-target failure was reproduced through Go's cross-compilation environment rather than a hosted runner.
- residual manual verification: after fixes, exercise a real Windows gate, crash at each publication boundary, change trusted policy between restart attempts, drive concurrent branches through the TUI and hooks, run the setup wizard with commands containing spaces, and execute the hosted release matrix.
