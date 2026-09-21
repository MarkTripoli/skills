---
type: code-review
date: 2026-09-21
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 9c0ffd5a87b57b2d08cab4f14e4900e6429edf68
status: findings
summary: "The complete Safety Dance change has six blocking findings at the pinned head. Authorization and restart-recovery defects remain open; the latest fixes leave evidence publication vulnerable to a symlink race, still replace authored pull-request bodies, classify unrelated Windows query failures as task absence, and discard typed evidence from failed or operator-approved steps. The next fix round must repair these boundaries and add focused regression tests."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` against `origin/main`
- reviewed HEAD: `9c0ffd5a87b57b2d08cab4f14e4900e6429edf68`
- commits: 203 commits after the merge base; all subjects pass `npm run check-commits -- origin/main..HEAD`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts, the task-owned untracked directories, and unrelated untracked `progress.md`; `git merge-tree --write-tree HEAD origin/main` reports a clean merge with the two newer target-branch commits

## Previous Round

- previous artifact: `.agents/tasks/i-want-to-take-4cf09814/116-code-review-safety-dance.md`; dispositions checked against `.agents/tasks/i-want-to-take-4cf09814/117-code-review-fixes-safety-dance.md`
- CR-376 Detached validation descendants still bypass nested-run authorization: still open as CR-382
- CR-377 Restart recovery races validation processes that survived the daemon: still open as CR-383
- CR-378 Typed evidence can publish arbitrary host files: still open as CR-384
- CR-379 Step completion and evidence persistence are not atomic: fixed
- CR-380 Evidence rendering destroys authored PR content and creates invalid blob URLs: still open as CR-385; blob URLs are fixed, body preservation is not
- CR-381 Windows first service install rejects the normal missing-task result: still open as CR-386; normal absence is fixed, but the replacement classifier fails open on unrelated diagnostics

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; acceptance is defined by the six-phase Safety Dance plan and its authentication, durability, publication, identity, distribution, and release contracts
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; `.agents/tasks/i-want-to-take-4cf09814/16-verification-safety-dance.md` proves the earlier `49c6c2d` revision, while the latest fix receipt records current-head checks and three unresolved findings
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed Go, Node, workflow, installer, and skill conventions

## Change Profile

- intent and expected behavior: add the independently branded Safety Dance local Git gate, durable daemon, fixed validation pipeline, guarded publication, operator interfaces, canonical non-worker skill, identity checks, and native release contract without retaining the source product identity outside its legal notice
- change description quality: commit subjects stand alone and pass the repository checker; no pull request exists, so no pull-request title or body was available to review
- implementation model and review model: the implementation model is not recorded in the selected receipt; review used GPT-5.6 Sol plus focused fresh-context analysis of authorization, recovery, evidence, provider, and Windows changes
- changed-line size and logical cohesion: 232 non-task files contain 40,729 additions and 4 deletions; the six plan phases explain the product import, but the size requires subsystem review at each trust boundary
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/db/run.go`, and `internal/cli/daemon.go` exceed 1,000 lines; no size-only finding is raised
- dependency or lockfile changes: the Go module and sums are new in the complete scope; the previous round verified them in readonly mode, and the latest fix adds no dependency or lockfile change

## Tests Reviewed First

