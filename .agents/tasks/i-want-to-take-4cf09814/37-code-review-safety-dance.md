---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 037ecf13fc2befa3772bd618ad5688dbf45d0060
status: findings
summary: "Review of the 72-commit Safety Dance change found that the fixed pipeline still self-certifies named gates, executes unchecked working-tree commands, and lets nested validation descendants authorize pushes or mutate runs over IPC. Receipt replay, cancellation, Windows admission, TUI scoping, wizard and service ownership, and release metadata also retain critical or major failures. The next fix round must close these boundaries and connect the imported validation owners before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `037ecf13fc2befa3772bd618ad5688dbf45d0060`
- commits: 72 commits in `origin/main..HEAD`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: all `.agents/tasks/i-want-to-take-4cf09814/` artifacts and task-owned untracked evidence; the review covered the committed product diff against `origin/main`

## Previous Round

- previous artifact: `35-code-review-safety-dance.md`
- CR-045 Ordinary runs publish without executing the named validation gates: still open
- CR-046 Any local IPC client can mint a managed-hook admission token: still open
- CR-047 Accepted updates still have no durable delivery recovery: still open
- CR-048 The TUI response key silently approves blocked gates: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; fold the referenced repository's behavior into this repository under an independent identity
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`
- repository instructions: root and worktree `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add the independently branded Safety Dance local Git gate, durable daemon, fixed validation pipeline, guarded publication, operator interfaces, runtime skill distribution, identity checks, and native releases
- change description quality: commit subjects identify phases and repair rounds, but the implementation receipts and passing checks overstate production validation because synthetic tests do not call the unconnected agent, rebase, provider, or CI owners
- implementation model and review model: implementation model not recorded; review model GPT-5.6 Sol
- changed-line size and logical cohesion: 208 non-task files, 35,573 additions, 4 deletions; the imported system is one product, but the unconnected owners and repeated placeholder stages make the current diff incomplete rather than merely large
- resulting large-file concerns: `internal/config/config.go` is 3,136 lines, `internal/scm/github/github.go` is 1,487 lines, and `internal/agent/agent.go` is 1,353 lines; the more immediate concern is that much of this imported code is not reachable from the production pipeline
- dependency or lockfile changes: new Go module and `go.sum`; `npm test`, Go race tests, vet, and build pass, with no new root npm dependency

## Tests Reviewed First

- behavior claimed by tests: hook authentication and replay rejection, durable branch runs, fixed step order, stop-on-failure behavior, guarded publication, CLI/TUI/wizard/service behavior, installer distribution, identity scanning, and release packaging
- missing or misleading coverage: hook e2e injects tokens directly and never proves automatic issuance from an ordinary or nested push; pipeline tests use synthetic closures; validation tests cover only configured test and lint commands; no test exercises production rebase, agent review, PR creation, CI monitoring, durable step-write failure, cross-repository TUI selection, service-definition collision, Windows token issuance, or the version reported by a release binary

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5635` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 5635 in / 73 out`

### Correctness

- assessment and evidence: the production runner marks placeholder gates complete, ignores completion-write failures, can replay one receipt into multiple runs, allows cancellation after a remote write without a publication receipt, selects another repository's active run in the TUI, discards wizard answers, rejects automatic token issuance on Windows, and releases binaries that report `dev`
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: eight named stage files are one-line wrappers around a generic helper, while the imported agent and provider implementations remain disconnected. The names imply behavior the call graph does not perform, which makes the safety boundary harder to audit.
- helper coverage: covered, level 3, confidence 0.56

### Architecture

- assessment and evidence: `executeRun` owns pipeline assembly but bypasses `config.EffectiveRepoConfig`, the agent owners, rebase owner, SCM provider owners, CI owner, and the existing `gatecontext.Inspector`. Admission retry also calls non-idempotent run creation directly.
- helper coverage: covered, level 3, confidence 0.94

### Security

- assessment and evidence: shell commands are loaded from a mutable checkout instead of the trusted/pushed configuration merge, managed hooks authorize validation descendants, and mutating RPC handlers accept any same-account socket client without process ancestry enforcement
- helper coverage: covered, level 3, confidence 0.88

### Performance

- assessment and evidence: no critical hot-path query or allocation defect was found. The TUI appends a full render every 250 milliseconds even when state is unchanged, which grows terminal scrollback and performs four database refreshes per second.
- helper coverage: covered, level 2, confidence 0.63

## Verification Story

