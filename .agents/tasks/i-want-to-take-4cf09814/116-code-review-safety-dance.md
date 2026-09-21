---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 2994a6c78377d00ce14aa9df99b015e09ef9ba59
status: findings
summary: "The complete Safety Dance change still has six blocking findings at the pinned head. Five prior authorization, recovery, evidence-custody, persistence, and pull-request findings remain open, and the latest Windows service hardening makes a first install reject the normal missing-task result. The aggregate suite passes, but it does not exercise these boundaries; the next fix round must repair each finding and add focused regression tests."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` against `origin/main`
- reviewed HEAD: `2994a6c78377d00ce14aa9df99b015e09ef9ba59`
- commits: 200 commits after the merge base; commit subjects pass `npm run check-commits -- origin/main..HEAD`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts, the two task-owned untracked directories, and unrelated untracked `progress.md`; `git merge-tree --write-tree HEAD origin/main` reports a clean merge with the two newer target-branch commits

## Previous Round

- previous artifact: `.agents/tasks/i-want-to-take-4cf09814/114-code-review-safety-dance.md`; dispositions checked against `.agents/tasks/i-want-to-take-4cf09814/115-code-review-fixes-safety-dance.md`
- CR-368 Detached validation descendants still bypass nested-run authorization: still open as CR-376
- CR-369 Restart recovery races validation processes that survived the daemon: still open as CR-377
- CR-370 Failed Windows task queries can overwrite or delete a foreign task: fixed
- CR-371 Typed evidence can publish arbitrary host files: still open as CR-378
- CR-372 Step completion and evidence persistence are not atomic: still open as CR-379
- CR-373 Evidence rendering replaces authored PR bodies and emits broken blob links: still open as CR-380
- CR-374 Custom evidence cleanup can recursively delete unrelated directories: fixed
- CR-375 The reduced child environment is not Windows-safe: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; acceptance contract is the six-phase Safety Dance plan and its trust-boundary, durability, publication, identity, distribution, and release criteria
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; `.agents/tasks/i-want-to-take-4cf09814/16-verification-safety-dance.md` proves the earlier `49c6c2d` revision and leaves hosted release and live-provider evidence deferred
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed Go, Node, workflow, installer, and skill conventions

## Change Profile

- intent and expected behavior: add the independently branded Safety Dance local Git gate, durable daemon, fixed validation pipeline, guarded publication, operator interfaces, canonical non-worker skill, identity checks, and native release contract without retaining the source product identity outside its legal notice
- change description quality: commit subjects stand alone and pass the repository checker; no pull request exists, so no pull-request title or body was available to review
- implementation model and review model: implementation model is not recorded in the selected implementation receipt; review used GPT-5.6 Sol, with focused read-only codebase-analysis passes on authorization and recovery, evidence and provider handling, and the latest Windows and retention changes
- changed-line size and logical cohesion: 230 non-task files and approximately 40,578 additions plus 4 deletions form one product import; the six plan phases explain the grouping, but the size requires trust-boundary review by subsystem
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/db/run.go`, and `internal/cli/daemon.go` each exceed 1,000 lines; the current findings target boundary ownership rather than requiring a size-only split
- dependency or lockfile changes: the Go module and sums are new; `go mod verify` and `go list -m -mod=readonly all` pass, and this round adds no dependency or lockfile change

## Tests Reviewed First

