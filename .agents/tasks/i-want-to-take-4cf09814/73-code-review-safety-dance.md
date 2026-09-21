---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: a1fa55a2251d8ac0af542e551508233df6fb33ac
status: findings
summary: "Review of the complete 128-commit Safety Dance change found seven major failures in command-policy trust, receive-hook custody, reconciliation claims, worktree-journal discovery, and Windows command execution. The next fix round must close CR-240 through CR-246 and add production-path regressions before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `a1fa55a2251d8ac0af542e551508233df6fb33ac`
- commits: 128 commits from `2aa346a` through `a1fa55a`; no pull request exists, so `origin/main` is the default-branch target.
- staged and unstaged changes: none.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: task artifacts and the two task-owned untracked directories were excluded from product review.

## Previous Round

- previous artifact: `71-code-review-safety-dance.md`
- CR-231 Cancelled recovery can publish an unpushed candidate: fixed
- CR-232 Manual runs silently omit configured custom gates: fixed
- CR-233 Explicit-token pushes leave stale receipt custody: fixed
- CR-234 Interrupted receipt locking can block every later push: still open
- CR-235 Fresh wizard output cannot drive the first pipeline: still open
- CR-236 Failed receipt revocation can resurrect a rejected update: still open
- CR-237 Receipt reconciliation blocks unrelated admissions: fixed
- CR-238 Startup misses durable worktree cleanup journals: still open
- CR-239 Windows custom gates start suspended and never resume: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently branded, behavior-preserving import of the referenced local Git gate.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; `16-verification-safety-dance.md` records all locally decidable acceptance items as passing at `49c6c2d`, while hosted release and live-provider evidence remain deferred.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed-file contracts in the plan.

## Change Profile

- intent and expected behavior: add the Safety Dance Go tool, authenticated local Git gate, durable branch-scoped pipeline, guarded publication, operator interfaces, canonical skill distribution, identity checks, and native release contract.
- change description quality: commit subjects pass the repository check, but no pull request title or body exists. The latest fix receipt overstates closure of CR-234, CR-235, CR-236, and CR-238.
- implementation model and review model: implementation model not recorded; review model `GPT-5.6 Sol`.
- changed-line size and logical cohesion: excluding task artifacts, 227 files add 38,556 lines and delete 4. The change is one product import, but its size requires trust-boundary review by subsystem.
- resulting large-file concerns: `internal/config/config.go` exceeds 3,000 lines and several imported agent, database, Git, and SCM files exceed 1,000 lines; the findings below concern runtime boundaries rather than file-size preference.
- dependency or lockfile changes: new `tools/safety-dance/go.mod` and `go.sum`; the generated `THIRD_PARTY_NOTICES.md` covers the imported Go dependency graph. No Node lockfile changed.

## Tests Reviewed First

- behavior claimed by tests: authenticated hook admission, replay and mismatch rejection, branch replacement, worktree ownership, fixed pipeline ordering, guarded push and binding, wizard compensation, TUI semantics, installer distribution, identity scanning, and release packaging. The verification artifact records nine repository checks, 136 Node tests, Go race, vet, build checks, and a manual built-binary flow as passing.
- missing or misleading coverage: commit `3afd8a8` changes five production files but no test file. Production uses stored admission receipts, while hook and admission tests use the in-memory owner; no test exercises reconciliation callback failure, durable revoke failure, concurrent identical pushes, stale receipt-lock recovery, wizard-to-first-run policy, a runtime home containing `worktrees`, or Windows core validation commands.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5223` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 5223 in / 73 out`

### Correctness

- assessment and evidence: the focused race suite passes, but the production paths can discard or replay receipt custody, strand claims and worktree journals, and leave a fresh wizard-created run without commands. Windows core validation still invokes a shell that Windows does not provide.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: receipt ownership is split between a shell file and daemon JSON. The shell lock has duplicated compact implementations, and both cleanup paths omit the lock's PID file. Policy bootstrap also changes the meaning of `trustedConfig` by assigning it pushed content.
- helper coverage: covered, level 2, confidence 0.65

### Architecture

- assessment and evidence: the pushed branch now decides whether its own command configuration is trusted, contrary to `RepoConfig.AllowRepoCommands` ownership. Journal placement still derives its owner by searching path components, and admission reconciliation claims the full receipt set before processing one callback.
- helper coverage: covered, level 3, confidence 0.77

### Security

- assessment and evidence: `AllowRepoCommands` is documented as trusted-default-branch-only, but execution accepts the flag from the pushed branch when the default branch lacks a config. Failed receipt revocation can also leave a rejected update eligible for later reconciliation.
- helper coverage: covered, level 3, confidence 0.69

### Performance

