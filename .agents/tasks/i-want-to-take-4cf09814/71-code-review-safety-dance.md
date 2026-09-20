---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 0369fd99aa6e4a2bcf2aecac71c0f299903571a6
status: findings
summary: "Review of the complete 125-commit Safety Dance change found nine critical or major failures in cancelled publication recovery, gate-policy pinning, receipt custody, wizard setup, admission concurrency, worktree recovery, and Windows custom-gate execution. The next fix round must close CR-231 through CR-239 and add production-path regressions before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `0369fd99aa6e4a2bcf2aecac71c0f299903571a6`
- commits: 125 commits from `2aa346a` through `0369fd9`; no pull request exists, so `origin/main` is the default-branch target.
- staged and unstaged changes: none.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: task artifacts and the two task-owned untracked directories were excluded from product review.

## Previous Round

- previous artifact: `69-code-review-safety-dance.md`
- CR-226 Cancelled publication recovery performs later side effects and never cleans up: still open
- CR-227 Wizard initialization errors can still eject an existing gate: fixed
- CR-228 Custom-gate policy is not pinned when the run is created: still open
- CR-229 Custom gates bypass nested-run isolation: fixed
- CR-230 Rejected and concurrent receive hooks can corrupt durable receipt custody: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently branded, behavior-preserving import of the referenced local Git gate.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; all locally decidable items in `16-verification-safety-dance.md` were recorded as passing at `49c6c2d`, while hosted release and live-provider evidence remain deferred.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed-file contracts in the plan.

## Change Profile

- intent and expected behavior: add the Safety Dance Go tool, authenticated local Git gate, durable branch-scoped pipeline, guarded publication, operator interfaces, canonical skill distribution, identity checks, and native release contract.
- change description quality: commit subjects pass the repository check, but no pull request title or body exists. The latest fix receipt overstates CR-226, CR-228, and CR-230 closure.
- implementation model and review model: implementation model not recorded; review model `GPT-5.6 Sol`.
- changed-line size and logical cohesion: excluding task artifacts, 227 files add 38,473 lines and delete 4. The change is one product import, but its size requires trust-boundary review by subsystem.
- resulting large-file concerns: `internal/config/config.go` is 3,137 lines and several imported agent, database, Git, and SCM files exceed 1,000 lines; the confirmed findings are boundary failures rather than size preferences.
- dependency or lockfile changes: new `tools/safety-dance/go.mod` and `go.sum`; the dependency notice generator and `THIRD_PARTY_NOTICES.md` cover the imported Go dependency surface. No Node lockfile changed.

## Tests Reviewed First

- behavior claimed by tests: authenticated hook admission, replay and mismatch rejection, branch replacement, worktree ownership, fixed pipeline ordering, guarded push and binding, wizard compensation, TUI semantics, installer distribution, identity scanning, and release packaging. The verification artifact records nine repository checks, 136 Node tests, Go race/vet/build checks, and a manual built-binary flow as passing.
- missing or misleading coverage: commit `59e0948` added no regression tests for cancelled publication recovery, fresh-run gate pinning, explicit-token receipt cleanup, multi-ref rejection, concurrent hooks, or stale receipt locks. `make e2e` builds the binary but tests package entry points rather than driving the built command through init, hooks, IPC, durable completion, and ref inspection.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5338` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 5338 in / 73 out`

### Correctness

- assessment and evidence: cancelled recovery can publish a candidate that never reached the remote, manual runs drop configured gates, explicit-token receipts remain stale, the setup wizard produces command configuration that trusted-policy selection discards, and custom gates cannot complete on Windows. These contradict the plan's cancellation, pinned-policy, setup, and platform contracts.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: the latest fix introduces separate policy-pinning behavior for hook notifications but leaves the fresh-run caller on an implicit empty-policy default. Receipt ownership is split between shell files and daemon JSON, and the shell protocol removes records by ref tuple rather than token, which obscures its one-use invariant.
- helper coverage: covered, level 2, confidence 0.56

### Architecture

- assessment and evidence: gate policy is not owned by the common run-creation boundary, reconciliation invokes run replacement while holding the admission-wide mutex, and startup ignores the database queries intended to locate durable worktree placements. These ownership splits cause CR-232, CR-237, and CR-238.
- helper coverage: covered, level 3, confidence 0.81

### Security

- assessment and evidence: peer and ancestry checks are present on mutation paths, nested custom gates now receive `SD_PARENT_RUN_ID`, and URLs are redacted before persistence. Receipt revocation can nevertheless leave a rejected update durable and later start it when the ref reaches the same SHA, so the admission proof is not fail-closed under persistence failure.
- helper coverage: covered, level 3, confidence 0.54

### Performance

