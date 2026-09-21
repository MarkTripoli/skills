---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: a26eb10b08ba20c3f0d85e0d40cc49fdb1ecc924
status: findings
summary: "Review of the 79-commit Safety Dance change found that production still publishes after placeholder validation, Darwin descendants can bypass the nested-run fence, and accepted-push, supersession, service, Windows, policy, response, credential, identity, and release boundaries retain critical or major failures. The next fix round must connect the actual validation owners and close every recorded trust, durability, platform, and distribution finding before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `a26eb10b08ba20c3f0d85e0d40cc49fdb1ecc924`
- commits: 79 commits after `origin/main`; no pull request exists, so the task branch commit subjects and artifact summaries supplied change intent.
- staged and unstaged changes: none.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: all committed and untracked `.agents/tasks/` artifacts were context, not review subjects; the two untracked task-owned paths were preserved.

## Previous Round

- previous artifact: `39-code-review-safety-dance.md`
- CR-061 Production runs cannot pass the fixed pipeline: still open
- CR-062 Darwin skips the nested-validation ancestry fence: still open
- CR-063 A newer accepted push can wait behind publication of the older run: still open
- CR-064 Trusted configuration read failures are treated as no policy: fixed
- CR-065 Wizard rollback leaves the origin rewrite behind: fixed
- CR-066 Windows service management can overwrite and delete a foreign task: still open
- CR-067 The Windows release cannot admit pushes or mutate runs: still open
- CR-068 The planned custody owner is orphaned: fixed
- CR-069 Service definitions do not encode valid paths: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; acceptance and safety boundaries are specified in `05-plan-safety-dance.md`.
- implementation source: `05-plan-safety-dance.md`, `26-implementation-safety-dance.md`, `16-verification-safety-dance.md`, and the latest fix receipt `40-code-review-fixes-safety-dance.md`.
- repository instructions: root and worktree `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and changed-file conventions.

## Change Profile

- intent and expected behavior: ship an independently branded local Git gate with authenticated admission, durable branch runs, real validation, guarded publication, operator controls, runtime skill distribution, and checksummed native releases.
- change description quality: commit subjects identify phases and fixes, but no pull-request body exists; several fix claims in `40-code-review-fixes-safety-dance.md` do not match the current behavior.
- implementation model and review model: implementation model was not recorded; review used GPT-5.6 Sol with four scoped GPT-5.6 Sol codebase-analysis passes.
- changed-line size and logical cohesion: 253 files and 41,083 added lines including task history. The product change imports broad agent, SCM, database, Git, service, CLI, and release surfaces, but the production daemon still routes named gates through one generic validation stub.
- resulting large-file concerns: `internal/config/config.go` is 3,136 lines, `internal/scm/github/github.go` is 1,487 lines, and `internal/agent/agent.go` is 1,353 lines. Their production ownership is obscured by the disconnected pipeline registration in CR-070.
- dependency or lockfile changes: a new Go module and lock graph were added. The locked graph verifies, but binary archives omit a dependency notice whose license requires reproduction in binary-distribution materials (CR-081).

## Tests Reviewed First

- behavior claimed by tests: 136 Node tests cover repository validation, installers, identity, and release shape; Go tests cover hooks, IPC, daemon coordination, publication, worktrees, CLI, wizard, TUI, and local end-to-end flows.
- missing or misleading coverage: no test drives the production daemon through real rebase, review, PR, or CI owners; no Darwin test proves exact-PID environment inspection; no rejected preserved-hook replay test exists; nonce replay and in-flight supersession are absent; response tests verify insertion rather than consumption; service tests use simple paths and a run-only executor; identity tests omit `.agents/skills` and mixed case; release tests omit third-party notices.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 5937 in / 73 out
- helper provenance: `judge: model jev-1.13.0, tokens 5937 in / 73 out`

### Correctness

- assessment and evidence: the complete production path was traced from receive hooks through daemon run construction, durable execution, publication, service management, operator responses, and release packaging. CR-070 and CR-072 through CR-078 identify executable paths that contradict the plan despite the green aggregate.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: named step wrappers claim rebase, review, PR, and CI behavior but all collapse to `Validate`, whose switch has no cases for those stages (`internal/pipeline/steps/validation.go:44-55`). The comments and public command responses therefore hide rather than clarify runtime behavior.
- helper coverage: covered, level 2, confidence 0.61

### Architecture

- assessment and evidence: the daemon constructs the core pipeline itself while imported agent, provider, response, and policy owners remain disconnected. Custody is now in the production graph, but validation, approval, and target-fingerprint invariants still sit outside their responsible owners (CR-070, CR-076, CR-079).
- helper coverage: covered, level 3, confidence 0.90

### Security

- assessment and evidence: Darwin does not inspect the requested process environment, trusted policy can be stale, raw credential-bearing remotes are persisted, and the identity scanner has case and project-skill exclusions (CR-071, CR-075, CR-079, CR-080).
- helper coverage: covered, level 3, confidence 0.95

### Performance

- assessment and evidence: the changed hot paths do not introduce a proven unbounded query, loop, or render regression. Receipt reconciliation is serial and stops on its first error, which amplifies CR-072 into an availability risk, but no separate performance-severity finding is warranted.
- helper coverage: covered, level 3, confidence 0.57

## Verification Story

- command or inspection: `npm test`; focused source tracing; `ps -eww -p <pid> -o command=` with a marked child on Darwin; `go mod verify` and the cached `modernc.org/sqlite@v1.48.1/LICENSE`; `git diff --check <base>...HEAD`.
- result: `npm test` passed 136 Node tests, all Go race tests, vet, a temporary binary build, identity checks, and release tests. The Darwin probe returned the system-wide process list instead of the target PID's environment. `modernc.org/sqlite` requires its notice in binary-distribution materials. `git diff --check` reports trailing whitespace only in excluded task artifact `02-research-local-git-gate.md`.
- manual, screenshot, or before-and-after evidence: no UI screenshot was required. Hosted releases, live providers, Windows service execution, Git-for-Windows admission, and launchd execution were not available.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-070 Production still self-certifies the fixed pipeline

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:44`
- failure mode: production marks rebase, review, pull-request, and CI complete after only `git diff --check`, then publishes `run.HeadSHA` by passing the same value as `ReviewedHead`.
- evidence or reproduction: `Rebase`, `Review`, `PR`, and `CI` all call `Validate`, but its command switch handles only intent, test, lint, and document (`validation.go:44-55`). The daemon supplies `Candidate` and `ReviewedHead` from the same run field (`internal/cli/daemon.go:406`) and registers the placeholder wrappers at `daemon.go:416-450`.
- fix direction: connect the actual rebase, agent-review, provider-PR, and CI owners through one production pipeline constructor, and derive the reviewed head from durable review evidence rather than caller equality.