- command or inspection: `npm test`; `go test -count=1 ./internal/daemon ./internal/pipeline/steps ./internal/tui`; `go test -race -count=1 ./internal/daemon ./internal/pipeline/steps ./internal/tui`; complete `origin/main...HEAD` diff and production call-path inspection
- result: all commands exited 0; the root run reported 136 passing Node tests plus passing Safety Dance race, vet, build, and release checks. The findings below are uncovered production paths, not failing existing checks.
- manual, screenshot, or before-and-after evidence: no new manual or screenshot evidence; the verification artifact's hosted release and live-provider limits remain untested

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-049 Named validation stages still self-certify

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:44`
- failure mode: an ordinary run can publish after only optional prepare/test/format/lint shell commands and repeated `git diff --check`; rebase, agent review, pull-request creation, and CI monitoring never execute, and an empty command configuration also skips the test suite
- evidence or reproduction: `rebase.go`, `review.go`, `pr.go`, and `ci.go` only call `Validate`; its switch has commands for intent, test, lint, and document only. `executeRun` sets `Candidate` and `ReviewedHead` to the same `run.HeadSHA` before the placeholder review, so the publication review guard passes by construction (`internal/cli/daemon.go:368-391`).
- fix direction: connect each named stage to its imported owner, derive the reviewed head from a successful durable review result, fail closed when required validation is unavailable, and add a production-path test that prevents publication on each gate failure

### CR-050 Pipeline durability failures do not stop publication

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/runner.go:94`
- failure mode: if `FailStep` or `CompleteStep` cannot persist the typed result, the runner discards the database error and can continue to publication without a durable receipt for the preceding gate
- evidence or reproduction: both persistence calls assign their errors to `_`; `Publish` checks run status and `push_active` but does not prove that every prior durable step completed
- fix direction: return step-persistence errors, stop the runner, and make publication verify the required durable gate results for the same candidate and validation generation

### CR-051 Managed hooks authorize nested validation pushes

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:112`
- failure mode: a validation command or agent can run `git push` to the Safety Dance remote; the real pre-receive hook satisfies `managedHookPeer`, mints a token, and starts a nested run instead of refusing parent-run control
- evidence or reproduction: the hook automatically calls `issue-push-token` when no token is supplied (`internal/git/hook.go:46-65`), while admission stops ancestry inspection as soon as it finds hook command text and never calls the existing `gatecontext.Inspector`. The e2e "no token" case actually sends an empty token push option and exercises a different rejection branch (`internal/daemon/hook_e2e_test.go:94-101`).
- fix direction: classify the authenticated peer's full ancestry, reject daemon and active-agent descendants before issuance, and add an e2e push from an active validation descendant

### CR-052 Mutating RPCs trust every same-account client

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/daemon.go:214`
- failure mode: a validation child can connect directly to the user-owned socket and start or replace a run, submit approve/skip responses, or cancel a run without passing the CLI environment guard
- evidence or reproduction: handlers for `start_fresh_run`, `respond`, and `cancel_run` never inspect `ipc.PeerPID(ctx)` or call `gatecontext.Inspector` (`internal/cli/daemon.go:214-282`). Socket mode `0600` authenticates the account, not trusted ancestry, and `nestedMutation` only checks a removable client environment variable (`internal/cli/root.go:37-41`).
- fix direction: enforce authenticated process ancestry at every mutating IPC handler and test direct RPC calls from an active validation descendant

### CR-053 Receipt recovery can duplicate an accepted run

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/admission.go:87`
- failure mode: a crash after `recordPush` creates a run but before receipt deletion leaves the receipt durable; restart calls `recordPush` again, creates a new worktree and replacement run, and can strand the original durable run
- evidence or reproduction: `ReconcileOnce` invokes the side-effecting callback before deleting and saving the receipt. Reconciliation starts before `Manager.Recover` (`internal/cli/daemon.go:201-285`), and `recordPush` always generates a fresh nonce/worktree before `Replace` (`internal/cli/daemon.go:323-337`).
- fix direction: give admitted updates a stable durable identity, make notification-to-run creation idempotent in one transaction, recover existing runs before replay, and remove a receipt only after the idempotent binding commits

### CR-054 Cancellation can leave an unrecorded published branch

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/db/runs.go:79`
- failure mode: cancellation can report success after the remote branch and gate mirror changed but before the publication binding commits, leaving a cancelled run with externally published code and no replay receipt
- evidence or reproduction: `Publish` performs the remote push and mirror update before `RecordPublicationAndBinding` (`internal/pipeline/steps/push.go:104-131`). `CancelRun` does not wait on or reject `push_active`; it sets status to cancelled and clears the flag immediately, causing the later guarded binding to fail.
- fix direction: serialize cancellation with publication ownership, refuse or wait while `push_active` covers an irreversible external write, and add a barrier test at the post-push/pre-binding boundary

### CR-055 Pipeline commands bypass the trusted configuration merge

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/daemon.go:360`
- failure mode: the daemon loads `.safety-dance.yaml` from the mutable working checkout and executes its command strings with `sh -c`, bypassing the trusted-default-branch policy and `allow_repo_commands` decision
- evidence or reproduction: `executeRun` calls `config.LoadRepo(repo.WorkingPath)` and passes the result directly to `Validate`; `config.EffectiveRepoConfig` is never called by the production pipeline. Its contract states that command and agent selection must come from the trusted copy unless the trusted copy opts into pushed commands (`internal/config/config.go:2492-2534`).
- fix direction: load pushed configuration from the owned candidate worktree, load trusted configuration from the configured default ref, combine them through `EffectiveRepoConfig`, and execute only that result

### CR-056 The TUI can control another repository's run

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/tui.go:29`
- failure mode: running bare `safety-dance` in repository A may display, approve, skip, or abort the newest active run from repository B
- evidence or reproduction: the default command verifies that the current repository is registered but then queries all active runs (`internal/cli/default.go:14-28`). The TUI repeats the global query, selects `runs[0]`, and sends mutations for that run ID (`internal/cli/tui.go:29-95`); `GetActiveRuns` explicitly returns runs across all repositories (`internal/db/run.go:447-452`).
- fix direction: bind the default and TUI views to the current repository ID, or require an explicit run/repository selector before any mutation

