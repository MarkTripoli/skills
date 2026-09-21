---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 42bc5357d0ff0326dd30511b824aed075d35939b
status: findings
summary: "The post-fix Safety Dance diff was reviewed from origin/main through 42bc535. The previous fixes close several trust and recovery defects, but five major lifecycle and platform findings remain: lock-path unlink races, Windows hook paths containing spaces, incomplete existing-gate rollback, partial terminal-run visibility, and duplicate notification delivery. The next fix round must close these paths and add targeted regression tests."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` (`origin/main`)
- reviewed HEAD: `42bc5357d0ff0326dd30511b824aed075d35939b`
- commits: 100 commits in `origin/main..HEAD`; 278 files changed, 44,925 insertions and 4 deletions
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked task-evidence directories

## Previous Round

- previous artifact: `53-code-review-safety-dance.md`
- CR-140 Typed validation accepts a failing verdict as approval: fixed
- CR-141 Validation children can mutate or recursively invoke the gate: fixed
- CR-142 Gate agents run under untrusted repository instructions: fixed
- CR-143 Windows receive hooks cannot satisfy managed-hook ancestry: still open
- CR-144 Worktree journal recovery is not replay-safe: fixed
- CR-145 Stale daemon lock takeover is racy: fixed
- CR-146 Existing-gate repair is not transactional: still open
- CR-147 The setup wizard cannot honor normal setup input: fixed
- CR-148 Terminal runs disappear from status and TUI views: still open
- CR-149 Service activation failure can escape rollback: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`
- latest implementation and fix receipts: `.agents/tasks/i-want-to-take-4cf09814/26-implementation-safety-dance.md`, `54-code-review-fixes-safety-dance.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add authenticated local Git admission, durable branch-scoped validation, guarded publication, operator interfaces, runtime skill distribution, identity enforcement, and native release packaging under the Safety Dance identity
- change description quality: commit subjects identify implementation and repair rounds; no pull request exists, so no title or body was available
- implementation model and review model: implementation model not recorded; review model `GPT-5.6 Luna`
- changed-line size and logical cohesion: 44,925 inserted lines across the new Go tool, skill, tests, workflows, and task history; the product change is cohesive but substantially exceeds the plan's split signal
- resulting large-file concerns: `tools/safety-dance/internal/config/config.go` is 3,140 lines, `internal/scm/github/github.go` is 1,487 lines, and `internal/agent/agent.go` is 1,353 lines; no finding is based on size alone
- dependency or lockfile changes: new Go module and lockfile; `go mod tidy -diff` remains nonempty per the prior review

## Tests Reviewed First

- behavior claimed by tests: typed verdict handling, nested-run isolation, neutralized agent execution, Windows cross-compilation, worktree journals, daemon singleton ownership, gate rollback, wizard compensation, terminal status, runtime installation, identity scanning, and release packaging
- missing or misleading coverage: close/unlink lock race, Windows hooks from paths with spaces, rollback of `config.worktree` and gate stamps/modes, terminal history alongside an active run, concurrent duplicate notification delivery, and real Windows hook execution remain untested

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4488` in / `73` out; first pass and required rerun both returned `unclear` for performance, so that axis was decided manually

### Correctness

- assessment and evidence: The local Go race suite passes, but five lifecycle paths still violate the plan's guarantees. Ownership cleanup can unlink a newly acquired lock path, Windows command parsing breaks quoted hook paths, existing-gate repair leaves newly written per-worktree state, status suppresses terminal history whenever any active run exists, and concurrent notifications can invoke the run-start callback twice. See CR-150 through CR-154.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: The repaired owners are explicit, but recovery comments still describe stronger transaction boundaries than the implementation records. The lock, gate snapshot, status aggregation, and notification receipt code each split a single ownership decision across separate operations.
- helper coverage: covered, level 2, confidence 0.68

### Architecture

- assessment and evidence: The fixes preserve package ownership, but lock-file pathname lifecycle, gate repair snapshots, notification receipt consumption, and terminal-run selection do not form atomic boundaries around the state they protect.
- helper coverage: covered, level 3, confidence 0.54

### Security

- assessment and evidence: The prior typed-agent and nested-run fixes are present. The remaining Windows hook defect is an admission availability failure rather than a bypass proven by the current code; no new security bypass was established beyond the findings below.
- helper coverage: covered, level 3, confidence 0.51

### Performance

- assessment and evidence: No critical or major performance issue was found in the reviewed paths. Lock and receipt operations are bounded, and the remaining defects are lifecycle correctness and platform compatibility rather than unbounded work or hot-path amplification.
- helper coverage: unavailable; the second helper pass remained unclear and performance was decided manually from the bounded operations inspected

## Verification Story

