---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 51a5491848dabfb692e2e6678e76a72d830472c7
status: findings
summary: "Review of the 119-commit Safety Dance change found nine critical or major defects in cleanup trust, publication recovery, wizard rollback, admission receipts, worktree lifecycle, Windows services, SCM routing, release execution, and custom-gate enforcement. The next fix round must close these failures and add production-path regressions before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` against `origin/main`
- reviewed HEAD: `51a5491848dabfb692e2e6678e76a72d830472c7`
- commits: 119 commits in `origin/main..HEAD`; `npm run check-commits -- origin/main..HEAD` accepted all 119 subjects
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: committed task artifacts and the two untracked task-evidence directories were used as review inputs but not reviewed as product code

## Previous Round

- previous artifact: `65-code-review-safety-dance.md`
- CR-203 Cancellation still strands a confirmed remote publication: still open
- CR-204 Advertised non-GitHub providers still cannot execute: still open
- CR-205 Typed validation findings and evidence are still not durable: fixed
- CR-206 Shorthand flag errors still return the internal-failure exit class: fixed
- CR-207 Rejected receives retain replayable daemon receipts: still open
- CR-208 Terminal cleanup uses the wrong repository: still open
- CR-209 Repaired existing gates still cannot be rolled back by the wizard: still open
- CR-210 New pull requests always fail this repository's title check: fixed
- CR-211 Linux service installation generates a unit that cannot be enabled: fixed
- CR-212 Windows cannot recognize or remove its own scheduled task: still open
- CR-213 The default logs command has no daemon log producer: fixed
- CR-214 Interactive TUI emits an unchanged full view four times per second: fixed
- CR-215 A crash after terminal status permanently abandons the worktree: still open
- CR-216 Phase 6 regression contracts are still incomplete: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced local Git gate as a fully renamed product without repository references
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; the plan requires authenticated admission, durable branch runs, crash-safe owned worktrees, guarded publication, operator interfaces, SCM-backed PR and CI work, release archives, and enforced validation gates
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the review-code skill contract

## Change Profile

- intent and expected behavior: add the Safety Dance Go tool, non-worker skill, installer integration, aggregate checks, and product-specific native releases while preserving local-gate trust and durability invariants
- change description quality: no pull request exists. Commit subjects pass the repository check, and task artifacts explain the staged implementation and repair history, but there is no PR body that states current limits or evidence.
- implementation model and review model: implementation model is not recorded in the selected implementation artifact; review model is GPT-5.6 Sol
- changed-line size and logical cohesion: 294 files changed. Excluding task artifacts, 227 files add 38,269 lines and delete 4. The change combines a complete imported Go application, repository distribution, and release automation in one branch.
- resulting large-file concerns: `internal/config/config.go` is 3,140 lines, `internal/scm/github/github.go` is 1,490 lines, and `internal/agent/agent.go` is 1,353 lines. The blocking issues below are boundary failures rather than file-size preferences.
- dependency or lockfile changes: `tools/safety-dance/go.mod` and `go.sum` add the imported Go dependency graph. The module builds, race-tests, vets, and generates dependency notices locally; no dependency-specific blocker was found.

## Tests Reviewed First

- behavior claimed by tests: current unit, race, e2e, identity, installer, packaging, and aggregate checks claim authenticated hooks, durable publication, cleanup recovery, provider-backed PR and CI steps, platform service ownership, release packaging, and all six plan phases
- missing or misleading coverage: the publication regression calls `RecordPublicationAndBinding` directly and never restarts a cancelled `push_active` run; preserved-hook tests do not drive the generated revoke command or a repeated rejection; cleanup tests do not create manual-run worktrees or repository-controlled removal journals; Windows service tests accept invalid `schtasks /FO XML` arguments; release tests pass an absolute output directory and never run the publish job without a checkout; no test proves a configured custom gate executes

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5756` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 5756 in / 73 out`

### Correctness