### CR-057 Wizard choices do not configure the product

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/wizard.go:43`
- failure mode: the wizard asks for upstream, gate, and provider but discards all three values, never asks for validation commands or service confirmation, and always installs the service
- evidence or reproduction: `Setup.Run` fills three model fields, while the production `Write` callback ignores its model and only calls `gate.Init`; `ConfirmService` and `ValidationCommands` are never populated, and a non-nil `InstallService` always runs (`internal/wizard/setup.go:32-65`).
- fix direction: either collect and transactionally apply every planned choice, including explicit service confirmation, or remove unsupported prompts and expose a truthful smaller setup flow

### CR-058 Service lifecycle can adopt a foreign definition

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/service.go:68`
- failure mode: any file at the derived service path is treated as Safety Dance-owned, overwritten on a successful install, and later deleted on stop even when its contents point to another binary or runtime home
- evidence or reproduction: `DefinitionExists` checks pathname existence only; `Install` restores prior bytes only when activation fails, and `Stop` removes the path after a successful unload/disable (`internal/daemon/service.go:68-76,118-168`)
- fix direction: parse and verify an ownership marker, label, binary, and `SD_HOME` before repair or removal; refuse collisions and test preservation of a foreign definition

### CR-059 Windows hooks cannot obtain admission tokens

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/admission.go:114`
- failure mode: the supported Windows binary cannot authorize an ordinary gate push because `managedHookPeer` returns false unconditionally on Windows and no public command supplies a valid token
- evidence or reproduction: the pre-receive hook requests a token when none is supplied, but Windows always rejects the request at `runtime.GOOS == "windows"`; hook e2e skips Windows entirely
- fix direction: implement authenticated Windows ancestry for the named-pipe peer and add a Git-for-Windows admission test, or remove Windows from the supported release contract until the boundary works

### CR-060 Release binaries report the development version

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `.github/workflows/safety-dance-release.yml:34`
- failure mode: an archive named for a release contains a binary whose `--version` reports `dev`, so operators cannot identify the installed release
- evidence or reproduction: the workflow validates the tag but runs plain `go build`; `buildinfo.Version` defaults to `dev` and documents linker injection as the release mechanism (`internal/buildinfo/version.go:5-29`). Release tests inspect names and checksums but do not run the packaged binary.
- fix direction: inject the validated version, commit, and build date with linker flags, then execute each built binary in the release-contract test and assert the tag version

## Advisories

### ADV-001 TUI polling floods terminal scrollback

- type: Potential issue
- severity: minor
- category: Performance and scalability
- location: `tools/safety-dance/internal/tui/app.go:39`
- evidence: the app prints a full status block every 250 milliseconds with no cursor replacement or unchanged-state suppression
- suggestion: render only on state change or use a terminal renderer that replaces the prior frame

### ADV-002 Missing-binary guidance points to the skill installer

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `skills/delivery/safety-dance/SKILL.md:14`
- evidence: the skill points a missing executable to `scripts/install.mjs`, while `docs/safety-dance.md` states that script installs only the skill and the binary is separate
- suggestion: point executable diagnosis to release archives or source-build instructions, and reserve `scripts/install.mjs` for the agent skill

## Dead Code and Dependency Review

- newly orphaned code: the imported agent runners, rebase behavior, SCM pull-request providers, and CI configuration are not reachable from `executeRun`; CR-049 requires connecting them or deleting unsupported claims and code
- dependency findings: the new Go dependency graph builds and passes race tests and vet; no concrete license, maintenance, or known-vulnerability finding was established in this review

## Verdict

- decision: request_changes
- overall code-health change: the change adds a broad, tested product shell, but its trusted path still permits publication and control without the validation, ancestry, durability, and ownership guarantees the task requires
- rationale: CR-049, CR-051, CR-052, and CR-055 cross critical validation or authorization boundaries; the remaining major findings can lose durable state, mutate the wrong run, break supported Windows and release behavior, or overwrite operator-owned configuration

## Review Limits

- blocked or unavailable checks: no hosted `safety-dance-v*` release, authorized live-provider run, or pull-request CI run exists; those limits remain as recorded in the verification artifact
- residual manual verification: native launchd, systemd, Task Scheduler, Git for Windows, compact terminal, and hosted release behavior still need platform evidence after the code findings are fixed
