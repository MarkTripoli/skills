---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 4a4891c5dfb3c3b362076fb9bddae7dc416f1437
status: findings
summary: "Review of the complete 143-commit Safety Dance change found fourteen major failures in accepted-push recovery, receipt locking and authorization, wizard and custom-gate transactions, worktree recovery, bootstrap durability, service restart, TUI controls, plain output, default validation, no-CI handling, and identity scanning. The next fix round must close CR-266 through CR-279 with production-path regressions before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `4a4891c5dfb3c3b362076fb9bddae7dc416f1437`
- commits: 143 commits after the merge base; 308 files changed, 50,694 insertions, and 4 deletions.
- staged and unstaged changes: none.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: task artifacts and workflow evidence were excluded from product review. No unrelated tracked working-tree change was present.

## Previous Round

- previous artifact: `77-code-review-safety-dance.md`
- CR-257 Failed receipt cleanup still poisons the next identical push: fixed
- CR-258 Post-receive capture failure loses an accepted update: still open
- CR-259 A crash before lock-owner publication permanently blocks pushes: still open
- CR-260 Successful runs still become terminal before cleanup is journaled: still open
- CR-261 Bootstrap policy lifecycle rejects valid setup and deletes prior trust: fixed
- CR-262 Custom worktree-root recovery still depends on a path component name: fixed
- CR-263 Wizard gate and provider choices remain fixed-value prompts: fixed
- CR-264 Compact rendering still hides production actions: fixed
- CR-265 Public command documentation omits wizard and TUI: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced repository's behavior as independently branded Safety Dance with no product references to the source.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`.
- repository instructions: root `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and changed-file conventions. The review also used the passing items table in `16-verification-safety-dance.md`; that receipt covers revision `49c6c2d`, not the current HEAD.

## Change Profile

- intent and expected behavior: add a local authenticated Git gate, durable branch runs, fixed validation and guarded publication, operator interfaces, one canonical agent skill, identity enforcement, and native releases under the Safety Dance namespace.
- change description quality: there is no pull request. Commit subjects pass the repository convention according to the verification receipt, but no PR body records the 50,694-line behavior, decisions, evidence, or remaining platform limits.
- implementation model and review model: implementation model not recorded; review model `GPT-5.6 Sol` with four focused implementation-review workers.
- changed-line size and logical cohesion: the change is one product but spans 308 files and 50,698 changed lines. Repeated review rounds narrowed the current risk to production lifecycle and trust-boundary paths.
- resulting large-file concerns: `internal/config/config.go`, `internal/agent/agent.go`, `internal/scm/github/github.go`, `internal/db/run.go`, and `internal/cli/daemon.go` exceed roughly 900 lines. The concrete findings below identify ownership failures rather than treating file length alone as a blocker.
- dependency or lockfile changes: the new Go module pins its direct and indirect dependencies in `go.mod` and `go.sum`, includes the imported MIT license, and generates `THIRD_PARTY_NOTICES.md`. No root Node dependency changed.

## Tests Reviewed First

- behavior claimed by tests: authenticated hook admission, receipt replay rejection, run replacement and recovery, guarded publication, gate rollback, worktree journals, service definitions, wizard compensation ordering, TUI width bounds, identity scanning, release packaging, installer distribution, and aggregate race/build checks.
- missing or misleading coverage: hook capture failures are inspected as strings instead of executed; the receipt lock test does not pause a live creator before PID publication; wizard tests mock `Write` rather than exercising fresh or custom gate rollback; cleanup recovery has no active-run crash point; default-home journal tests set `SD_HOME`; TUI tests do not execute compact shortcuts; default typed validation and trusted `no_ci` paths are not covered; the identity test does not exercise production root selection.

## Five-Axis Assessment

- helper axis-coverage: unavailable
- helper provenance: `judge: model jev-1.13.0, tokens 5800 in / 73 out`; performance returned `unclear`, so every helper coverage field remains unavailable and the reviewer decided each axis directly.

### Correctness

- assessment and evidence: CR-266, CR-269 through CR-278 show accepted updates, setup transactions, recoverable worktrees, installed services, operator controls, and ordinary validation can fail despite passing focused suites.
- helper coverage: unavailable

### Readability and Simplicity

- assessment and evidence: the main flows have named owners, but custom gate ownership is split between `cli/wizard.go` and `gate/gate.go`, and journal-root inference is split between environment state and path shape. Those splits cause CR-269, CR-270, and CR-272.
- helper coverage: unavailable

### Architecture

- assessment and evidence: receipt authorization is enforced only at token issuance, custom gate location is not owned by the gate package, cleanup journals do not carry run-state recovery policy, and service restart mixes persistent and ad-hoc lifecycle paths. CR-268 through CR-274 identify the resulting boundary failures.
- helper coverage: unavailable

### Security

- assessment and evidence: CR-268 allows any same-user IPC peer holding a receipt token to revoke or consume an admitted update, including a nested validation descendant. CR-267 permits concurrent receipt writers after unsafe lock reclamation.
- helper coverage: unavailable

### Performance

- assessment and evidence: no critical or major performance regression was found. Polling loops are bounded or cancellable, branch coordination is keyed, and the reviewed fixes do not add an unbounded hot-path operation.
- helper coverage: unavailable

## Verification Story

- command or inspection: reviewed `origin/main...HEAD`, all changed-file names and statistics, prior finding dispositions, production callers and tests; ran `go test -race ./internal/git ./internal/cli ./internal/worktrees ./internal/policy ./internal/config ./internal/tui ./internal/wizard ./internal/daemon`.
- result: the focused race command passed. Static production-path traces still reproduce the fourteen findings because the passing tests do not execute those failure paths.
- manual, screenshot, or before-and-after evidence: no new UI screenshot or hosted proof was produced. `16-verification-safety-dance.md` records built-binary and local end-to-end evidence at older revision `49c6c2d`; hosted release and live-provider evidence remain unavailable.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-266 Post-receive capture recovery cannot authenticate the accepted update

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/git/hook.go:146`
- failure mode: when post-receive cannot create its input file, an ordinary accepted push is never converted into a durable run.
- evidence or reproduction: the fallback at lines 146-157 forwards only user push options and does not read the daemon-issued token from `.safety-dance-receipts`. Ordinary pushes receive that token inside pre-receive, so `notifyPush` rejects the fallback at `internal/daemon/admission.go:396-397`. A failure while copying into an opened file only logs and exits at `hook.go:166-168`.
- fix direction: add a recovery path that verifies matching persisted receipts against live gate refs, handles both capture-failure branches without shell reconstruction, and prove it with an executable hook test.