### CR-071 Darwin descendants bypass the nested-run fence

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/processenv_darwin.go:11`
- failure mode: a validation descendant carrying `SD_PARENT_RUN_ID` can issue hook tokens or invoke mutating RPCs because the marker is not read from that PID's environment.
- evidence or reproduction: `ps -eww -p <pid> -o command=` on the review host returned the system-wide command list and not the selected child's environment. Both authorization loops rely on this output before accepting command-name ancestry (`internal/daemon/admission.go:119-136,173-189`).
- fix direction: read the exact Darwin process environment with a kernel API such as `sysctl(KERN_PROCARGS2)` and add Darwin tests for marked hook and CLI descendants.

### CR-072 Rejected pushes leave replayable admission receipts

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/admission.go:87`
- failure mode: a preserved user pre-receive hook can reject a push after Safety Dance persisted admission, but restart reconciliation later treats the unaccepted update as accepted and may supersede valid work.
- evidence or reproduction: the managed hook admits each update before invoking the preserved hook (`internal/git/hook.go:62-69`). `ReconcileOnce` forwards every persisted receipt without verifying that the gate ref equals `receipt.New` (`admission.go:87-103`). A failed `saveReceipts` also leaves the just-inserted in-memory receipt queued (`admission.go:222-228`).
- fix direction: verify the exact gate ref before replay, discard receipts for updates that never landed or were superseded, and remove an in-memory insertion when persistence fails.

