---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: eb4182ad9368e69cc8f5e47994ec87bef73790f8
status: findings
summary: "Review of the complete 146-commit Safety Dance change found twelve major failures in hook authorization and receipt custody, recovery locks, custom-gate rollback, ref identity, durable step replay, publication mode, service lifecycle, and release validation. CR-268 remains open, CR-269 and CR-270 remain incomplete, and the next fix round must close these production paths with handler-level, crash-point, restart, custom-location, platform-command, and version-boundary regressions."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` against `origin/main`
- reviewed HEAD: `eb4182ad9368e69cc8f5e47994ec87bef73790f8`
- commits: 146 commits from `447be09` through `eb4182a`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: all 81 task artifacts and the two task-owned untracked paths; review covered the 229 product files in `origin/main...HEAD`

## Previous Round

- previous artifact: `79-code-review-safety-dance.md`; dispositions checked against `80-code-review-fixes-safety-dance.md` and the current diff
- CR-266 Post-receive capture recovery cannot authenticate the accepted update: fixed
- CR-267 Empty receipt locks can be stolen from a live creator: fixed
- CR-268 Receipt mutation methods omit managed-hook authorization: still open
- CR-269 Fresh wizard setup has no gate rollback: still open
- CR-270 Custom gate ownership is neither idempotent nor removable: still open
- CR-271 Removal recovery deletes a still-running worktree: fixed
- CR-272 Default-home worktree journals are placed outside startup's scan: fixed
- CR-273 Bootstrap replacement can truncate the trusted policy: fixed
- CR-274 Daemon restart uninstalls the persistent service: fixed
- CR-275 Compact TUI shortcuts perform the wrong actions: fixed
- CR-276 Documented plain mode does not exist: fixed
- CR-277 Default typed validation rejects every ordinary agent: fixed
- CR-278 Trusted no-CI repositories time out instead of completing: fixed
- CR-279 Generated plugin metadata is outside identity enforcement: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced local Git gate under the independent Safety Dance identity without source-product references outside the preserved license
- implementation source: `05-plan-safety-dance.md`; required invariants include managed-hook admission, durable accepted-update custody, full-ref branch coordination, replay-safe recovery, correct normal-versus-lease publication, one owned service per runtime home, reversible setup, and semantic release tags
- repository instructions: root `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed-file conventions enforced by `scripts/validate.mjs`

## Change Profile

- intent and expected behavior: add the Safety Dance Go tool, authenticated local bare-gate workflow, durable validation and publication daemon, operator interfaces, canonical skill distribution, identity enforcement, and native release workflow
- change description quality: no pull request exists, so there is no PR title or body; the 146 focused Conventional Commit subjects and task artifacts record intent, decisions, evidence, and limits
- implementation model and review model: implementation model not recorded in the selected implementation summary; review model `GPT-5.6 Sol`, with three read-only `agent-codebase-analyzer` passes on the same pinned diff
- changed-line size and logical cohesion: 229 product files, 39,166 insertions, and 4 deletions; the change is one product import but remains too large to validate through aggregate success alone
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines, `internal/scm/github/github.go` 1,490, `internal/agent/agent.go` 1,353, `internal/db/run.go` 1,148, and `internal/cli/daemon.go` 939; the findings show lifecycle and policy ownership is still spread across these large modules
- dependency or lockfile changes: new pinned Go module and 120-line `go.sum`; dependencies match the CLI, TUI, YAML, and SQLite implementation, and this review found no lockfile or license blocker beyond the release-version contract below

## Tests Reviewed First