- assessment and evidence: no N+1 query or unbounded data-processing regression was confirmed. A dead receipt lock forces every later hook to wait 30 seconds and then fail, while a reconciliation callback error permanently excludes unrelated claimed receipts from later retries.
- helper coverage: covered, level 2, confidence 0.52

## Verification Story

- command or inspection: `cd tools/safety-dance && go test -race ./internal/cli ./internal/daemon ./internal/git ./internal/worktrees ./internal/e2e && go vet ./...`; `git diff --check origin/main...HEAD -- ':!.agents/tasks/**'`; complete fix diff and production callers inspected against `origin/main`.
- result: the focused race suite, vet, and product diff check passed. A direct shell reproduction confirmed that `rmdir` cannot remove the stale lock while its `pid` file remains. Passing tests do not exercise the seven production failures below.
- manual, screenshot, or before-and-after evidence: `16-verification-safety-dance.md` records a passing local built-binary flow at `49c6c2d`; no hosted Windows service, live-provider, or hosted release evidence exists.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-240 Stale receipt locks still cannot be recovered

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/git/hook.go:49`
- failure mode: a hook terminated while holding the receipt lock leaves `pid` inside the lock directory. Every later receive hook waits 30 seconds and then rejects or drops notification, so the gate remains unusable until a person deletes the lock.
- evidence or reproduction: signal cleanup calls `rmdir "$LOCK"` without removing `$LOCK/pid` (`hook.go:49`, `hook.go:137`). Stale-owner recovery does the same (`hook.go:56`, `hook.go:139`). `rmdir` fails on the non-empty directory; a direct reproduction returned status 1 and left the lock in place. A process killed between `mkdir` and writing `pid` leaves an empty owner field that the recovery loop never treats as stale.
- fix direction: remove the owned PID file before `rmdir`, recover empty or malformed stale locks, and add an executable-hook test that terminates the lock owner and proves a later push proceeds.

### CR-241 Wizard bootstrap lets a pushed branch self-authorize commands

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/daemon.go:699`
- failure mode: when the upstream default branch lacks `.safety-dance.yaml`, any pushed branch can set `allow_repo_commands: true` and make its command and agent selection trusted. The actual wizard file is uncommitted, so the first run created immediately after setup still sees no commands and fails.
- evidence or reproduction: `config.RepoConfig.AllowRepoCommands` says the value is read only from the trusted default-branch copy (`internal/config/config.go:273-279`). The new fallback instead assigns `trustedConfig = pushedConfig` when the pushed copy opts itself in (`daemon.go:699-703`). The wizard writes the file in the working tree (`wizard.go:96-106`), but `safety-dance run` resolves `HEAD` and creates a detached worktree at that commit (`run.go:34`, `daemon.go:313`), so an uncommitted wizard file is absent from the first run.
- fix direction: establish a separate reviewed bootstrap trust record or commit and publish trusted default-branch policy before setup reports success. Never derive the opt-in from the pushed copy. Cover clean wizard setup, immediate first run, and an untrusted branch carrying `allow_repo_commands: true`.

### CR-242 Failed durable revocation can still resurrect a rejected update

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/git/hook.go:75`
- failure mode: when daemon receipt deletion cannot be persisted after a user hook rejects the push, the shell ignores the revocation error and deletes its local receipt. The daemon and on-disk JSON retain the rejected receipt, which can start a run later if the ref reaches the same SHA through another update.
- evidence or reproduction: the daemon now restores its in-memory receipt on persistence failure (`internal/daemon/admission.go:343-352`), but `revoke_accepted` still uses `revoke-push-receipt ... || true` and unconditionally calls `remove_receipt` (`hook.go:75-76`). Reconciliation starts any retained receipt whose current ref equals its proposed new SHA (`admission.go:105-118`). A temporary stored-receipt reproduction with forced persistence failure and restart invoked the rejected token's callback.
- fix direction: make revocation failure fail closed with recoverable custody and mark the receipt rejected durably before removing shell state. Add a persistence-failure, restart, and later-matching-ref regression.

### CR-243 One reconciliation error permanently claims unrelated receipts

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/admission.go:89`
- failure mode: one callback or persistence error prevents every later receipt in the same batch from being retried. Their tokens remain claimed, so direct notification reports "already being processed" and later reconciliation skips them forever.
- evidence or reproduction: `ReconcileOnce` marks every unclaimed token before processing any one (`admission.go:89-97`). It returns on the first callback error (`admission.go:118-122`) or receipt-save error (`admission.go:125-130`) without releasing claims for the unvisited suffix. A two-receipt reproduction with the first callback failing left the second claimed after three reconciliation calls.
- fix direction: claim one receipt at a time, release every claim on all exits, and continue independent receipts after one failure while returning an aggregate error. Test multiple repositories and branches with callback and persistence failures.

