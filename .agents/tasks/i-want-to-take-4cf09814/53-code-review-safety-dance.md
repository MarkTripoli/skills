---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 7b5d068a1f911a437232fc03dd74505804bb3e69
status: findings
summary: "The complete 97-commit Safety Dance diff was reviewed at 7b5d068 against origin/main. Ten critical or major findings remain in validation verdict handling, nested-run isolation, agent trust, Windows admission, worktree and daemon recovery, gate and service rollback, wizard setup, and terminal-run inspection. The next fix round must close these paths and add the missing failure and platform tests before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `7b5d068a1f911a437232fc03dd74505804bb3e69`
- commits: 97 commits in `origin/main..HEAD`; 274 files changed with 44,350 insertions and 4 deletions
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked task-evidence directories

## Previous Round

- previous artifact: `51-code-review-safety-dance.md`
- CR-133 Managed-hook authorization trusts a forgeable environment marker: fixed
- CR-134 Production validation bypasses the imported typed owners: still open
- CR-135 A first-publication crash leaves the push claim stuck: fixed
- CR-136 The advertised Windows runtime cannot mutate or stop the daemon: still open
- CR-137 Worktree ownership is not durable across creation and removal: still open
- CR-138 Completed steps are reused without binding their trusted inputs: fixed
- CR-139 Global execution and provider policy is discarded: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate as an independently branded, complete tool with no retired product references outside the required license
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; latest implementation receipt `26-implementation-safety-dance.md`; latest fix receipt `52-code-review-fixes-safety-dance.md`
- repository instructions: root `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add authenticated local Git admission, durable branch-scoped validation, guarded publication, operator interfaces, runtime skill distribution, identity enforcement, and native release packaging under the Safety Dance identity
- change description quality: commit subjects identify each implementation and repair round; no pull request exists, so no title or body was available to assess
- implementation model and review model: implementation model was not recorded; review model `GPT-5.6 Sol`
- changed-line size and logical cohesion: 44,354 changed lines across a new Go tool, one skill, tests, workflows, and task history; the product change is cohesive but far beyond the plan's approximate split signal
- resulting large-file concerns: `internal/config/config.go` is 3,140 lines, `internal/scm/github/github.go` is 1,487 lines, and `internal/agent/agent.go` is 1,353 lines; no finding is based on size alone
- dependency or lockfile changes: new Go module and lockfile; `go mod tidy -diff` reports many unused direct and indirect dependencies

## Tests Reviewed First

- behavior claimed by tests: authenticated hook admission, replay and mismatch rejection, pipeline order and persistence, publication recovery, Windows cross-compilation, worktree journals, gate rollback, wizard compensation, runtime installation, identity scanning, and release packaging
- missing or misleading coverage: typed verdict rejection, typed-child nested mutation, gate-agent instruction neutralization, Windows hook ancestry at runtime, crash-after-worktree-removal replay, post-create verification cleanup, concurrent stale-lock takeover, existing-gate repair rollback, partial service activation, wizard commands containing spaces, and terminal-run status are not covered

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5545` in / `73` out

`judge: model jev-1.13.0, tokens 5545 in / 73 out`

### Correctness

- assessment and evidence: The locally decidable acceptance checks in `16-verification-safety-dance.md` passed at `49c6c2d`, and the latest fix receipt records passing root and Safety Dance aggregates at `4063549`. The current code still accepts failing typed verdicts, cannot admit normal Windows hook calls, loses or strands state at several recovery boundaries, rejects normal wizard command input, and hides terminal runs. See CR-140, CR-143 through CR-149.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: The pipeline, admission, worktree, gate, service, wizard, and status owners are named directly, but several comments claim stronger guarantees than their implementations provide. `Typed` calls any nonempty structured result success, `AcquireOwnership` says the lock is never replaced while deleting stale lock paths, and removal recovery is not idempotent.
- helper coverage: covered, level 2, confidence 0.69

### Architecture

- assessment and evidence: The change generally places behavior under the planned package owners, but trust and recovery invariants stop between those owners. The pipeline does not interpret its typed owner's verdict, the daemon drops the nested-run identity before invoking that owner, and worktree, gate, and service compensation do not span their complete transactions. See CR-140 through CR-147.
- helper coverage: covered, level 3, confidence 0.57

### Security

- assessment and evidence: Validation agents run inside untrusted checkouts without `EnsureGateNeutralized`, and typed children do not receive `SD_PARENT_RUN_ID`. Shell validation descendants can also push through a managed hook because hook authorization no longer rejects marked ancestors. These paths let repository-controlled agent instructions or nested validation work mutate gate state. See CR-141 and CR-142.
- helper coverage: covered, level 3, confidence 0.86

### Performance

- assessment and evidence: No critical or major performance defect was found. Pipeline response polling is bounded at 100 ms, TUI refresh is bounded at 250 ms, and repository scans exclude the largest named generated directories; the larger concern is correctness at lifecycle boundaries rather than unbounded hot-path work.
- helper coverage: covered, level 3, confidence 0.84