- assessment and evidence: no N+1 query or unbounded data-processing regression was confirmed. Admission reconciliation holds one global mutex across Git commands, run cancellation, and an unbounded runner join, while shell receipt locks wait forever; either path can stop unrelated pushes rather than applying bounded backpressure.
- helper coverage: covered, level 3, confidence 0.80

## Verification Story

- command or inspection: `cd tools/safety-dance && go test -race ./internal/cli ./internal/db ./internal/git ./internal/daemon ./internal/pipeline/... ./internal/e2e/... && go vet ./...`; complete diff and production callers inspected against `origin/main`.
- result: the focused race suite and vet passed. Passing checks do not cover the nine production failure paths below.
- manual, screenshot, or before-and-after evidence: `16-verification-safety-dance.md` records a passing local built-binary flow at `49c6c2d`; no hosted Windows service, live-provider, or hosted release evidence exists.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-231 Cancelled recovery can publish an unpushed candidate

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:601`
- failure mode: restarting a cancelled run with `push_active` publishes its reviewed candidate when the remote still has the pre-push head, despite cancellation requiring that candidate not be published.
- evidence or reproduction: `recoverCancelledPublication` reads the current remote head and passes it as `VerifiedHead` to `steps.Publish` (`daemon.go:609-619`). For a cancelled, push-active run whose remote still equals the old base, `Publish` clears the interrupted claim because live equals `VerifiedHead`, reacquires the claim, and calls `Push` (`internal/pipeline/steps/push.go:103-153`). The explicit lease then publishes the cancelled candidate. No regression test calls this recovery path.
- fix direction: give cancelled recovery a reconciliation-only operation: bind and mirror only when the remote already equals the candidate; otherwise clear ownership and preserve cancellation without executing a push.

### CR-232 Manual runs silently omit configured custom gates

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:283`
- failure mode: `safety-dance run` creates a run with an empty pinned gate list, so configured custom gates never execute for the public manual-run path.
- evidence or reproduction: the fresh-run handler constructs `db.AcceptedRef` without `GatesJSON` (`daemon.go:315-316`); `CreateRunFromAccepted` converts that absence to `[]` (`internal/db/runs.go:43-52`); execution treats the array as authoritative and registers no custom-gate steps (`daemon.go:691-713`). Only receive-hook notification calls `pinGatesForAdmission`.
- fix direction: move effective gate-policy resolution into the common run-creation boundary or explicitly pin the same trusted policy before every `Manager.Replace` caller; test manual and hook-created runs against one configured gate.

### CR-233 Explicit-token pushes leave stale receipt custody

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/git/hook.go:88`
- failure mode: every successful push that supplies `safety-dance-token` leaves its gate-local receipt behind. A later identical ref tuple can select the consumed stale token, delete the valid token, and lose notification after Git has accepted the update.
- evidence or reproduction: pre-receive appends every admitted token to `RECEIPTS` (`hook.go:88-91`), but post-receive removes a receipt only inside the `token == empty` branch (`hook.go:132-144`). Lookup chooses the first matching old/new/ref record and removal deletes all matching records, without matching the token (`hook.go:137-140`).
- fix direction: atomically consume the exact token record for both explicit and generated tokens; include the token in removal identity and retain a valid receipt when notification fails so daemon reconciliation can retry it.

### CR-234 Interrupted receipt locking can block every later push

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/git/hook.go:47`
- failure mode: a killed hook or host interruption while holding `.safety-dance-receipts.lock` leaves the directory behind, and every later pre-receive and post-receive process waits forever.
- evidence or reproduction: both generated hooks acquire the lock through an unbounded `while ! mkdir; sleep 1` loop and release it only on the normal path (`hook.go:47-59`, `hook.go:124-142`). Neither records an owner, bounds acquisition, recovers stale ownership, nor traps termination. Creating the lock directory before a push deterministically wedges pre-receive at lines 89-91.
- fix direction: use a bounded, ownership-aware lock with trap cleanup and stale-owner recovery, or move receipt custody into the already serialized daemon instead of coordinating a mutable shell file.

### CR-235 Fresh wizard output cannot drive the first pipeline

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/wizard.go:79`
- failure mode: the bare-command setup wizard writes eight validation commands only to the working tree, but the first run discards them when the upstream default branch has no trusted `.safety-dance.yaml`; command-backed stages then fail as unconfigured.
- evidence or reproduction: the wizard writes a local commands-only file and initializes the gate without committing or publishing it (`wizard.go:79-113`). Admission and execution fetch trusted policy from the upstream default branch (`daemon.go:463-494`, `daemon.go:658-687`), and `EffectiveRepoConfig` replaces pushed commands with empty commands unless trusted policy opts in (`internal/config/config.go:2615-2644`). `Validate` rejects the resulting empty command (`internal/pipeline/steps/validation.go:194-206`).
- fix direction: make setup establish a trusted default-branch policy before claiming success, or store a reviewed local trust record with explicit provenance; add a clean-repository wizard-to-first-push test.

### CR-236 Failed receipt revocation can resurrect a rejected update

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:305`
- failure mode: if durable receipt removal fails after a user hook rejects a push, daemon restart can restore the rejected receipt and later launch it when the ref legitimately reaches the same SHA.
- evidence or reproduction: `revoke` deletes the in-memory receipt before `saveReceipts` and does not restore it on persistence failure (`admission.go:316-325`). The shell ignores revoke errors and removes its local record (`internal/git/hook.go:60-66`). The unchanged JSON is loaded on restart, and `ReconcileOnce` invokes the notification callback whenever the ref equals the rejected receipt's `New` SHA (`admission.go:87-108`).
- fix direction: make durable receipt deletion transactional from the caller's perspective: restore in-memory state on save failure, fail the hook with recoverable custody intact, and test disk-write failure followed by restart and a later matching ref.