- behavior claimed by tests: admission token binding and replay rejection, hook receipt locking, gate initialization and eject, daemon recovery, publication ordering, service install/stop, wizard compensation, TUI controls, identity scanning, native packaging, and the full Node/Go aggregate
- missing or misleading coverage: handler tests use an ordinary IPC client for receipt mutation; no test covers final `notifyPush` save failure, a creator crash before lock PID publication, custom-gate compensation/eject, colliding full refs, stable step fingerprints after a modifying-step restart, publication argument selection through `executeRun`, exact platform restart arguments, colliding runtime-home service identities, or semantic-version boundaries

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5923` in / `73` out; second pass after the first pass marked performance unclear

### Correctness

- assessment and evidence: the aggregate passes, but receipt deletion can be lost in memory after persistence failure, abandoned lock creation can block every later push, custom-gate cleanup leaves state behind, ref normalization aliases distinct refs, recovery changes completed-step fingerprints, fast-forward publication selects the rewrite path, service restart commands do not restart all active services, and release validation accepts invalid versions
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: control flow is locally readable, but `internal/cli/daemon.go` owns notification normalization, worktree creation, configuration pinning, pipeline construction, recovery inputs, and publication request selection in one 939-line file; the ref, replay, and publication findings are consequences of those mixed responsibilities
- helper coverage: covered, level 2, confidence 0.80

### Architecture

- assessment and evidence: the daemon admission owner correctly centralizes receipt state, but only token issuance uses its managed-hook authorization boundary; custom gate ownership is represented indirectly by a symlink and rollback callbacks do not retain the moved target, while service identity uses lossy path normalization
- helper coverage: covered, level 3, confidence 0.81

### Security

- assessment and evidence: `admit`, `revoke`, and `notifyPush` accept any authenticated same-user IPC peer with a matching token instead of requiring managed-hook ancestry, and the post-receive capture fallback interpolates client-controlled push options into `sh -c`
- helper coverage: covered, level 3, confidence 0.74

### Performance

- assessment and evidence: no performance finding remains after inspecting the long-lived paths: receipt lock acquisition stops after 300 attempts at `internal/git/hook.go:51-59`, reconciliation snapshots the receipt map before external work at `internal/daemon/admission.go:87-150`, and CI polling exits on cancellation or its configured deadline at `internal/pipeline/steps/ci.go:34-80`; the diff adds no unbounded query, loop, or hot-path allocation beyond those bounded operations
- helper coverage: covered, level 3, confidence 0.97

## Verification Story

- command or inspection: `git diff --check origin/main...HEAD -- . ':(exclude).agents/tasks' && npm test`
- result: passed product diff checks, validation, plugin synchronization, 136 Node tests, identity scanning, all Go tests under the race detector, `go vet`, temporary binary build, and 2 release-contract tests; the unscoped `git diff --check` separately reports trailing whitespace in excluded task artifact `02-research-local-git-gate.md`
- manual, screenshot, or before-and-after evidence: no new manual or screenshot evidence; verification artifact `16-verification-safety-dance.md` records the earlier built-binary operator flow, while hosted Windows, provider, and release execution remain unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-280 Receipt mutations still bypass managed-hook authorization

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:318-416`
- failure mode: any authenticated same-user IPC peer that obtains a receipt token can admit, revoke, or notify an update without being a managed receive-hook descendant, so it can consume or cancel the hook's durable authorization and start notification before Git completes the accepted mutation
- evidence or reproduction: only `issue` calls `managedHookPeer`; `admit` authenticates the bearer token, while `revoke` and `notifyPush` check only for a positive peer PID. `admission_test.go:121-174` performs all three mutations through an ordinary IPC client rather than a managed-hook process.
- fix direction: enforce `managedHookPeer(ipc.PeerPID(ctx), p.Gate)` in all three handlers and replace the direct-client success cases with an executable managed-hook fixture plus ordinary-peer rejection cases