- assessment and evidence: `npm test`, focused Go race tests, and commit checks pass at the reviewed HEAD, but production-path reproductions still fail. A cancelled publication is not resumed, invalid wizard input can eject an existing gate, preserved-hook receipt revocation is unreachable, manual-run cleanup blocks daemon restart, Windows packaging fails with the workflow's relative output path, the publish job lacks repository context, and configured custom gates never run.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: ownership is generally named by package, but the same worktree API accepts two incompatible Git sources without persisting which source created the worktree. Provider and custom-gate configuration also expose behavior that the runtime does not implement, leaving dead branches and misleading contracts.
- helper coverage: covered, level 2, confidence 0.66

### Architecture

- assessment and evidence: cleanup journals are discovered by recursively scanning mutable worktree contents instead of trusted runtime metadata. Publication recovery is split between `Publish`, the run manager, and startup selection, so the new lower-level binding allowance is unreachable after restart. SCM construction remains hard-coded to GitHub despite the multi-provider configuration model.
- helper coverage: covered, level 3, confidence 0.86

### Security

- assessment and evidence: a repository-controlled `*.safety-dance-removing.json` file is treated as a trusted cleanup command and can direct `git worktree remove --force` at another linked worktree. Windows task collision checks fail open because they invoke unsupported `schtasks` syntax before using `/Create /F`.
- helper coverage: covered, level 3, confidence 0.71

### Performance

- assessment and evidence: the TUI now suppresses unchanged renders, closing the prior polling-output defect. No new critical or major hot-path, unbounded-query, or rendering issue was found; the recursive recovery scan is reported as a security and data-integrity defect because it executes untrusted journals, not because of scan cost.
- helper coverage: covered, level 3, confidence 0.52

## Verification Story

- command or inspection: `npm test`
- result: exit 0; 136 Node tests passed, followed by the full Safety Dance identity, Go race, vet, build, and release-contract checks
- command or inspection: `cd tools/safety-dance && go test -race ./internal/cli ./internal/daemon ./internal/db ./internal/git ./internal/gate ./internal/pipeline/... ./internal/tui ./internal/worktrees`
- result: exit 0 for every named package
- command or inspection: `npm run check-commits -- origin/main..HEAD`
- result: exit 0; 119 subjects passed
- command or inspection: run `package-release.sh` exactly as the Windows workflow does, with `--out dist`
- result: exit 15; `zip` could not create `dist/safety-dance_1.2.3_windows_amd64.zip` after the script changed directory to its staging directory
- command or inspection: run `gh release create` outside a Git checkout with `GH_TOKEN` and `GITHUB_REPOSITORY`, matching the publish job's lack of checkout or `--repo`
- result: exit 1; `gh` reported `fatal: not a git repository`
- manual, screenshot, or before-and-after evidence: temporary-repository CLI reproductions confirmed that invalid wizard commands eject an existing gate and that a manual `run` leaves a cleanup journal which prevents the daemon from restarting. A separate worktree fixture confirmed that a repository-controlled removal journal can delete an unrelated linked worktree with uncommitted content. No hosted Windows, provider, or release run was available.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-217 Repository content can command destructive worktree cleanup

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/worktrees/ownership.go:150-168`
- failure mode: daemon startup recursively accepts any file ending in `.safety-dance-removing.json` below a configured worktree root, trusts its `Source` and `Dir`, and runs `git worktree remove --force`. A pushed repository can include such a file inside its checkout and delete an unrelated linked worktree writable by the same user, including uncommitted files outside `SD_HOME`.
- evidence or reproduction: `serveDaemon` calls `RecoverRemoving` for every configured root at `tools/safety-dance/internal/cli/daemon.go:415-425`. A temporary fixture placed a forged journal in repository content and daemon startup removed the attacker-selected external worktree and its uncommitted data.
- fix direction: keep lifecycle journals in a trusted metadata directory outside checked-out content. Validate the journal path, source gate, worktree directory, and persisted run ownership before removal, and add a regression proving repository files and unknown directories are never executed as journals.

### CR-218 Cancelled publication recovery is still unreachable after restart

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/manager.go:182-220`
- failure mode: cancellation after the remote push but before mirror and binding persistence leaves a cancelled run with `push_active=1`. `RecoverableRuns` returns it, but `Manager.Recover` skips every cancelled run, so the daemon never checks the live remote, updates the gate mirror, or records the publication binding.
- evidence or reproduction: `RecordPublicationAndBinding` now permits a cancelled owner, but its new test invokes that DB method directly. Production `Publish` rejects cancelled runs at `tools/safety-dance/internal/pipeline/steps/push.go:90-96`, and startup skips them at `manager.go:189-192`, so the lower-level fix cannot run after a crash.
- fix direction: add a dedicated recovery path for cancelled runs that still own `push_active`. Reconcile the live ref first; finish mirror and binding only when it equals the reviewed candidate, otherwise release the claim without publishing. Cover the process-restart boundary rather than the DB method alone.

