---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: b606cce05d2263e00577f1e9b722adf59023ceff
status: findings
summary: "Review of the complete 140-commit Safety Dance change found nine major failures in receipt recovery, post-receive custody, lock recovery, worktree cleanup, bootstrap policy, custom worktree recovery, wizard behavior, compact TUI output, and command documentation. The next fix round must close CR-257 through CR-265 with production-path regressions before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` (`origin/main`)
- reviewed HEAD: `b606cce05d2263e00577f1e9b722adf59023ceff`
- commits: 140 commits after the merge base; all subjects pass `npm run check-commits -- origin/main..HEAD`.
- staged and unstaged changes: none.
- task-owned untracked files: 284 files below `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: task artifacts and the two task-owned untracked evidence directories were excluded as review subjects.

## Previous Round

- previous artifact: `75-code-review-safety-dance.md`
- CR-247 Receipt removal still reports failed rewrites as success: still open
- CR-248 Reconciliation retries one failed receipt forever: fixed
- CR-249 Default worktree journals are written outside the startup scan: fixed
- CR-250 Bootstrap trust is global, permanent, and repository-unbound: fixed
- CR-251 Pre-receive accepts updates after custody writes fail: fixed
- CR-252 Successful completion becomes terminal before cleanup is journaled: still open
- CR-253 The setup wizard omits required gate and provider choices: still open
- CR-254 Narrow rendering hides the action required to continue a run: still open
- CR-255 Shipped sources still name the repository being removed: fixed
- CR-256 Empty-lock recovery can create two concurrent receipt owners: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate as a fully renamed product with no source-repository references.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; latest implementation receipt `26-implementation-safety-dance.md`; latest fix receipt `76-code-review-fixes-safety-dance.md`.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and changed-file package conventions.

## Change Profile

- intent and expected behavior: add the Safety Dance Go binary, authenticated local Git gate, durable branch-scoped daemon, fixed validation and guarded publication pipeline, operator interfaces, canonical skill distribution, identity checks, and native release packaging.
- change description quality: no pull request exists. The 140 commit subjects pass the repository checker, but there is no pull-request body for the 38,979-line product change.
- implementation model and review model: implementation receipts record agent-assisted iterations; review model `GPT-5.6 Sol` with three scoped implementation-review workers.
- changed-line size and logical cohesion: 229 non-task files, 38,979 additions and 4 deletions. The change is one product, but its trust, persistence, interface, distribution, and release responsibilities remain too large for one normal review unit.
- resulting large-file concerns: the full diff retains the large owners recorded in the prior review. The new failures again cross generated hook strings and the daemon runner, where receipt and cleanup protocols are difficult to verify locally.
- dependency or lockfile changes: the Go graph remains pinned in `go.sum`; no new dependency defect was established in this round.

## Tests Reviewed First

- behavior claimed by tests: the latest fix adds bounded receipt reconciliation, default-root journal recovery, repository-scoped bootstrap policy, compact rendering, identity scanning, and shell-text custody assertions. `16-verification-safety-dance.md` records the earlier locally decidable checks as passing, and `76-code-review-fixes-safety-dance.md` records `npm test` plus the full internal Go suite passing.
- missing or misleading coverage: shell tests inspect generated text instead of executing write and revocation failures; policy tests call `Store` before `Resolve`; cleanup tests do not interrupt the success path between status and journal; compact tests replace production strings with `approve` and `y/n`; no test covers a feature-branch wizard, repeated-wizard compensation, a committed-policy direct init, an orphan empty lock, a failed post-receive capture, or a configured root below an ancestor named `worktrees`.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5239` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 5239 in / 73 out`

### Correctness

- assessment and evidence: CR-257 through CR-265 show accepted refs can lose their run, valid setup paths can reject policy, terminal runs can strand worktrees, required wizard choices remain inert, and compact output hides production actions.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: receipt ownership still spans two generated shell hooks and daemon JSON state. Worktree journal ownership is inferred from path spelling, and bootstrap lifecycle state is split among checkout files, repository IDs, marker files, and wizard compensation. These duplicated protocols caused CR-257 through CR-263.
- helper coverage: covered, level 3, confidence 0.61

### Architecture

- assessment and evidence: the receipt protocol needs one recoverable lock and durable state transition, worktree journals need an explicit root, and bootstrap policy needs one atomic repository-bound lifecycle. Current ownership depends on shell timing, path component names, and which setup command ran first.
- helper coverage: covered, level 3, confidence 0.90

### Security

- assessment and evidence: repository binding and source-identity scanning improved, but CR-261 can reject or delete trusted bootstrap state based on checkout position and setup history. No direct authorization bypass or retained source identity was found.
- helper coverage: covered, level 2, confidence 0.79

### Performance

- assessment and evidence: bounded reconciliation fixes the prior tight loop. CR-259 replaces the race with a persistent empty-lock condition that makes each later receive hook wait about 30 seconds before failing; no other concrete hot-path defect was established.
- helper coverage: covered, level 2, confidence 0.72

## Verification Story

- command or inspection: `cd tools/safety-dance && go test -race ./internal/git ./internal/daemon ./internal/worktrees ./internal/policy ./internal/cli ./internal/tui`; `npm run check-commits -- origin/main..HEAD`; `git diff --check origin/main...HEAD -- ':!.agents/tasks/**'`; retired-identity scan; complete diff, fix range, callers, and changed tests inspected.
- result: focused race tests passed, 140 commit subjects passed, diff checks passed, and the direct retired-identity search returned no product match. Those checks do not exercise the nine failure paths below.
- manual, screenshot, or before-and-after evidence: no hosted Windows run, live-provider run, hosted release, pull-request CI run, or interactive narrow-terminal capture exists. Static traces establish the findings.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-257 Failed receipt cleanup still poisons the next identical push

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/git/hook.go:78`
- failure mode: when a preserved pre-receive hook rejects a push, daemon revocation can succeed while the local receipt rewrite fails. The stale revoked token remains before the token from a later identical accepted push, so post-receive selects the revoked token and no durable run starts.
- evidence or reproduction: `revoke_accepted` revokes the daemon receipt before `remove_receipt` at lines 78-90. A later push appends its token at lines 111-114, while post-receive selects the first old/new/ref match at lines 160-164. Returning the rewrite failure does not remove or skip that stale first record.
- fix direction: make local and daemon revocation recover as one state transition, or make post-receive select and validate the newest matching live receipt. Add an executable rejected-push test that forces rewrite failure and then repeats the same update successfully.