### CR-281 Notification persistence failure drops live receipt custody

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/admission.go:425-435`
- failure mode: after the notification callback succeeds, a failed receipt-file write removes the receipt from the running daemon's map, so reconciliation cannot retry it until a process restart reloads the older file
- evidence or reproduction: `notifyPush` deletes `receipts[token]` and `claimed[token]` before `saveReceipts` and returns the error without restoring either. `ReconcileOnce` already restores the receipt on the same failure at `admission.go:131-147`, but `admission_test.go:74-92` covers only that reconciliation path.
- fix direction: restore the accepted receipt and release its claim when the final save fails, matching `ReconcileOnce`, and add a direct notification save-failure regression

### CR-282 Capture fallback executes client push options through a shell

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/git/hook.go:145-155`
- failure mode: when post-receive cannot create its input file, a push option containing shell metacharacters is interpolated into an `args` string and executed by `sh -c` under the receiving user's account
- evidence or reproduction: Git push options are appended without shell quoting at line 153 and the assembled string is passed to `sh -c` at line 154. The normal path at lines 174-188 already uses quoted positional parameters and does not have this defect.
- fix direction: remove `sh -c`; build the fallback invocation with `set --` and append every gate, ref, revision, token, and push option as a separately quoted argument

### CR-283 A crash before lock PID publication blocks later pushes

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/git/hook.go:51-61`
- failure mode: if the hook exits after creating `.safety-dance-receipts.lock` but before writing `pid`, every later hook treats the empty lock as live, waits about 30 seconds, and fails closed forever
- evidence or reproduction: the revised lock loop explicitly makes an empty or nonnumeric owner non-stale, and no later process can distinguish an abandoned empty directory from the short publication window. `hook_test.go:50-58` asserts only that a live creator is not stolen and has no crash-point case.
- fix direction: publish ownership atomically or use recoverable ownership metadata that distinguishes an in-progress live creator from an abandoned lock, then add a crash-between-`mkdir`-and-PID regression

### CR-284 Custom gates survive both failed setup and eject

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/wizard.go:163-190`; `tools/safety-dance/internal/gate/gate.go:430-437`
- failure mode: wizard compensation removes only the default symlink after moving a fresh gate to a custom directory, and eject calls `os.Remove` on the non-empty custom bare repository and ignores the failure; both paths leave the operator-selected gate behind after claiming rollback or removal
- evidence or reproduction: the rollback returned before the custom move retains only `bareDir == p.RepoDir(id)`, while the wizard later renames that directory and creates a symlink. Eject resolves the symlink target but uses `os.Remove(target)` instead of removing the owned directory tree. Existing eject tests cover only the default location.
- fix direction: make the gate owner record the resolved custom target in its rollback/eject transaction, remove the owned bare repository with checked errors, and add fresh-custom compensation and custom-eject tests

### CR-285 Failed database rollback destroys resources referenced by the surviving row

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/gate/gate.go:274-289`
- failure mode: if `DeleteRepo` fails during fresh initialization rollback, the callback still restores the remote and deletes the bare gate, leaving a database row that points at resources it just destroyed
- evidence or reproduction: the rollback stores the first database error but continues through `restoreRemote`, `gateBefore.restore`, and `os.RemoveAll(bareDir)` before returning it; no injected `DeleteRepo` failure test covers the resulting split state
- fix direction: stop destructive cleanup when database deletion fails or persist a recoverable rollback journal that coordinates the row and filesystem changes, then test the database failure path

### CR-286 Branch keys alias distinct full Git refs

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:568-610`
- failure mode: branch `refs/heads/refs/tags/x` and tag `refs/tags/x` both persist as `refs/tags/x`, allowing one ref update to resume or supersede the other's run and target the wrong ref class during publication
- evidence or reproduction: hooks admit every non-deletion ref, but `recordPush` strips `refs/heads/` before `GetRunByLaunchNonce`, `Manager.Active`, `AcceptedRef`, and `BranchKey`. The plan requires coordination by repository plus full ref, while manager tests bypass `recordPush` and supply full refs directly.
- fix direction: preserve the canonical full ref through accepted refs, runs, and `BranchKey`; convert CLI short names only at the CLI boundary and test colliding branch/tag spellings