- command or inspection: reviewed `origin/main...HEAD`, the prior review and fix receipts, callers and tests for the repaired owners; ran `cd tools/safety-dance && go test -race ./...`; ran `git diff --check origin/main...HEAD`
- result: all Go race tests passed; `git diff --check` reports only trailing whitespace in the previously committed research artifact, not product code. The tests do not exercise the five residual paths.
- manual, screenshot, or before-and-after evidence: no real Windows Git hook session, hosted release, or live provider run exists

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-150 Ownership.Close can unlink a replacement daemon lock

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/daemon.go:43-53`
- failure mode: After `Close` unlocks the file, a new daemon can acquire the same inode; the old owner then removes the pathname. A third daemon can create a new inode and acquire it while the second daemon still runs, leaving two daemons sharing the runtime home, SQLite database, and IPC paths.
- evidence or reproduction: `Close` calls `unlockRuntimeFile` at lines 47-48, closes the descriptor, then unconditionally calls `os.Remove(o.path)` at lines 51-53. The lock implementation protects the open inode, not the pathname. A barrier between unlock and remove reproduces the replacement-then-unlink sequence.
- fix direction: Keep the lock held while removing or conditionally unlink only the exact inode owned by this descriptor, and make close idempotent. Add a barrier-based three-starter test proving a replacement owner cannot have its lock path removed by the prior owner.

### CR-151 Windows hook authorization rejects quoted paths containing spaces

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/admission.go:158-165`
- failure mode: A normal Git for Windows hook installed below a path such as `C:\Users\A User\...` cannot obtain a token because the command line is split into fields before comparing against the full hook path. The advertised Windows gate therefore rejects ordinary pushes for common user and repository paths.
- evidence or reproduction: `windowsProcessCommandLine` appends the quoted command line to the executable name at `processinfo_windows.go:25-30,41-47`; `commandHasExecutable` then calls `strings.Fields` and compares each fragment to `expected` at `admission.go:158-164`. The full quoted hook path is split at the space and never equals the expected cleaned path. The executable-hook test still skips Windows at `internal/daemon/hook_e2e_test.go:21-24`.
- fix direction: Parse Windows command lines with quote-aware rules or compare normalized command-line substrings against the expected hook path without tokenizing it away. Add a Windows runtime hook test using a temporary path containing spaces.

### CR-152 Existing-gate rollback leaves per-worktree configuration and stamp state

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/gate/gate.go:28-61`
- failure mode: If existing-gate repair fails after hook-path isolation or stamp creation, rollback restores only `config` and files currently enumerated under `hooks`. It leaves `config.worktree`, `safety-dance-gate-config`, newly created hook files, file modes, and other per-worktree settings from the failed repair. A subsequent gate operation can use a partially repaired gate despite `Init` returning an error.
- evidence or reproduction: `snapshotGate` records only `dir/config` and existing hook files at lines 33-50; `restore` removes only paths marked missing and rewrites saved files with mode `0600` at lines 54-61. `provisionGate` mutates worktree configuration and the stamp at `gate.go:250-261`, while `InitWithFork` invokes this snapshot only for an existing gate at lines 177-187. Injecting failure after `EnsureHooksPathIsolation` leaves state not represented by the snapshot.
- fix direction: Journal the complete gate metadata touched by repair, including `config.worktree`, the config stamp, hook modes and newly created files, then restore bytes, modes, and absence for every journaled path on all existing-gate failures. Add injected failures after each repair write.

### CR-153 Status omits terminal branches when another branch is active

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/status.go:27-49`
- failure mode: If branch A has an active run, `GetActiveRuns` is nonempty and the fallback that appends latest terminal history never executes. Status then omits failed, cancelled, or published runs for branch B, so durable inspection remains incomplete whenever work is concurrent.
- evidence or reproduction: Lines 27-30 fetch active runs; lines 31-49 query terminal history only inside `if len(runs) == 0`. The TUI is branch-specific and does not repair the global `status` command. Create one active run and one terminal run in different branches, then run `safety-dance status`; only the active branch is printed.
- fix direction: Merge active and latest-terminal records per repository/branch, retaining active records over terminal ones for the same key. Add a multi-branch status test with one active and one terminal run.

### CR-154 Concurrent notification delivery can start the same accepted push twice

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/admission.go:289-308`
- failure mode: Two post-receive notifications for the same token can both pass the receipt lookup, both invoke `a.notify`, and both create or replace a branch run before either deletes the receipt. The persisted receipt is intended to make notification replay-safe, but this check-then-use race permits duplicate pipeline execution and cancellation.
- evidence or reproduction: `notifyPush` unlocks at line 295, invokes the run-start callback at lines 296-299, then reacquires the mutex and deletes at lines 301-308. Run two calls concurrently with a blocking callback; both observe the receipt at lines 289-294 and enter the callback. Existing admission tests cover matching and replay but not concurrent delivery.
- fix direction: Atomically claim the receipt before invoking the callback, persist an in-flight/claimed state, and finalize or release it according to callback success. Add a concurrent duplicate-notification test that requires exactly one callback and preserves retry behavior after a failed callback.

## Advisories

### ADV-001 The Go module graph is untidy

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `tools/safety-dance/go.mod:5`
- evidence: The prior review's `go mod tidy -diff` reported unused direct and indirect dependencies and version rewrites.
- suggestion: Run `go mod tidy`, regenerate `THIRD_PARTY_NOTICES.md`, and rerun release packaging and the full Go suite after imported integrations settle.

## Dead Code and Dependency Review

- newly orphaned code: no task-caused production code was proven unreachable; the test-only helpers and generated-output checks remain referenced by their tests or build targets
- dependency findings: ADV-001 records the untidy Go graph; no new Node dependency was added

## Verdict

- decision: request_changes
- overall code-health change: The repair pass closes several trust-boundary and recovery defects, but lock ownership, Windows admission, gate rollback, concurrent status visibility, and notification idempotency remain incomplete.
- rationale: CR-150 through CR-154 each leave a major failure mode in a stated runtime guarantee. The local race suite does not cover these interleavings or the Windows runtime path.

## Review Limits

- blocked or unavailable checks: no pull request title or body; no hosted `safety-dance-v*` run; no authorized live-provider run; no real Windows runtime session; typed-judgment performance coverage remained unclear on both passes and was skipped
- residual manual verification: exercise Windows hook admission and service lifecycle on Windows, run the lock and notification barriers, inject each existing-gate repair failure, and verify concurrent multi-branch status output