- behavior claimed by tests: the root aggregate covers 137 Node tests, Go race tests, vet, identity checks, runtime installation, local end-to-end publication, release packaging, and a temporary binary build; focused daemon, CLI, agent, and path packages also pass
- missing or misleading coverage: no test executes production `commandExecutor.Output` against a missing Windows scheduled task; no detached child strips `SD_PARENT_RUN_ID`; no restart test leaves a surviving writer; no evidence test supplies an out-of-root host path; no crash test interrupts between step completion and evidence persistence; no provider fixture preserves an existing authored PR body and validates a repository-root blob URL

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4906` in / `73` out

### Correctness

- assessment and evidence: run recovery resumes persisted work immediately at `internal/daemon/manager.go:245-281` without first reaping validation processes that survived the old daemon, and step completion precedes evidence persistence at `internal/pipeline/runner.go:293-305`. Existing PR bodies are replaced at `internal/pipeline/steps/pr.go:77-80`, blob URLs are built from the pull-request URL at `internal/pipeline/steps/pr.go:151-154`, and Windows first install cannot classify the production missing-task result at `internal/daemon/service.go:225-233`.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: subsystem ownership is mostly explicit, but typed evidence is reduced to a semicolon-delimited `LastActivity` string at `internal/pipeline/runner.go:302-304` and later reparsed at `internal/pipeline/steps/pr.go:114-123`. That implicit string protocol causes the persistence and path-custody findings below.
- helper coverage: covered, level 2, confidence 0.86

### Architecture

- assessment and evidence: the daemon owns mutation authorization and restart coordination, while the database owns durable step transitions. The current design breaks those boundaries by using a removable environment marker as authorization evidence at `internal/daemon/admission.go:349-380`, resuming work before restart cleanup at `internal/daemon/manager.go:245-281`, and persisting typed evidence outside the step-completion transaction at `internal/pipeline/runner.go:293-305`.
- helper coverage: covered, level 3, confidence 0.80

### Security

- assessment and evidence: typed-agent evidence strings reach `os.Stat` and `os.ReadFile` without confinement at `internal/pipeline/steps/pr.go:128-137`, then may be pushed to the evidence branch or uploaded at `internal/pipeline/steps/pr.go:145-170`. Mutation authorization scans process ancestry for `SD_PARENT_RUN_ID` but accepts any ancestry containing the CLI name once a detached descendant removes that marker at `internal/daemon/admission.go:349-380`.
- helper coverage: covered, level 3, confidence 0.89

### Performance

- assessment and evidence: evidence publication bounds one run to 500 files and a bounded byte total in `internal/evidence/publish.go:17-20`; branch coordination is keyed rather than globally serialized. No critical or major performance defect was found in the pinned scope.
- helper coverage: covered, level 3, confidence 0.68

## Verification Story

- command or inspection: `npm test`; `cd tools/safety-dance && go test ./internal/agent ./internal/cli ./internal/daemon ./internal/paths`; `git diff --check`; `npm run check-commits -- origin/main..HEAD`; `cd tools/safety-dance && go mod verify && go list -m -mod=readonly all >/dev/null`; `git merge-tree --write-tree HEAD origin/main`
- result: all commands pass; `npm test` reports 137 passing Node tests, the Go race suite, vet, identity and release checks, and local end-to-end success. These green checks do not exercise the six failure paths below.
- manual, screenshot, or before-and-after evidence: source traces confirm the open boundaries; hosted Windows service execution, hosted release execution, live-provider behavior, and screenshot evidence remain unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-376 Detached validation descendants still bypass nested-run authorization

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:349`
- failure mode: a validation command can detach a child, remove `SD_PARENT_RUN_ID`, and invoke `safety-dance`; after the marked ancestor exits, the daemon sees a CLI executable in the remaining ancestry and authorizes parent-run mutation.
- evidence or reproduction: `AuthorizeMutationPeer` rejects only ancestors whose current environment still contains `SD_PARENT_RUN_ID` and otherwise accepts any ancestry containing `safety-dance` (`internal/daemon/admission.go:355-379`). The CLI guard at `internal/cli/root.go:71-75` reads the same removable environment variable. No test launches a detached descendant that unsets the marker.
- fix direction: replace the removable marker as the authorization boundary with an OS-bound, run-scoped mutation capability or equivalent non-forgeable provenance, and add a detached-descendant mutation test.

### CR-377 Restart recovery races validation processes that survived the daemon

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/manager.go:245`
- failure mode: after a daemon crash, a validation subprocess may keep writing in its worktree while the restarted daemon resumes the same run and resets or reuses that worktree, corrupting validation inputs or the reviewed head.
- evidence or reproduction: `Manager.Recover` registers and launches each recoverable run without a process sweep (`internal/daemon/manager.go:245-281`). `procreap.SweepRunWorktree` is called only during normal run cleanup at `internal/cli/daemon.go:294`, not before restart recovery. Existing recovery tests enumerate and resume records but do not leave a surviving writer.
- fix direction: perform a verified restart-only reap for the persisted run and worktree before any recovery reset or execution, then prove a surviving writer cannot modify the recovered checkout.

### CR-378 Typed evidence can publish arbitrary host files

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/pr.go:128`
- failure mode: an agent-controlled evidence item may name any readable regular file on the host; Safety Dance copies its bytes into the run evidence directory and can push or upload them.
- evidence or reproduction: typed evidence accepts arbitrary strings in `internal/pipeline/steps/validation.go:107-136`. `renderEvidence` calls `os.Stat(item)` and `os.ReadFile(item)` without proving the path belongs to the managed worktree or evidence root (`internal/pipeline/steps/pr.go:128-137`), then publishes or uploads the copied file (`internal/pipeline/steps/pr.go:145-170`).
- fix direction: persist typed evidence records that distinguish text from files, resolve file paths against the managed roots, reject absolute, escaping, symlinked, or non-owned paths, and test attempted publication of a readable host file.