### CR-267 Empty receipt locks can be stolen from a live creator

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/git/hook.go:49`
- failure mode: a hook paused after `mkdir` but before writing `pid` loses its lock after five seconds; when it resumes, it can overwrite the new owner's PID and mutate receipts concurrently.
- evidence or reproduction: both hook lock implementations reclaim an empty lock solely by directory age at lines 49-65 and 164-165. Process liveness is unknowable until the PID is published, and the existing test checks rendered strings rather than the interleaving.
- fix direction: use an atomic owner-bearing or operating-system lock primitive and test a live creator paused immediately after acquisition.

### CR-268 Receipt mutation methods omit managed-hook authorization

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:318`
- failure mode: a same-user process that reads a pending receipt token can revoke or consume it without managed-hook ancestry. A nested validation descendant can cause an accepted push to lose its durable run.
- evidence or reproduction: token issuance checks `managedHookPeer` at lines 299-315, but admission relies only on token authentication and revoke/notify require only a positive peer PID at lines 318-379. Receipt tokens are written to the gate receipt file by `internal/git/hook.go:109-115`; an early forged notification can return success on a live-ref mismatch and then delete the receipt.
- fix direction: require managed-hook ancestry for admission, revocation, and notification, and replace direct-client success tests with executable managed-hook tests.