### CR-287 Restart changes completed-step fingerprints and replays work

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:819-865`
- failure mode: after a modifying step advances HEAD, daemon restart rebuilds every core-step fingerprint from the new run head, resets previously completed steps whose stored input used the old head, and reruns agent-backed or non-idempotent work
- evidence or reproduction: all registrations capture the initial `run.HeadSHA` at line 821, while each completed step persists the new head at lines 850-855. Recovery loads that new head; `pipeline/runner.go:131-143` resets the completed step and every following step when the fingerprint changes. The restart test proves callback resumption but not completed-step reuse after a HEAD-changing step.
- fix direction: persist and reconstruct each step's actual pre-step input head or derive step-specific inputs from durable predecessor outputs, then add a restart test that changes HEAD and asserts completed steps are not invoked again

### CR-288 Normal fast-forward publication is forced through the rewrite path

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:778-799`
- failure mode: when the live upstream still equals the run base, the daemon marks the request as a rewrite and uses `--force-with-lease` for an ordinary fast-forward, so servers that reject force-style pushes reject valid publication and the required normal-versus-rewrite distinction is not enforced
- evidence or reproduction: `Rewrite` is true exactly when `verifiedHead == run.BaseSHA`; `pipeline/steps/push.go:43-50` maps that flag directly to explicit force-with-lease. Package success tests construct `PushRequest` directly with `Rewrite` unset and do not exercise request construction through `executeRun`.
- fix direction: determine whether the candidate descends from the verified live head and use a normal push for that case; reserve explicit lease publication for an authorized non-fast-forward rewrite and assert the generated Git arguments through the daemon path

### CR-289 Platform restart commands do not restart an active service

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/service.go:298-315`
- failure mode: macOS `launchctl kickstart` lacks `-k`, so an already-running daemon is not terminated before start; Windows only invokes `schtasks /Run`, which starts a task but does not stop and replace an active instance
- evidence or reproduction: the new `Restart` method dispatches those commands directly, and `service_test.go:24-41` records only executable names for install and stop. It has no restart test or platform argument assertion.
- fix direction: use the platform's real restart sequence while preserving the owned definition, including `launchctl kickstart -k` on macOS and an owned end-then-run sequence on Windows, with complete command-argument tests

### CR-290 Runtime-home service identities are collision-prone

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/service.go:39-40,85-100`
- failure mode: distinct homes such as `/a-b/c` and `/a/b-c` normalize to the same service label and Linux unit filename, so the second runtime home cannot install its required daemon or lifecycle commands can address the wrong home
- evidence or reproduction: labels and filenames replace separators and punctuation with `-` without a collision-resistant suffix; installation then rejects the colliding definition because its embedded home differs. Tests cover one home only.
- fix direction: include a stable digest of the canonical runtime home in the label and definition filename, preserving platform length rules, and test two roots that collide under the current normalization

### CR-291 Release validation accepts versions outside SemVer

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `.github/workflows/safety-dance-release.yml:22-28`; `tools/safety-dance/scripts/package-release.sh:12-18`
- failure mode: tags such as `safety-dance-v01.2.3` are accepted and published even though SemVer forbids leading zeroes, while valid prerelease or build metadata is rejected by the workflow
- evidence or reproduction: the workflow accepts three unrestricted digit groups and the packager checks only three nonempty dot-separated numeric fields. `tests/safety-dance-release.test.mjs` asserts trigger and matrix shape but no accepted/rejected version boundary.
- fix direction: use one SemVer-compliant validator for the stripped tag and package version, then add leading-zero, prerelease, build-metadata, and malformed-version cases

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: no unpinned direct module or unexplained lockfile mutation found; dependency notices and imported MIT notice are present, but release-version validation remains a gate finding

## Verdict

- decision: request_changes
- overall code-health change: the feature adds substantial tested behavior, but required trust, durability, rollback, ref-identity, publication, service, and release invariants remain unsatisfied
- rationale: twelve major findings remain in production paths despite a green aggregate; three continue previous-round findings and several are not exercised by the current tests

## Review Limits

- blocked or unavailable checks: no pull request title/body or hosted pull-request CI run exists; hosted Windows service execution, live provider behavior, hosted `safety-dance-v*` release execution, and induced process/OS crash evidence remain unavailable
- residual manual verification: re-run built-binary gate, custom-gate rollback/eject, daemon restart after a HEAD-changing step, platform service restart, and hosted release flows after the findings are fixed
