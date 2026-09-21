---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: afe9563f82895abf7b82bfc3ef4c86d0c35c0a16
status: findings
summary: "The complete Safety Dance diff at afe9563 was reviewed against origin/main and the repaired plan. Nine critical or major findings remain: production runs cannot pass the fixed pipeline, platform trust and service boundaries remain incomplete, same-branch supersession can publish the older run, trusted configuration and wizard rollback have gaps, and the planned custody owner is orphaned. The next fix phase must repair these paths and add production-path regression tests before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `afe9563f82895abf7b82bfc3ef4c86d0c35c0a16`
- commits: 76 commits in `4458fbf..afe9563`, including six implementation phases, verification repairs, five earlier review rounds, and the latest fixes in `ec79e97` and `54d7072`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked evidence directories were requirements or history inputs, not product-code review subjects

## Previous Round

- previous artifact: `37-code-review-safety-dance.md`
- CR-049 Named validation stages still self-certify: fixed
- CR-050 Pipeline durability failures do not stop publication: fixed
- CR-051 Managed hooks authorize nested validation pushes: still open
- CR-052 Mutating RPCs trust every same-account client: still open
- CR-053 Receipt recovery can duplicate an accepted run: fixed
- CR-054 Cancellation can leave an unrecorded published branch: fixed
- CR-055 Pipeline commands bypass the trusted configuration merge: fixed
- CR-056 The TUI can control another repository's run: fixed
- CR-057 Wizard choices do not configure the product: fixed
- CR-058 Service lifecycle can adopt a foreign definition: still open
- CR-059 Windows hooks cannot obtain admission tokens: still open
- CR-060 Release binaries report the development version: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate as an independently named, complete product without source-product references
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; the plan requires authenticated admission, durable same-branch replacement, a runnable fixed validation pipeline, guarded publication, transactional setup, owned platform services, and macOS, Linux, and Windows releases
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed-file conventions enforced by `scripts/validate.mjs`

## Change Profile

- intent and expected behavior: add the Safety Dance Go binary, durable local Git gate, daemon, validation and publication pipeline, operator interfaces, canonical skill, identity checks, and native releases
- change description quality: no pull request exists; commit subjects identify each phase and repair, but the code commits have no bodies explaining the imported design or known platform limits
- implementation model and review model: implementation models were not recorded in the selected implementation receipt; review model was `GPT-5.6 Sol`
- changed-line size and logical cohesion: 247 files, 40,634 insertions, and 4 deletions; the plan split the work into six logical phases, but the final review scope still combines the executable, imported support packages, skill distribution, and release machinery
- resulting large-file concerns: `internal/config/config.go` is 3,136 lines, `internal/scm/github/github.go` is 1,487 lines, `internal/agent/agent.go` is 1,353 lines, and `internal/db/run.go` is 1,122 lines; ownership is harder to verify where the production path bypasses the planned `custody` package
- dependency or lockfile changes: the new Go module adds 12 direct and 28 indirect modules with checksums; the review confirmed host tests and a Windows cross-build, but did not run a vulnerability or license scanner

## Tests Reviewed First