### CR-219 Wizard validation failure can eject a pre-existing gate

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/wizard.go:81-125`
- failure mode: `Setup.Run` compensates every writer error. If validation fails before `InitWithRollback`, `gateRollback` is nil and compensation calls `gate.Eject`, deleting the existing bare gate and managed remote even though this attempt did not create them.
- evidence or reproduction: rerunning the wizard on an initialized temporary repository with eight commands containing one empty command returns the validation error from lines 87-94, then takes the nil-rollback branch at lines 121-124 and removes the existing gate and `safety-dance` remote.
- fix direction: track whether this attempt created a gate separately from whether a repair rollback handle exists. Before gate initialization, compensation must not touch gate state. Add a rerun regression for input validation failure on an existing installation.

### CR-220 Preserved-hook rejection never reaches durable receipt revocation

- type: Potential issue
- severity: critical
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:31-64`
- failure mode: the generated pre-receive hook invokes `daemon revoke-push-receipt`, but `newDaemon` never registers `newRevokePushReceipt`. Every revocation fails and is ignored. The shell cleanup at `tools/safety-dance/internal/git/hook.go:70-80` also compares space-separated Git input using a tab field separator, so old token rows survive and repeated rejected pushes select the already-revoked first token while newer durable receipts remain replayable.
- evidence or reproduction: the built binary treats `daemon revoke-push-receipt` as an unknown command. An `awk` reproduction using the generated formats retains the rejected row; repeating the same preserved-hook rejection selects token 1 again and leaves token 2 in the daemon store.
- fix direction: register the command, authorize it with the managed-hook ancestry policy, remove the exact token rather than looking up the first matching update, make shell and daemon cleanup failure-aware, and test two identical preserved-hook rejections followed by restart reconciliation.

### CR-221 Manual runs use a cleanup source that cannot remove their worktrees

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:271-311`
- failure mode: a manual `run` creates its worktree through `repo.WorkingPath`, but terminal cleanup journals and removes it through the bare gate path. Git rejects that source as not a working tree. The removal journal survives, and the next daemon start aborts while replaying the same invalid cleanup operation.
- evidence or reproduction: cleanup uses `p.RepoDir(repo.ID)` at lines 221 and 252, while manual creation uses `repo.WorkingPath` at line 300. A built-binary temporary-repository run produced `fatal: ... is not a working tree`; after stop, daemon restart failed readiness at the `RecoverRemoving` call.
- fix direction: persist the exact Git source with worktree ownership and use it for cleanup and recovery. Add a built-binary manual-run test that reaches terminal state, removes the worktree, and restarts the daemon successfully.

### CR-222 Windows task ownership still uses invalid query syntax

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/service.go:156-166`
- failure mode: Windows ownership checks run `schtasks /Query ... /FO XML`, but `/FO` accepts table, list, or CSV output. XML uses the separate `/XML` switch. The query error is treated as not-owned during stop and ignored during install; install then uses `/Create /F`, which can overwrite a foreign task with the same name, while Safety Dance cannot recognize or remove its own task later.
- evidence or reproduction: both production queries use `/FO XML` at lines 161 and 211. Error handling at lines 162-164 and 211-216 creates the fail-open install and fail-closed stop behavior. Local service tests mock command output and do not validate real `schtasks` arguments.
- fix direction: query with supported XML syntax, distinguish not-found from command failure, refuse install on an unreadable existing task, and add a Windows command-contract test plus hosted execution evidence.