### CR-379 Step completion and evidence persistence are not atomic

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/runner.go:293`
- failure mode: a crash after step completion but before `TouchStepActivity` leaves a durable completed step with no evidence; restart skips the completed step and cannot reconstruct what the pull-request step must publish.
- evidence or reproduction: `CompleteStepWithRunHead` commits completion first (`internal/pipeline/runner.go:293-296`), and evidence is written by a separate database call afterward (`internal/pipeline/runner.go:302-305`). The evidence schema is an in-memory sink plus `LastActivity`, and no crash-boundary test covers the gap.
- fix direction: store typed evidence in the same database transaction as step completion and its checkpoint, then inject a crash at the former boundary and prove restart sees either neither record or both.

### CR-380 Evidence rendering destroys authored PR content and creates invalid blob URLs

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/pr.go:77`
- failure mode: rerunning the pull-request step replaces an existing authored body with only the generated evidence section, and repository evidence links are formed under `/pull/<number>/blob/...`, which does not identify a repository blob.
- evidence or reproduction: `UpdatePR` receives `scm.PRContent{Body: body}` without reading or merging the existing body (`internal/pipeline/steps/pr.go:77-80`). Link construction appends `/blob/<sha>/...` to `pr.URL` (`internal/pipeline/steps/pr.go:151-154`) rather than to the repository URL. No provider fixture asserts body preservation or a canonical repository blob link.
- fix direction: read the existing body, replace only a bounded Safety Dance evidence section, derive blob links from the provider's canonical repository URL, and add create/update fixtures for both behaviors.

### CR-381 Windows first service install rejects the normal missing-task result

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/service.go:225`
- failure mode: on a clean Windows machine, querying the not-yet-created scheduled task exits nonzero; production reports the diagnostic in the returned output bytes, while `isTaskNotFound` inspects only the error string, so `Install` treats normal absence as a fatal query failure and never creates the task.
- evidence or reproduction: the production executor uses `exec.Command(...).CombinedOutput()` (`internal/cli/wizard.go:28-30`), whose nonzero error is an `exec.ExitError` such as `exit status 1` while command diagnostics are returned separately. `Install` discards `out` on error and calls `isTaskNotFound(queryErr)` (`internal/daemon/service.go:225-233`). The daemon tests do not provide an output-capable executor or enter the Windows ownership branch (`internal/daemon/service_test.go:25-33,61-72`).
- fix direction: classify task absence from the captured output and structured exit result while failing closed for every other error, and add production-shaped tests for missing, foreign, owned, access-denied, and malformed task queries.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none confirmed; the latest retention, Windows environment, and task-query changes remain reachable from daemon setup and agent execution
- dependency findings: no dependency change occurred after the previous review; the new Go module verifies and resolves in readonly mode, and no JavaScript dependency was added

## Verdict

- decision: request_changes
- overall code-health change: the latest fix narrows evidence deletion and preserves Windows child execution variables, but the clean-install query regression and five unresolved trust and durability boundaries keep the product unsafe to approve
- rationale: one critical host-file disclosure path and five major authorization, recovery, persistence, provider, and Windows lifecycle failures remain reproducible from current control flow despite a green aggregate suite

## Review Limits

- blocked or unavailable checks: no hosted Windows runner, live provider credentials, pull request, or hosted `safety-dance-v*` release was available; axis coverage used `jev-1.13.0` with 4,906 input tokens and 73 output tokens
- residual manual verification: after fixes, run the full aggregate plus Windows scheduled-task lifecycle, detached-descendant authorization, surviving-writer recovery, host-file confinement, transactional crash recovery, and existing-PR update fixtures