- behavior claimed by tests: the verification artifact records passing local acceptance items at `49c6c2d`; the latest fix receipt records a passing 137-test root aggregate and Safety Dance race, vet, temporary-build, end-to-end, identity, and release checks; this review reran commit validation and focused daemon, database, pipeline, and pipeline-step tests successfully
- missing or misleading coverage: no test detaches a marked validation descendant and removes `SD_PARENT_RUN_ID`; leaves a surviving writer during restart; swaps an accepted evidence path to a symlink after confinement; drives existing authored PR content through the production update path; supplies an unrelated Windows query diagnostic containing `not found`; or preserves typed evidence after failure and operator approval

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4953` in / `73` out

### Correctness

- assessment and evidence: recovery resumes runs before reaping surviving validation processes at `tools/safety-dance/internal/daemon/manager.go:245-281`; production PR updates still send only generated evidence at `tools/safety-dance/internal/pipeline/steps/pr.go:75-82`; Windows task absence uses a generic substring classifier before forced creation at `tools/safety-dance/internal/daemon/service.go:189-192,227-258`; and failed or response-completed steps bypass evidence-aware completion at `tools/safety-dance/internal/pipeline/runner.go:288-310`.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: typed evidence now uses JSON instead of a delimiter protocol, and completion plus checkpoint persistence share one transaction. The body-preserving helper at `tools/safety-dance/internal/pipeline/steps/pr.go:242-254` is not called by production code, while the Windows absence helper combines unrelated output and error text into broad substring tests.
- helper coverage: covered, level 2, confidence 0.71

### Architecture

- assessment and evidence: daemon authorization still treats a removable environment marker and executable name as provenance at `tools/safety-dance/internal/daemon/admission.go:349-380`; restart orchestration launches recoverable work before verified process cleanup at `tools/safety-dance/internal/daemon/manager.go:245-281`; and response handling completes a step outside the evidence-aware completion path at `tools/safety-dance/internal/db/responses.go:111-125`.
- helper coverage: covered, level 3, confidence 0.63

### Security

- assessment and evidence: a detached validation descendant can remove `SD_PARENT_RUN_ID` and pass process-name authorization at `tools/safety-dance/internal/daemon/admission.go:355-379`. Evidence confinement resolves a path and later follows it with separate `os.Stat` and `os.ReadFile` calls at `tools/safety-dance/internal/pipeline/steps/pr.go:141-157,201-230`, so a concurrent symlink replacement can still copy a readable host file.
- helper coverage: covered, level 3, confidence 0.91

### Performance

- assessment and evidence: the latest fix adds bounded JSON serialization and per-item path resolution outside identified hot loops. Evidence publication remains bounded by `tools/safety-dance/internal/evidence/publish.go`, and no critical or major performance regression was found in the pinned scope.
- helper coverage: covered, level 3, confidence 0.59

## Verification Story

- command or inspection: selected verification and fix receipts; `npm run check-commits -- origin/main..HEAD`; `cd tools/safety-dance && go test ./internal/daemon ./internal/db ./internal/pipeline ./internal/pipeline/steps`; product-only `git diff --check`; `git merge-tree --write-tree HEAD origin/main`; source tracing and three fresh-context review passes
- result: commit validation reports 203 valid subjects; all focused Go tests pass; the product-only diff check passes; the merge tree is clean. The complete diff check reports only pre-existing trailing spaces in the research artifact, which is excluded from product review.
- manual, screenshot, or before-and-after evidence: source traces confirm the six failure paths; no hosted Windows runner, live provider, hosted release, or screenshot evidence was available

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-382 Detached validation descendants still bypass nested-run authorization

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:349`
- failure mode: validation-controlled code can detach, remove `SD_PARENT_RUN_ID`, invoke `safety-dance`, and mutate or stop its parent daemon after the marked ancestor exits.
- evidence or reproduction: `AuthorizeMutationPeer` rejects only ancestry whose current environment contains the marker, then accepts any ancestry containing an executable named `safety-dance` (`internal/daemon/admission.go:355-379`). The CLI guard reads the same removable variable. Mutation handlers use this check for shutdown, run creation, response, and cancellation (`internal/cli/daemon.go:319-461`), and no test covers a detached descendant with the marker removed.
- fix direction: require a daemon-issued, OS-bound, run-scoped mutation capability or equivalent non-forgeable provenance, then test a detached child that removes the marker and attempts each mutation class.

### CR-383 Restart recovery races validation processes that survived the daemon

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/manager.go:245`
- failure mode: after a daemon crash, a surviving validation writer can race the restarted daemon's reset, clean, and resumed validation in the same worktree, changing inputs or the reviewed head.
- evidence or reproduction: `Manager.Recover` launches every recoverable run without a process sweep (`internal/daemon/manager.go:245-281`). Resumed execution resets and cleans the existing checkout, while `SweepRunWorktree` runs only during normal terminal cleanup (`internal/cli/daemon.go:284-295`). Existing recovery tests leave no surviving process.
- fix direction: perform a verified, restart-only reap of each persisted run worktree before reset or execution, fail closed when cleanup cannot be verified, and test recovery with a surviving writer.

### CR-384 Evidence confinement has a symlink replacement race

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/pr.go:141`
- failure mode: an agent-controlled concurrent writer can replace an accepted in-worktree evidence file or parent path after confinement, causing Safety Dance to read and publish a host file outside managed roots.
- evidence or reproduction: `confinedEvidencePath` validates the result of `filepath.EvalSymlinks` and returns a pathname (`internal/pipeline/steps/pr.go:201-230`), then `renderEvidence` separately calls `os.Stat` and `os.ReadFile` on that pathname (`internal/pipeline/steps/pr.go:146-157`). These follow the current filesystem state. The regression test rejects only a symlink that already exists before validation and does not swap the path between validation and open (`internal/pipeline/steps/pr_security_test.go:10-26`).
- fix direction: open evidence relative to a trusted directory handle with no-follow semantics for every component, validate the opened descriptor, and read from that descriptor; add a deterministic post-validation symlink-swap test.