## Verification Story

- command or inspection: read `16-verification-safety-dance.md` items first; inspected `origin/main...HEAD`, the latest repair diff, callers, and changed tests; ran `go test -count=3 ./internal/daemon -run TestExecutableGateAdmission -v`; ran `go mod tidy -diff`
- result: the executable admission test passed three isolated runs; the verification artifact records nine passing repository checks and 28 locally decidable acceptance items; `go mod tidy -diff` found an untidy module graph
- manual, screenshot, or before-and-after evidence: no UI screenshots or real Windows runtime session exist; hosted release and authorized live-provider evidence remain unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-140 Typed validation accepts a failing verdict as approval

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:89`
- failure mode: A typed intent, rebase, review, pull-request, or CI owner can return `{"verdict":"fail"}` and the pipeline treats the step as successful, eventually publishing a candidate that the owner rejected.
- evidence or reproduction: The schema accepts any string at lines 91-92. Lines 97-100 check only that `res.Output` is nonempty and never decode or classify the verdict. `Review` and `CI` directly return `Typed` at `internal/pipeline/steps/review.go:5-6` and `ci.go:5-6`.
- fix direction: Define stage-specific typed result schemas with explicit pass, fail, and blocked values, decode the output, persist its evidence, and return an error for every non-passing required verdict. Add a production-path test that returns a valid structured failure and proves push never starts.

### CR-141 Validation children can mutate or recursively invoke the gate

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:89`
- failure mode: Typed validation agents inherit no `SD_PARENT_RUN_ID`, so a repository-controlled agent can run Safety Dance mutation commands against its parent. Shell validation receives the marker, but it can invoke Git receive; managed-hook authorization ignores marked ancestors and issues a token to the resulting hook chain.
- evidence or reproduction: `Typed` builds `agent.RunOpts` without `Env` at lines 89-93. `AuthorizeMutationPeer` relies on finding `SD_PARENT_RUN_ID` in process environments at `internal/daemon/admission.go:187-218`. `managedHookPeer` checks only command ancestry at `admission.go:122-151` and does not reject the marker, while shell checks set it at `validation.go:116-119`.
- fix direction: Propagate `SD_PARENT_RUN_ID=<run id>` to every typed invocation and reject that marker anywhere in managed-hook ancestry as a negative condition. Add tests where typed and shell validation descendants try `respond`, `abort`, `run`, and a push through the local gate.

### CR-142 Gate agents run under untrusted repository instructions

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:80`
- failure mode: A pushed `AGENTS.md` or equivalent project instruction can control the agent that is supposed to review that push, including directing it to return an approving result or mutate the checkout.
- evidence or reproduction: The agent package provides `EnsureGateNeutralized` and documents that only verified adapters may run gate work in an untrusted checkout at `internal/agent/agent.go:162-210`. `Typed` constructs the configured agent and immediately runs it in the worktree without calling that guard.
- fix direction: Call `agent.EnsureGateNeutralized` before every gate-agent launch, fail closed for unsupported or overridden adapters, and add tests for both accepted neutralized owners and rejected unneutralized owners.

### CR-143 Windows receive hooks cannot satisfy managed-hook ancestry

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/processinfo_windows.go:20`
- failure mode: A normal Git for Windows receive hook cannot obtain an admission token, so the advertised Windows gate rejects ordinary pushes.
- evidence or reproduction: Windows `processInfo` returns only `ProcessEntry32.ExeFile` at lines 20-23. A shell hook appears as `sh.exe`; its script path is not present. `managedHookPeer` requires a command field equal to the full `<gate>/hooks/pre-receive` or `post-receive` path at `admission.go:125-150`. Cross-compilation proves only that this mismatch compiles, and the executable hook test explicitly skips Windows at `internal/daemon/hook_e2e_test.go:21-24`.
- fix direction: Authenticate Windows hook ancestry with process metadata that can prove the actual script or another unforgeable launch contract, then run a real Windows Git hook admission test. Keep the shutdown fix, which is independent.

### CR-144 Worktree journal recovery is not replay-safe

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/worktrees/ownership.go:35`
- failure mode: A crash after Git removes a worktree but before its journal unlink makes every later daemon start fail. A verification error after `git worktree add` instead deletes the pending journal and leaves an unowned worktree that startup cannot recover.
- evidence or reproduction: `CreateDetached` removes its marker for every returned error at lines 35-39 even when errors occur after creation at lines 40-50. `RemoveDetached` removes Git state before unlinking its marker at lines 73-84; `RecoverRemoving` calls the same non-idempotent removal at lines 118-136, and Git returns an error for an already removed worktree. Existing durability tests cover only failure before removal.
- fix direction: Keep creation journals whenever Git may have created state, make removal recovery treat an already absent and unregistered worktree as completed, and test both crash points plus cleanup of both journal files.

### CR-145 Stale daemon lock takeover is racy

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/daemon.go:24`
- failure mode: Two starters that observe one stale PID file can both become live owners. One contender can delete the other's newly created lock, leaving both processes using the same SQLite database and IPC location.
- evidence or reproduction: Lines 24-31 implement stale takeover as separate read, PID probe, unlink, and `O_EXCL` create operations. The sequence has no generation check or kernel lock. The only test starts the second acquisition after a live first owner and does not contend over a stale file.
- fix direction: Use an OS-backed exclusive lock or an atomic stale-owner replacement protocol that validates the same inode or generation before takeover. Add a barrier-based test with two simultaneous stale-lock contenders and require exactly one owner.