### CR-258 Post-receive capture failure loses an accepted update

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/git/hook.go:145`
- failure mode: after Git accepts the ref, failure to create or populate the post-receive input file exits zero without logging and without marking the daemon receipt accepted. Reconciliation ignores the receipt, so the accepted ref never creates a run.
- evidence or reproduction: `mktemp` and `cat` failures at lines 145-153 return success. `Admission.ReconcileOnce` selects only receipts whose `Accepted` field is true at `internal/daemon/admission.go:98-102`, and only `notifyPush` sets that field.
- fix direction: notify or durably mark the accepted receipt without a temporary input file, log every post-receive failure, and add an executable disk/write-failure regression that proves eventual run creation.

### CR-259 A crash before lock-owner publication permanently blocks pushes

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/git/hook.go:51`
- failure mode: a hook that dies after creating `.safety-dance-receipts.lock` but before writing `pid` leaves an empty lock directory. Every later pre- and post-receive hook treats the empty owner as live, waits for 300 intervals, and cannot recover the gate.
- evidence or reproduction: both lock implementations classify an empty or nonnumeric owner as `stale=0` at lines 53-61 and 151. Only a process with `LOCK_OWNED=1` removes the directory, so a crashed creator leaves no cleanup path.
- fix direction: use an operating-system lock or an acquisition protocol whose owner identity is published atomically and whose stale state can be proven. Execute a regression that kills the creator between acquisition and publication and then admits another push.

### CR-260 Successful runs still become terminal before cleanup is journaled

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:242`
- failure mode: a crash after `RunCompleted` persists but before the removal journal is written leaves a terminal run's worktree registered and on disk with no startup cleanup record.
- evidence or reproduction: the success branch transitions at lines 243-247 and calls `journalCleanup` only at lines 248-250. The error branch journals first at lines 235-240, which is the required order.
- fix direction: write removal intent before every terminal transition, then clear the journal only after Git removal. Add a crash-point recovery test between journal creation, terminal persistence, and removal.

### CR-261 Bootstrap policy lifecycle rejects valid setup and deletes prior trust

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/policy/bootstrap.go:32`
- failure mode: bootstrap policy works only when the wizard runs from the upstream default revision and has already created the bootstrap directory. A repeated wizard failure can also delete the repository's prior bootstrap instead of restoring it.
- evidence or reproduction: the wizard binds policy to the checkout's current `HEAD` at `internal/cli/wizard.go:135-144`, but admission compares it with the fetched upstream default revision at `internal/cli/daemon.go:493-523`. `Resolve` writes a retirement marker without creating its parent at `bootstrap.go:33-38`, while `Paths.EnsureDirs` omits `bootstrap/` at `internal/paths/paths.go:145-162`. A rerun overwrites the bootstrap and compensation removes it unconditionally at `wizard.go:135-164`.
- fix direction: bind bootstrap to the fetched trusted default revision, create and atomically update the repository policy directory, and restore pre-existing bootstrap and retirement state during reverse compensation. Cover feature-branch setup, direct init with committed policy, and failed repeated setup.