### CR-269 Fresh wizard setup has no gate rollback

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/gate/gate.go:267`
- failure mode: bootstrap or service installation failure after a fresh setup leaves the database registration, bare gate, and `safety-dance` remote while the wizard reports failure and removes configuration.
- evidence or reproduction: fresh `InitWithRollback` returns a nil rollback at lines 267-278. `runWizard` stores only that callback at `internal/cli/wizard.go:129-130`, while setup invokes compensation after service failure at `internal/wizard/setup.go:95-100`.
- fix direction: return a bounded fresh-init rollback that deletes the inserted row and created gate and restores the managed remote; test the real service-failure path.

### CR-270 Custom gate ownership is neither idempotent nor removable

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/wizard.go:163`
- failure mode: rerunning the wizard against its existing custom gate fails, and eject removes only the stable symlink while leaving the real bare repository behind.
- evidence or reproduction: wizard setup rejects any existing custom target at lines 163-180. The gate owner does not persist that location; `gate.Eject` calls `os.RemoveAll` on the stable path at `internal/gate/gate.go:419-425`, which removes a symlink rather than its target.
- fix direction: make the gate package own and persist the resolved location, accept an existing owned target during repair, and delete or restore that target during eject and compensation.

### CR-271 Removal recovery deletes a still-running worktree

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:247`
- failure mode: a crash after cleanup journaling but before the running-to-completed transition leaves a running run whose worktree startup recovery deletes unconditionally.
- evidence or reproduction: the runner journals removal before the status transition at lines 247-251. Startup protects active worktrees only from pending recovery, then calls `RecoverRemoving` at lines 409-465; `internal/worktrees/ownership.go:218-240` removes every recorded worktree without checking run status.
- fix direction: bind removal journals to run identity and skip active or recoverable owners until their terminal transition is durable; add the exact crash-point regression.

### CR-272 Default-home worktree journals are placed outside startup's scan

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/worktrees/ownership.go:17`
- failure mode: with the normal default `~/.safety-dance` and no explicit `SD_HOME`, interrupted creation or cleanup journals under a repository subdirectory are never discovered at restart.
- evidence or reproduction: `metadataDir` recognizes the shared default root only when `SD_HOME` is set. A default worktree `<home>/worktrees/<repo>/<run>` therefore journals under `<home>/worktrees/<repo>/.safety-dance-journals`, while startup scans `<home>/worktrees/.safety-dance-journals`. Existing durability tests set `SD_HOME` and use a shallower run path.
- fix direction: pass the selected journal root from the worktree layout instead of deriving it from environment state and path shape; test the real default-home depth with `SD_HOME` unset.

### CR-273 Bootstrap replacement can truncate the trusted policy

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/policy/bootstrap.go:21`
- failure mode: a crash during wizard bootstrap replacement can truncate the prior trusted policy and block future admissions; in-process compensation cannot restore state after process death.
- evidence or reproduction: `Store` writes directly to the final bootstrap path with `os.WriteFile` at lines 21-32. The wizard snapshots the prior bytes only for its live compensation callback.
- fix direction: write and sync a mode-0600 temporary file in the same directory, close it, and atomically rename it over the destination; add an interrupted-write regression.

### CR-274 Daemon restart uninstalls the persistent service

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:48`
- failure mode: `safety-dance daemon restart` removes an installed launchd, systemd, or Task Scheduler definition and replaces it with an unmanaged child that will not restart after logout or reboot.
- evidence or reproduction: restart calls `stopDaemon` then `startDaemon` at lines 48-55. `stopDaemon` calls `stopInstalledService` at lines 146-160, and `Service.Stop` disables and removes the owned definition at `internal/daemon/service.go:251-294`; `startDaemon` only launches `daemon serve` with `exec.Command`.
- fix direction: detect installed-service ownership and restart it through the service owner, preserving the definition and runtime-home binding; keep ad-hoc restart separate.