- behavior claimed by tests: unit and end-to-end tests claim gate authentication, replay rejection, branch replacement, publication ordering, service lifecycle, wizard compensation, runtime distribution, identity scanning, and release packaging; the earlier verification artifact records nine passing repository checks at `49c6c2d`
- missing or misleading coverage: no test drives the production `executeRun` registrations through a successful pipeline; no Darwin ancestry test, Windows admission test, Windows foreign-task ownership test, same-branch replacement during `push_active`, trusted-ref read-error test, origin-rollback test, or escaped service-path test exists

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5109` in / `73` out

### Correctness

- assessment and evidence: `executeRun` always calls `steps.Rebase`, which unconditionally returns an unavailable-owner error, so every production run fails before review or publication. Same-branch replacement also returns while the prior run owns publication, allowing the older candidate to reach the upstream before the accepted newer push starts.
- helper coverage: covered, level 3, confidence 0.96

### Readability and Simplicity

- assessment and evidence: the fixed pipeline is easy to trace, but exported step names imply working rebase, review, pull-request, and CI owners while their implementations are permanent errors. `internal/custody` claims ownership of durable handoff yet has no production caller, and its `CancelRun` comment still says the method clears push ownership after that behavior was removed.
- helper coverage: covered, level 3, confidence 0.78

### Architecture

- assessment and evidence: the daemon registers concrete closures for all core steps, but four required owners have no injection or adapter path. Runtime code calls `internal/db` directly while the plan's `internal/custody` boundary is unreachable from `cmd/safety-dance`, so the documented ownership split is not the implemented one.
- helper coverage: covered, level 3, confidence 0.96

### Security

- assessment and evidence: Darwin cannot read ancestor environments through `/proc`, but both hook-token and mutation authorization ignore that read failure. Nested validation descendants therefore pass the command ancestry checks on a released platform. Trusted default-branch configuration read failures are also treated as an absent file, which can silently discard maintainer policy.
- helper coverage: covered, level 3, confidence 0.88

### Performance

- assessment and evidence: no blocking hot-path regression was confirmed. TUI polling redraws every 250 milliseconds and each model load queries run state, steps, and responses, but the result set is branch-scoped and no measured failure establishes a gate-level performance defect.
- helper coverage: covered, level 2, confidence 0.57

## Verification Story

- command or inspection: `npm test`; `go test ./...`; `GOOS=windows GOARCH=amd64 go build ./...`; `git diff --check 4458fbf...HEAD -- . ':!.agents/tasks/**'`; `node scripts/check-safety-dance-identity.mjs`; production call tracing from `serveDaemon` through `executeRun`, `Manager.Replace`, `Publish`, wizard setup, and service management
- result: `npm test` passed validation, plugin sync, 136 Node tests, Go race tests, vet, temporary build, identity, and two release-contract tests. All host Go packages passed, the Windows cross-build passed, the product diff check passed, and the identity scan passed. These checks do not exercise the failing production pipeline or the unavailable platform trust paths.
- manual, screenshot, or before-and-after evidence: none; hosted release, live provider, macOS service, Windows service, and Git-for-Windows gate execution remain untested

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-061 Production runs cannot pass the fixed pipeline

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:400`
- failure mode: every production run reaches the rebase step and fails with `rebase gate is unavailable`, so no ordinary gate push or `safety-dance run` can complete validation or publish
- evidence or reproduction: `executeRun` registers `steps.Rebase` for every run at lines 400-401, and `internal/pipeline/steps/rebase.go:8-12` always returns an error. Review, pull-request, and CI are implemented the same way. Existing pipeline tests inject alternate functions and never execute this production registration.
- fix direction: connect concrete rebase, review, provider pull-request, and CI owners to the daemon, keep unavailable configured owners fail-closed, and add a production-path test that completes all fixed steps before publication

### CR-062 Darwin skips the nested-validation ancestry fence

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:119`
- failure mode: on macOS, a validation descendant can request a hook token or call a mutating RPC because the daemon never observes its inherited `SD_PARENT_RUN_ID`
- evidence or reproduction: both ancestry loops read `/proc/<pid>/environ` at lines 121 and 174, ignore read errors, and then authorize from command text. Darwin has no Linux `/proc` process environment, so the marker check never runs. This leaves prior CR-051 and CR-052 open on a released platform.
- fix direction: move process ancestry and environment inspection behind platform-specific implementations, fail closed when the marker cannot be established, and add Darwin tests for hook token issuance plus start, respond, and cancel RPCs from a marked descendant

### CR-063 A newer accepted push can wait behind publication of the older run

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/manager.go:48`
- failure mode: when an older same-branch run has `push_active=1`, replacement returns an error and the admission receipt retries later, while the older run remains free to publish a head that the gate has already superseded
- evidence or reproduction: `Manager.Replace` calls `CancelRun` before cancelling the context. `CancelRun` now updates only rows with `push_active=0` at `internal/db/runs.go:84`; a miss becomes an error at lines 89-92, and `Manager.Replace` returns at line 51 without cancelling. `Publish` never compares its candidate to the latest accepted gate head after acquiring ownership.
- fix direction: durably record supersession before publication can commit, make publication verify current branch ownership or accepted generation, and test a newer accepted push arriving while the older run is between `AcquireRunPushActive` and the remote write

### CR-064 Trusted configuration read failures are treated as no policy

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/daemon.go:378`
- failure mode: a missing or unreadable trusted ref, corrupt repository, or Git execution failure silently produces an empty trusted config and drops protected paths, gates, review rules, command opt-ins, and CI policy
- evidence or reproduction: `git.ShowFile` errors are ignored unless the call succeeds. The helper documentation at `internal/git/git.go:847-851` says callers must distinguish an absent path from real failures, and no separate trusted-config readability guard exists in the daemon.
- fix direction: verify the trusted ref, distinguish an absent `.safety-dance.yaml` blob from other Git failures, fail closed on real errors, and cover missing-file, missing-ref, and command-failure cases

### CR-065 Wizard rollback leaves the origin rewrite behind

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/wizard.go:44`
- failure mode: if gate initialization or service installation fails after the wizard changes `origin`, compensation removes only the Safety Dance gate and leaves the repository pointed at the newly entered upstream
- evidence or reproduction: `Write` calls `git.EnsureRemote(..., "origin", model.Upstream)` before `gate.Init`. `Compensate` at lines 54-59 only calls `gate.Eject`, and `gate.Init` observes the already changed origin as its starting state, so its transaction cannot restore the pre-wizard URL.
- fix direction: snapshot the original origin presence and URL before the first write, register its exact inverse in the wizard transaction, and test failures after both origin update and service activation