### CR-262 Custom worktree-root recovery still depends on a path component name

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/worktrees/ownership.go:29`
- failure mode: for a configured root such as `/x/worktrees/team`, journal creation chooses `/x/worktrees/.safety-dance-journals`, but startup scans `/x/worktrees/team/.safety-dance-journals`. A crash before ownership persistence leaves the worktree undiscovered.
- evidence or reproduction: `metadataDir` walks backward to the first ancestor component named `worktrees` at lines 29-39. Startup scans each configured root directly at `internal/cli/daemon.go:420-460`. The new regression covers only the default `$SD_HOME/worktrees` root.
- fix direction: pass the selected journal root explicitly from the worktree layout owner instead of inferring it from a directory name. Test a configured root nested below an ancestor named `worktrees`.

### CR-263 Wizard gate and provider choices remain fixed-value prompts

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/wizard.go:89`
- failure mode: the wizard now asks for gate and provider, but accepts only `github` and `default` or the already-derived repository directory. It does not persist either value or apply either to gate or SCM construction.
- evidence or reproduction: lines 89-97 validate fixed values, generated configuration at lines 107-117 contains only commands and `allow_repo_commands`, and `gate.InitWithRollback` receives the unchanged runtime paths at line 123. This does not satisfy the plan's collection and application contract.
- fix direction: persist and apply supported provider and custom gate selections through their owning configuration, database, gate, and SCM layers, with built-command cancellation, rollback, and idempotent-rerun tests.

### CR-264 Compact rendering still hides production actions

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/tui/view.go:52`
- failure mode: an eight-column terminal shows `respons…` and `approve…`, hiding the required response context and three of four actions.
- evidence or reproduction: production supplies `response required for <step>` and `approve, fix, skip, abort` at `internal/cli/tui.go:68-90`. `Render` removes labels at small widths but still truncates every value at `view.go:52-63`. The new test substitutes short values `approve` and `y/n` at `view_test.go:30-39`.
- fix direction: render width-aware action tokens or wrap actionable values without truncating them. Add compact and wide golden tests using the production waiting model and assert semantic equivalence with plain output.

### CR-265 Public command documentation omits wizard and TUI

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `tools/safety-dance/docs/cli.md:3`
- failure mode: operators cannot discover the setup wizard or interactive TUI from the command reference, contrary to the accepted requirement to document every public command.
- evidence or reproduction: the root registers `wizard` and `tui` at `internal/cli/root.go:62-67`; `docs/cli.md:3-9` lists neither, and no tool-local document contains those command names.
- fix direction: document both commands, their mutation and terminal behavior, and the wizard's supported choices and rollback limits.

## Advisories

### ADV-001 Cancelled recovery reports an unpublished cancellation as failed

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:638`
- evidence: when the live remote differs from the reviewed candidate, `recoverCancelledPublication` returns an ordinary error at lines 638-649. The runner can replace the persisted cancelled state with failed at lines 210-240.
- suggestion: return a typed unpublished-cancellation result, retain `RunCancelled`, clear `push_active`, and cover pre-push cancellation restart.

## Dead Code and Dependency Review

- newly orphaned code: `wizard.Model.Gate` and `wizard.Model.Provider` are prompted but still do not control production behavior; CR-263 covers them.
- dependency findings: dependencies remain pinned and notices remain generated; no additional dependency finding was established.

## Verdict

- decision: request_changes
- overall code-health change: the fix round closes bounded reconciliation, default journal placement, identity scanning, and repository binding, but trusted custody, crash cleanup, setup, and compact operator behavior remain incomplete.
- rationale: nine major findings can suppress durable runs for accepted refs, permanently block gate pushes, strand terminal worktrees, reject or delete trusted setup state, omit required configuration behavior, and hide or omit operator actions.

## Review Limits

- blocked or unavailable checks: hosted Windows service and command execution, authorized live-provider behavior, hosted `safety-dance-v*` release execution, hosted pull-request CI, and interactive terminal capture were unavailable. No pull request exists, so no title or body was reviewed.
- residual manual verification: after fixes, force receipt rewrite and post-receive capture failures, kill a lock creator before owner publication, interrupt successful cleanup, run wizard setup from a feature branch and as a repeated transaction, recover a nested custom worktree root, and inspect the production waiting view at narrow widths.