### CR-237 Receipt reconciliation blocks unrelated admissions

- type: Refactor suggestion
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/admission.go:87`
- failure mode: one slow or stuck same-branch replacement during periodic reconciliation holds the admission-wide mutex, blocking admit, notify, and revoke operations for every repository and branch.
- evidence or reproduction: `ReconcileOnce` holds `a.mu` across Git inspection, `a.notify`, and receipt persistence (`admission.go:89-108`). The production callback reaches `manager.Replace`, which cancels and waits for the prior runner without a timeout (`internal/daemon/manager.go:79-88`). The ordinary notification path already demonstrates the safer claim-under-lock, callback-outside-lock pattern (`admission.go:352-380`).
- fix direction: claim one receipt under the mutex, release the mutex for Git and run-start work, then reacquire it to commit or release the claim; bound cancellation waits and continue reconciling unrelated receipts.

### CR-238 Startup misses durable worktree cleanup journals

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:399`
- failure mode: removing a custom worktree root from configuration after a crash, or using a root whose path itself contains a `worktrees` component, leaves pending/removal journals undiscovered and detached worktrees permanently registered and on disk.
- evidence or reproduction: startup scans only the default and currently configured roots (`daemon.go:409-439`). Journal placement instead selects the first path component named `worktrees` (`internal/worktrees/ownership.go:17-29`), so `/mnt/worktrees/team` writes under `/mnt/worktrees/.safety-dance-journals` while startup scans `/mnt/worktrees/team/.safety-dance-journals`. The database exposes `RunWorktreesOutside` and `ActiveRunWorktreesOutside` specifically to recover paths removed from configuration (`internal/db/run.go:237-273`), but neither function has a caller.
- fix direction: derive recovery roots from durable run placements plus configured roots, and make journal placement depend on the layout owner rather than string-searching path components; test edited configuration and roots containing `worktrees`.

### CR-239 Windows custom gates start suspended and never resume

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:738`
- failure mode: on Windows, a custom gate either cannot find hard-coded `sh` or starts suspended and never resumes, so the advertised Windows pipeline cannot complete when custom gates are configured.
- evidence or reproduction: the custom-gate runner constructs `sh -c`, calls `shellenv.ConfigureShellCommand`, then calls `cmd.CombinedOutput` directly (`daemon.go:740-746`). On Windows, configuration adds `CREATE_SUSPENDED`; only `StartShellCommand` assigns the job and resumes the process, and the package explicitly requires `CombinedOutputShellCommand` for one-shot commands (`internal/shellenv/shell_command_windows.go:47-69`, `113-135`).
- fix direction: use the platform-aware shell command constructor and `shellenv.CombinedOutputShellCommand`; add a Windows runtime test that executes and cancels a custom gate rather than relying on cross-compilation.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: `db.RunWorktreesOutside` and `db.ActiveRunWorktreesOutside` have no callers despite comments naming daemon startup as their owner; this is part of CR-238 rather than a separate finding.
- dependency findings: the new Go dependency graph is pinned in `go.sum`, legal notices are generated, and no concrete maintenance, license, or known-vulnerability defect was established in this review.

## Verdict

- decision: request_changes
- overall code-health change: Safety Dance adds the requested product surface and extensive checks, but its cancellation, admission, recovery, setup, and Windows invariants remain unsafe on production paths.
- rationale: CR-231 can publish a cancelled candidate. Eight major findings can skip required gates, lose or resurrect admission receipts, wedge pushes, strand worktrees, or make supported setup and Windows custom gates fail.

## Review Limits

- blocked or unavailable checks: hosted Windows service execution, authorized live-provider behavior, hosted `safety-dance-v*` release execution, and a real concurrent-hook interruption run were unavailable. No pull request exists, so no title or hosted CI result could be inspected.
- residual manual verification: after fixes, run a built-binary setup-to-publish flow, concurrent and interrupted receive hooks, cancelled pre-push restart recovery, custom-root crash recovery, and Windows custom-gate execution.