### CR-066 Windows service management can overwrite and delete a foreign task

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/service.go:52`
- failure mode: Windows install always uses `schtasks /Create ... /F` without checking ownership, and stop deletes the task with the same derived name even if another program created it
- evidence or reproduction: `definitionPath` returns an empty path for Windows at lines 65-66, so `ownedDefinition` and the new collision check cannot inspect a definition. The Windows install path at lines 162-163 forces replacement, and stop at line 204 deletes without an ownership check. Prior CR-058 therefore remains open on Windows.
- fix direction: query and parse the existing scheduled task, store and validate a runtime-home ownership marker, refuse foreign collisions, and add injected-executor tests for install and stop

### CR-067 The Windows release cannot admit pushes or mutate runs

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/admission.go:114`
- failure mode: the published Windows binary cannot obtain a push token, start a fresh run, respond, or cancel through the daemon
- evidence or reproduction: `managedHookPeer` returns false whenever `runtime.GOOS == "windows"`, and `AuthorizeMutationPeer` returns an unsupported error on Windows. The release matrix still publishes `windows/amd64` at `.github/workflows/safety-dance-release.yml:17`. This leaves prior CR-059 open and extends the block to every mutating RPC.
- fix direction: implement authenticated named-pipe peer ancestry and a Git-for-Windows hook fixture before publishing Windows assets, or remove Windows from the advertised release matrix until the platform works

### CR-068 The planned custody owner is orphaned

- type: Refactor suggestion
- severity: major
- category: Maintainability and code quality
- location: `tools/safety-dance/internal/custody/custody.go:20`
- failure mode: the codebase has two claimed owners for accepted-ref custody, while production daemon and manager code bypass the package and call `internal/db` directly
- evidence or reproduction: `go list -deps ./cmd/safety-dance` does not include `internal/custody`; only tests compile the package. The plan assigns accepted-ref and worktree ownership to this boundary, and task-created dead code is a required finding.
- fix direction: route daemon coordination through `custody.Store` and keep its contract current, or delete the package and revise the ownership design so one layer owns these transitions

### CR-069 Service definitions do not encode valid paths

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/service.go:33`
- failure mode: valid binary or runtime-home paths containing spaces or XML metacharacters produce malformed launchd or incorrectly tokenized systemd definitions, so setup reports a service that cannot start
- evidence or reproduction: the Darwin definition interpolates raw values into XML at line 35, and the Linux definition writes unquoted `ExecStart` and `Environment` values at line 37. Tests use `/opt/safety-dance` and a safe temporary home, then assert only substring presence.
- fix direction: serialize launchd XML with escaping, apply systemd argument and environment quoting rules, validate the generated definitions, and test spaces, ampersands, quotes, and backslashes

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: `tools/safety-dance/internal/custody` is not reachable from `cmd/safety-dance`; CR-068 records the required correction. No other whole package besides test-only `internal/e2e` was absent from the command dependency graph.
- dependency findings: `go.sum` pins the new module graph and the host suite plus Windows cross-build passed. Vulnerability, maintenance, and third-party license scanning were not available in this review, so no dependency approval beyond compilation is claimed.

## Verdict

- decision: request_changes
- overall code-health change: the latest fixes close several durable-state and repository-scoping defects, but the product still cannot complete its central production flow and retains cross-platform trust and ownership gaps
- rationale: CR-061 and CR-062 block approval on core behavior and security; the seven major findings cover accepted-head integrity, trusted policy, rollback, platform service safety, advertised Windows behavior, ownership, and valid service generation

## Review Limits

- blocked or unavailable checks: no pull request or hosted CI run exists; hosted release, authorized live-provider behavior, dependency vulnerability scanning, macOS launchd execution, Windows Task Scheduler execution, and Git-for-Windows admission were not available
- residual manual verification: after fixes, exercise a built binary through one successful production pipeline and repeat gate, nested-child, setup rollback, and service ownership tests on macOS and Windows