### CR-073 Replaying an accepted nonce cancels its authoritative run

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/manager.go:50`
- failure mode: duplicate delivery of the same accepted ref cancels the original run, then fails the replacement on the unique launch nonce, leaving no active run.
- evidence or reproduction: `Replace` supersedes and joins the current handle before `CreateRun` (`manager.go:50-70`), while `(repo_id, branch, launch_nonce)` is unique. Existing tests replay publication receipts but never call `Replace` twice with one nonce.
- fix direction: resolve and return an existing immutable nonce binding before superseding the active branch owner; reject conflicting bindings without cancellation.

### CR-074 Supersession can race an externally visible push

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/db/runs.go:97`
- failure mode: replacement marks a run cancelled while its `git push` is already updating the remote. Cancellation cannot roll back that write, and the status guard then prevents mirror and publication binding, leaving an unrecorded remote head that breaks the newer run.
- evidence or reproduction: `SupersedeRun` ignores `push_active`; `Publish` acquires it before the network operation (`internal/pipeline/steps/push.go:100-117`). The new `BeforePush` check occurs before `exec.CommandContext` starts and does not serialize later supersession with the remote write (`push.go:49-60`).
- fix direction: make `push_active` the supersession barrier and wait for publication ownership to clear before changing lifecycle state; add a remote hook barrier test that supersedes after the push starts.

### CR-075 Trusted policy can come from a stale local tracking ref

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/daemon.go:377`
- failure mode: a checkout that has not fetched the default branch applies outdated validation commands, gate policy, CI policy, and agent restrictions even when upstream policy has changed.
- evidence or reproduction: `executeRun` reads `refs/remotes/origin/<default>` from the working checkout after only `RefExists`; it never fetches or resolves the live upstream commit before loading `.safety-dance.yaml` (`daemon.go:377-401`).
- fix direction: fetch the configured upstream default branch into a daemon-owned temporary ref, pin its commit, and load trusted policy from that commit.

### CR-076 Respond reports success but no pipeline consumes the decision

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/db/responses.go:16`
- failure mode: CLI and TUI approval controls print success while the run neither transitions nor resumes.
- evidence or reproduction: the daemon only inserts `run_id`, `step`, and `action`; there is no response reader or wake-up path. `internal/cli/respond.go:20-25` prints `response accepted`, while `internal/pipeline/runner.go` executes synchronously without an awaiting-response state.
- fix direction: make the pipeline own durable approval transitions, validate the currently waiting step and allowed action, persist the response, and wake or resume the matching run; reject non-waiting responses.

### CR-077 The promised Windows binary cannot admit or mutate

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/admission.go:114`
- failure mode: the published Windows archive cannot issue push tokens or execute run, respond, or abort mutations.
- evidence or reproduction: `managedHookPeer` always returns false on Windows and `AuthorizeMutationPeer` always returns unsupported (`admission.go:114-116,169-172`), while `.github/workflows/safety-dance-release.yml:17` publishes Windows amd64.
- fix direction: implement authenticated Windows ancestry plus environment-marker inspection and a Git-for-Windows hook fixture, or remove Windows from release promises until supported.

### CR-078 Service ownership is not stable across install and stop

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/service.go:82`
- failure mode: valid paths with spaces or XML metacharacters make Darwin/Linux definitions look foreign, and Windows cannot recognize its own task on reinstall but can delete a foreign replacement on stop.
- evidence or reproduction: definitions encode the home (`service.go:43-52`) while `ownedDefinition` searches raw `home=<root>` (`service.go:82-95`). Windows query requires `SAFETY_DANCE_MANAGED`, but the created task action omits that marker (`service.go:183-198`); `Stop` never queries the task before deletion (`service.go:209-238`).
- fix direction: encode one canonical ownership value or parse definitions, embed ownership in Windows task metadata, and use the same live ownership check for install and stop. Test encoded paths, owned reinstall, collision, and replacement-before-stop.