### CR-244 A failed concurrent ref update can still launch a run

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/admission.go:105`
- failure mode: two concurrent pushes of the same new branch can both receive durable admission receipts before Git updates the ref. If one Git update wins and the other fails, reconciliation sees the winner's SHA and launches the failed push's separate token as though Git accepted it.
- evidence or reproduction: pre-receive persists a receipt before ref mutation (`internal/git/hook.go:96-101`). A failed Git update has no post-receive callback and no path that revokes that receipt. Reconciliation treats `current == receipt.New` as proof of acceptance (`admission.go:105-118`), which cannot distinguish two tokens for the same old/new/ref tuple. A real concurrent temporary-repository reproduction admitted both tokens, consumed the winner, and left the loser eligible against the live SHA.
- fix direction: make post-receive durably mark a token as accepted before notification and reconcile only accepted markers. Do not infer acceptance from ref equality alone. Add concurrent identical-ref pushes where one update fails.

### CR-245 Worktree journal discovery still depends on the first `worktrees` path component

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/worktrees/ownership.go:17`
- failure mode: if `SD_HOME` itself is below a directory named `worktrees`, a default worktree's journals are written outside the daemon's scanned default root. A crash leaves the detached worktree registered and on disk. Terminal removal journals under a removed custom root are also omitted because startup queries only pending and running placements.
- evidence or reproduction: for `SD_HOME=/tmp/worktrees/sd`, the default placement is below `/tmp/worktrees/sd/worktrees`, but `metadataDir` stops at the first matching component and writes under `/tmp/worktrees/.safety-dance-journals` (`ownership.go:17-29`). Startup scans `/tmp/worktrees/sd/worktrees` (`internal/cli/daemon.go:419`) and adds derived roots only for `ActiveRunWorktreesOutside`, which excludes default placements and terminal runs (`daemon.go:433-446`, `internal/db/run.go:261-273`).
- fix direction: pass the layout-owned root into journal creation and persist or index every journal root. Recover removal journals from terminal placements as well as active creation journals. Test an `SD_HOME` and a custom root whose ancestors contain `worktrees`, plus a terminal removal interrupted after configuration changes.

### CR-246 Windows core validation still hard-codes `sh`

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:207`
- failure mode: Windows runs fail at the first configured prepare, rebase, test, format, or lint command when `sh` is absent. These core commands also bypass the process-tree cancellation wrapper used by the repaired custom-gate path.
- evidence or reproduction: `Validate` still constructs `exec.CommandContext(ctx, "sh", "-c", command)` and calls `cmd.CombinedOutput` directly (`validation.go:207-210`). Commit `3afd8a8` makes only custom gates select `cmd.exe` and `shellenv.CombinedOutputShellCommand` (`internal/cli/daemon.go:771-780`). Existing hook end-to-end tests skip Windows, and no Windows core-command execution test exists.
- fix direction: route core validation and custom gates through one platform-aware command constructor and the same process-tree lifecycle helper. Add Windows execution and cancellation tests for a core command and a custom gate.

## Advisories

### ADV-001 Cancelled recovery reports an unpublished cancellation as failed

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:635`
- evidence: cancelled recovery now refuses to publish when the remote differs from the reviewed candidate, but it returns an error. The manager callback maps any error without a cancelled context to `RunFailed` (`daemon.go:229-239`), replacing the persisted cancelled status rather than clearing publication ownership and preserving cancellation.
- suggestion: make cancelled reconciliation return a typed unpublished-cancellation result that clears `push_active`, retains `RunCancelled`, and permits normal worktree cleanup. Add a restart regression for the pre-push cancellation case.

## Dead Code and Dependency Review

- newly orphaned code: none confirmed. `RunWorktreesOutside` remains unused; `ActiveRunWorktreesOutside` now has a caller but cannot find the terminal and default-root journal cases in CR-245.
- dependency findings: the new Go dependency graph is pinned in `go.sum`, legal notices are generated, and no concrete maintenance, license, or known-vulnerability defect was established in this review.

## Verdict

- decision: request_changes
- overall code-health change: Safety Dance adds the requested product and broad local checks, but its trust, receipt, recovery, and Windows execution boundaries remain unsafe on production paths.
- rationale: seven major findings allow pushed policy to become trusted, rejected or failed updates to launch runs, unrelated receipts to become permanently claimed, receive hooks to remain locked, worktrees to escape recovery, and Windows core validation to fail.

## Review Limits

- blocked or unavailable checks: hosted Windows service and command execution, authorized live-provider behavior, hosted `safety-dance-v*` release execution, and a hosted pull-request CI run were unavailable. No pull request exists, so no title or body could be reviewed.
- residual manual verification: after fixes, run a built-binary wizard-to-first-push flow, concurrent identical-ref pushes, durable receipt write failures, interrupted receipt locks, custom-root crash cleanup, cancelled pre-push recovery, and Windows core plus custom-gate execution.