### CR-146 Existing-gate repair is not transactional

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/gate/gate.go:142`
- failure mode: Repairing an existing gate can leave changed receive configuration, hooks, origin, or working remote after a later repair step or metadata write fails.
- evidence or reproduction: `provisionGate` mutates those resources in sequence at `internal/gate/gate.go:195-229`. `InitWithFork` runs rollback only when the gate was newly created at lines 142-147, so existing-gate failures at lines 152-160 retain partial mutations. Wizard compensation also removes only newly created gates.
- fix direction: Journal the original existing-gate Git configuration, hook files, stamps, origin, and working remote before mutation, then restore them in reverse order on every failure. Add injected failures after each repair write.

### CR-147 The setup wizard cannot honor normal setup input

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/wizard/setup.go:53`
- failure mode: Typical commands such as `go test ./...` fail input parsing, while accepted gate-location and provider answers are silently discarded.
- evidence or reproduction: `fmt.Fscanln` scans the eight-command line into one string at lines 53-63, so whitespace ends the token and produces an extra-input error. The model collects gate and provider at lines 43-51, but the production writer persists only upstream and commands and calls the default gate initializer at `internal/cli/wizard.go:81-113`.
- fix direction: Read the full line for semicolon-separated commands, validate each field, and either apply gate and provider choices through their owning configuration paths or stop prompting for unsupported choices. Add a built-binary wizard test with spaced commands and nondefault selections.

### CR-148 Terminal runs disappear from status and TUI views

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/status.go:27`
- failure mode: Failed, cancelled, completed, and published runs cannot be inspected after they become terminal. The TUI reports an invented completed state when no active run exists, hiding the actual failure or publication state.
- evidence or reproduction: Status selects only pending and running records at `internal/cli/status.go:27-40` through the active-run query. The TUI uses the same active-only query and returns `RunCompleted` when it gets no row at `internal/cli/tui.go:50-57`. This contradicts the plan's durable status, error, and publication views.
- fix direction: Query the active run or latest terminal run for the current repository and branch, preserve its real status and publication details, and add failed, cancelled, completed, and published CLI/TUI tests.

### CR-149 Service activation failure can escape rollback

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/service.go:191`
- failure mode: A platform activation command can start or enable the service and then return an error. Install restores or deletes the owned definition before wizard compensation runs, so `Stop` refuses cleanup and the partially activated service remains live.
- evidence or reproduction: `Service.Install` restores the definition immediately on activation failure at lines 191-208. Wizard compensation then calls `StopService`, but `Service.Stop` requires the owned definition at lines 214-221. Current service tests model successful executor calls, not partial activation followed by error.
- fix direction: Preserve enough ownership evidence to stop or disable a partially activated service before restoring the prior definition, make compensation idempotent, and test failure after an observable activation side effect for each platform adapter.

## Advisories

### ADV-001 The Go module graph is untidy

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `tools/safety-dance/go.mod:5`
- evidence: `go mod tidy -diff` removes many direct UI and agent dependencies and rewrites transitive versions, including `golang.org/x/sys`. These packages are not reachable from the shipped module as it stands.
- suggestion: Run `go mod tidy`, regenerate `THIRD_PARTY_NOTICES.md`, and rerun release packaging and the full Go suite after the product paths settle.

## Dead Code and Dependency Review

- newly orphaned code: no task-caused production code was proven unreachable; `RegisterWithInputFunc` is currently unused but supports dynamic replay inputs and is not a blocking orphan by itself
- dependency findings: ADV-001 records the untidy Go graph; no new Node dependency was added

## Verdict

- decision: request_changes
- overall code-health change: The branch adds the intended product owners and extensive local checks, but its core validation and recovery guarantees remain weaker than the plan and several comments claim.
- rationale: CR-140 can publish a candidate after an explicit failing typed verdict. CR-141 through CR-149 leave nested control, untrusted-agent execution, Windows admission, daemon and worktree recovery, rollback, setup, and inspection paths incomplete.

## Review Limits

- blocked or unavailable checks: no pull request title or body; no hosted `safety-dance-v*` run; no authorized live-provider run; no real Windows runtime session
- residual manual verification: exercise Windows hook admission and service lifecycle on Windows, platform service partial-failure rollback, a real typed provider returning pass and fail verdicts, and hosted release asset contents