### CR-223 Advertised non-GitHub providers still cannot execute

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:538-547`
- failure mode: configuration and provider detection accept GitLab, Bitbucket, Azure DevOps, Forgejo, and Gitea, but runtime SCM construction rejects every provider except GitHub before PR or CI work starts.
- evidence or reproduction: `internal/scm/scm.go:22-31` defines six providers and the configuration resolves provider-specific settings, while `newSCMHost` returns `not supported by this build` for every non-GitHub remote. This is a known implementation absence, not merely missing live credentials.
- fix direction: either implement and fixture each advertised host through the shared `scm.Host` contract or remove unsupported providers from accepted configuration, detection, setup, and product claims. Add provider-backed local fixtures for PR creation, target verification, and CI polling.

### CR-224 The release workflow cannot package Windows or publish any assets

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `.github/workflows/safety-dance-release.yml:29-55`
- failure mode: the Windows matrix passes relative `--out dist`, then `package-release.sh` changes into its staging directory and asks `zip` to create a nonexistent nested `dist/...` path. Even if builds succeeded, the publish job has no checkout and gives `gh release create` neither `GH_REPO` nor `--repo`, so `gh` cannot identify a repository.
- evidence or reproduction: the exact Windows packaging invocation exits 15 at `tools/safety-dance/scripts/package-release.sh:29`. Running the publish command outside a checkout with `GH_TOKEN` and `GITHUB_REPOSITORY` exits 1 with `fatal: not a git repository`. Current tests pass an absolute output path and inspect workflow text, so neither production failure runs.
- fix direction: resolve `binary` and `out` to absolute paths before changing directories, and give the publish job repository context through checkout, `GH_REPO`, or `--repo`. Add an executable workflow-contract test using the same relative arguments and a no-checkout publish fixture.

### CR-225 Trusted custom gates are accepted and then ignored

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:634-681`
- failure mode: repository configuration accepts up to 16 trusted custom gates and says they run after an anchor core step, but `executeRun` registers only `pipeline.CoreSteps`. A configured gate never receives a step row or executes, so publication can succeed without a policy check the trusted default branch requires.
- evidence or reproduction: `internal/config/config.go:313-325` parses and documents additive gates, and `internal/config/gates.go` provides durable encoding and validation. No production caller uses `MarshalGates`, `ParseGates`, or `GetRunGates`; the runner loop only switches over the fixed core names.
- fix direction: pin the resolved trusted gate list when creating the run, expand it deterministically around core anchors, execute and persist each gate through the same durable runner, and add a failing-gate regression that proves push and later steps do not run.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: the non-GitHub provider branches and custom-gate parsing, validation, and persistence helpers are task-created but unreachable from successful production execution; CR-223 and CR-225 cover them
- dependency findings: no critical or major dependency, lockfile, notice, or license defect was found locally. Hosted release execution remains unproven and is blocked by CR-224.

## Verdict

- decision: request_changes
- overall code-health change: the branch adds a substantial tested local-gate system, but its trust and recovery boundaries still permit data loss, stranded publication state, ignored validation, and nonfunctional platform and release paths
- rationale: nine critical or major findings remain. Passing aggregate checks do not exercise the failing production paths identified above.

## Review Limits

- blocked or unavailable checks: no real Windows Task Scheduler run, hosted `safety-dance-v*` workflow, or authorized live SCM-provider run was available. The axis-coverage helper completed all five axes.
- residual manual verification: after fixes, rerun the preserved-hook rejection and restart scenario, cancelled post-push restart, existing-gate wizard failure, manual-run cleanup restart, forged-journal refusal, hosted Windows service lifecycle, each supported provider, and the hosted release workflow.