### CR-275 Compact TUI shortcuts perform the wrong actions

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/tui/view.go:23`
- failure mode: compact output advertises `a/f/s/x`, but pressing `a` aborts the run and the other advertised keys do nothing.
- evidence or reproduction: `compactLines` emits `a/f/s/x` at lines 23-28. `App.Run` maps `a` to abort and accepts only full words for approve, fix, and skip at `internal/tui/app.go:106-123`.
- fix direction: map the displayed keys to approve, fix, skip, and abort consistently and run them through a waiting-model integration test.

### CR-276 Documented plain mode does not exist

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/root.go:62`
- failure mode: scripts following the documentation receive `unknown flag: --plain` instead of forced ANSI-free one-shot output.
- evidence or reproduction: the root and TUI command register no `plain` flag at `root.go:62-67` and `internal/cli/tui.go:17-25`, while `tools/safety-dance/docs/cli.md` directs users to `--plain` and the plan requires explicit plain selection.
- fix direction: register `--plain` on the applicable command path and force `tui.Plain` even when attached to a terminal; add CLI parsing and terminal-mode tests.

### CR-277 Default typed validation rejects every ordinary agent

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:160`
- failure mode: the default configuration fails its first typed validation step before invoking the selected agent.
- evidence or reproduction: `Typed` always calls `EnsureGateNeutralized`. Supported adapters report neutralization only when `disable_project_settings` is true, while `internal/config/config.go:327-337` defines that setting as an opt-out whose default is false. Adapter comments state the gate should consult the capability only under the opt-out.
- fix direction: require neutralization only when the trusted policy enables `disable_project_settings`, and add a production `Typed` test for the default false path.

### CR-278 Trusted no-CI repositories time out instead of completing

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/ci.go:50`
- failure mode: a trusted repository configured with `no_ci: true` and no provider checks polls until timeout after publication.
- evidence or reproduction: `internal/config/config.go:338-347` promises that zero checks pass when `NoCI` is true. The CI loop handles only nonempty check lists at lines 50-67 and never reads `cfg.NoCI`.
- fix direction: mark CI ready when the trusted merged config has `NoCI` and the provider returns zero checks; test true and false cases.

### CR-279 Generated plugin metadata is outside identity enforcement

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `scripts/check-safety-dance-identity.mjs:17`
- failure mode: a retired product command or module identity in committed `.claude-plugin/plugin.json` passes the aggregate identity check.
- evidence or reproduction: the plan explicitly includes generated plugin metadata, but `shippedRoots` omits `.claude-plugin` and production scanning visits only that list at lines 30-45. Fixture tests scan arbitrary directories and do not exercise production root selection.
- fix direction: include `.claude-plugin/plugin.json` in production roots and add a root-selection regression.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none proven. The custom gate target becomes orphaned through CR-270, but it remains live repository state rather than dead source code.
- dependency findings: dependencies are pinned and third-party notices are generated. No separate critical or major maintenance, license, or lockfile finding was proven.

## Verdict

- decision: request_changes
- overall code-health change: the change adds the intended product and broad regression coverage, but ordinary validation, accepted-update recovery, setup rollback, restart recovery, and operator controls still violate the plan's trust and durability boundaries.
- rationale: fourteen critical-path defects remain. Passing aggregate and focused race checks do not exercise their production failure scenarios.

## Review Limits

- blocked or unavailable checks: no pull request exists; hosted release, live provider, real Windows service execution, and real crash interruption were not run. TypeSafe axis judgments were skipped because the performance row returned `unclear`; the reviewer decided all five axes directly.
- residual manual verification: after fixes, exercise real post-receive capture failure, a paused receipt-lock creator, fresh and repeated custom-gate wizard failure, crash between cleanup journal and terminal transition, installed-service restart, compact key input, `--plain`, default typed validation, and trusted `no_ci` behavior.