### CR-385 Evidence updates still replace authored pull-request bodies

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/pr.go:75`
- failure mode: rerunning the pull-request step replaces an existing authored body with only generated evidence text.
- evidence or reproduction: production passes `scm.PRContent{Body: body}` directly to `UpdatePR` (`internal/pipeline/steps/pr.go:75-82`). `mergeEvidenceBody` implements bounded marker replacement but has no production caller (`internal/pipeline/steps/pr.go:242-254`); its unit test therefore proves only orphaned helper behavior. The SCM contract and GitHub provider already expose `PRContentReader` (`internal/scm/host.go:335-342`, `internal/scm/github/github.go:369-392`).
- fix direction: read existing provider content, fail closed on an indeterminate read, replace only the bounded Safety Dance evidence section, and add create/update provider fixtures that preserve authored text.

### CR-386 Windows task absence matching can overwrite an unverified task

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/service.go:189`
- failure mode: any scheduled-task query failure whose output contains `cannot find`, `not found`, or `does not exist` is treated as task absence; installation then runs `schtasks /Create ... /F` without establishing ownership and can replace a foreign task.
- evidence or reproduction: `isTaskNotFound` searches all output and error text for broad phrases (`internal/daemon/service.go:189-192`). `Install` accepts that result and reaches forced creation (`internal/daemon/service.go:227-258`). The new test covers the normal missing-file diagnostic and access denied, but no unrelated query failure containing a generic absence phrase (`internal/daemon/service_query_test.go:8-14`).
- fix direction: recognize only the documented scheduled-task-not-found exit code and exact diagnostic shape, fail closed for every other query failure, and test unrelated `not found`, malformed, foreign, owned, and normal-missing results through `Install`.

### CR-387 Failed and operator-approved steps discard typed evidence

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/runner.go:288`
- failure mode: evidence produced by a failed validation step is replaced by the error text, and evidence from a failure that an operator approves is replaced by `status: completed`; later status and pull-request evidence cannot reconstruct it.
- evidence or reproduction: the runner serializes the evidence at `internal/pipeline/runner.go:288-301` but writes it only when `err == nil && !responseCompleted` (`internal/pipeline/runner.go:303-310`). `FailStep` overwrites `last_activity` with the error (`internal/db/step.go:451-456`), while `ApplyResponse` writes only the completed status (`internal/db/responses.go:111-125`) and makes the runner skip evidence-aware completion. No runner test covers evidence retention after failure or approval.
- fix direction: persist typed evidence together with failed state and response-driven completion, without overloading one activity field so status, error, and evidence overwrite each other; add failure and approval regression tests that read the durable evidence after restart.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: `mergeEvidenceBody` at `tools/safety-dance/internal/pipeline/steps/pr.go:242-254` is called only by its unit test and is part of CR-385
- dependency findings: no dependency or lockfile change occurred in the latest fix; the complete-scope Go module verified in the previous round and focused package tests still pass

## Verdict

- decision: request_changes
- overall code-health change: atomic evidence persistence, repository-root blob links, and ordinary Windows missing-task handling improve the latest diff, but three older boundaries remain open and three new or partial regressions prevent approval
- rationale: one critical host-file disclosure path and five major authorization, recovery, provider, Windows lifecycle, and evidence-retention failures remain reachable despite green focused and aggregate checks

## Review Limits

- blocked or unavailable checks: no hosted Windows runner, live provider credentials, pull request, hosted `safety-dance-v*` release, or deterministic filesystem-race harness was available
- residual manual verification: after fixes, rerun the aggregate plus detached-descendant authorization, surviving-writer restart, descriptor-based evidence confinement, authored-PR update, production-shaped Windows query, and failed/approved evidence persistence tests