### CR-079 Publication persists raw credential-bearing remotes

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/push.go:134`
- failure mode: an HTTPS remote containing userinfo or tokens is stored unredacted in SQLite.
- evidence or reproduction: `PushBinding.TargetFingerprint` is documented as a one-way digest that must never be a raw URL (`internal/db/run.go:489-496`), but publication assigns `req.Remote` directly and persists it through `RecordPublicationAndBinding`.
- fix direction: compute and store the established one-way target fingerprint; never pass the raw remote into the binding column.

### CR-080 The identity scanner skips project skills and mixed-case branding

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `scripts/check-safety-dance-identity.mjs:9`
- failure mode: retired branding can ship in `.agents/skills/` or with an unenumerated case while CI remains green.
- evidence or reproduction: the walker skips all `.agents` even though the later rule excludes only `.agents/tasks/` (`lines 14,31`), and five case-sensitive regexes miss variants such as `No-Mistakes` (`lines 9-13`).
- fix direction: skip only task history, use case-insensitive separator-aware patterns, and add project-skill plus mixed-case fixtures.

### CR-081 Release archives omit required dependency notices

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/scripts/package-release.sh:18`
- failure mode: native archives distribute a statically linked dependency without the notice and disclaimer required for binary redistribution.
- evidence or reproduction: the archive includes only the imported project `LICENSE` (`package-release.sh:18-20`). The locked `modernc.org/sqlite v1.48.1` license requires its copyright, conditions, and disclaimer in documentation or other materials provided with binary forms.
- fix direction: generate and review a third-party notices file from the locked module graph, include it in every archive, and test archive contents.

### CR-082 Missing-binary recovery points to a skill-only installer

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/safety-dance/SKILL.md:14`
- failure mode: a user follows the prescribed recovery but still has no `safety-dance` executable.
- evidence or reproduction: the skill and `references/commands.md:14` point missing-binary recovery at `scripts/install.mjs`; the root README states that installer owns skill files and that binary releases are separate (`README.md:7-9,23`).
- fix direction: point binary recovery to the checksummed release archive or documented source build, and reserve the repository installer for the `/safety-dance` skill.

## Advisories

### ADV-001 Wizard discards service rollback errors

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `tools/safety-dance/internal/wizard/setup.go:89`
- evidence: when service installation fails, `StopService` is called but its error is discarded before the install and repository-compensation errors are joined.
- suggestion: include the stop error in `errors.Join` so operators know service state may remain.

### ADV-002 Standalone release packaging accepts extra version components

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `tools/safety-dance/scripts/package-release.sh:12`
- evidence: the shell patterns accept `1.2.3.4` even though the reusable script reports semantic-version validation; the workflow has a stricter preceding check.
- suggestion: require exactly three numeric components and add rejected-version fixtures.

## Dead Code and Dependency Review

- newly orphaned code: no newly orphaned package was proven. The custody owner is now reachable, but large imported agent/provider owners remain functionally disconnected from production validation as described in CR-070.
- dependency findings: the locked Go graph verifies and no duplicate package manager was added. Dependency vulnerability scanning was unavailable; CR-081 records the proven binary-notice omission.

## Verdict

- decision: request_changes
- overall code-health change: the branch adds the intended product shape and broad checks, but unresolved trust and publication failures make the shipped gate less safe than its public contract.
- rationale: two critical findings allow unreviewed or nested-agent publication paths, and eleven major findings cover accepted-update custody, concurrency, policy freshness, operator controls, platform support, secrets, identity enforcement, and binary distribution.

## Review Limits

- blocked or unavailable checks: no hosted `safety-dance-v*` release, authorized live provider run, Windows service or Git-for-Windows fixture, launchd execution, or dependency vulnerability scanner was available.
- residual manual verification: run Windows admission/service fixtures after implementation, run launchd with encoded homes, exercise real provider review/PR/CI owners, and inspect the first hosted archive and notices.
