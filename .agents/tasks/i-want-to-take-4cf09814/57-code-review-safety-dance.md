---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: dcbe68f259b8cfbbab118a5a05dc410f38ca5f1e
status: findings
summary: "The complete Safety Dance diff was reviewed through dcbe68f. Default runs cannot construct their typed owner, pull-request and CI steps can pass without SCM operations, and ten additional lifecycle, rollback, Windows, setup, configuration, and branding defects remain. The next fix round must close CR-155 through CR-166 before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `dcbe68f259b8cfbbab118a5a05dc410f38ca5f1e`
- commits: 103 commits from `origin/main` through `dcbe68f`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked task-owned directories

## Previous Round

- previous artifact: `55-code-review-safety-dance.md`
- CR-150 Ownership.Close can unlink a replacement daemon lock: fixed
- CR-151 Windows hook authorization rejects quoted paths containing spaces: fixed
- CR-152 Existing-gate rollback leaves per-worktree configuration and stamp state: still open
- CR-153 Status omits terminal branches when another branch is active: fixed
- CR-154 Concurrent notification delivery can start the same accepted push twice: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate under the independent Safety Dance identity with no shipped references to the source product
- implementation source: `05-plan-safety-dance.md`; the plan requires authenticated admission, durable branch runs, fixed typed validation, guarded publication, operator interfaces, supported-platform services, canonical skill distribution, identity enforcement, and native releases
- repository instructions: root and worktree `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add a standalone Safety Dance Go tool and skill while preserving gate, daemon, validation, publication, installation, identity, and release invariants
- change description quality: commit subjects identify the implementation and repair rounds; no pull request exists, so no title or body was available
- implementation model and review model: implementation model not recorded; review used GPT-5.6 Sol with four focused codebase-analyzer passes
- changed-line size and logical cohesion: 224 non-task files, 37,453 additions, and 4 deletions; the change is one product import but spans every trust boundary at once
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, and `internal/db/run.go` exceed 1,000 lines; the findings below concern behavior rather than size alone
- dependency or lockfile changes: a new Go module and lockfile add 11 direct dependencies and their transitive graph; generated notices and release packaging cover the graph, and no dependency finding was confirmed

## Tests Reviewed First

- behavior claimed by tests: aggregate Node and Go race tests cover gate setup, admission, branch replacement, publication ordering, CLI status, installer distribution, identity scanning, and release packaging
- missing or misleading coverage: production tests do not exercise default `auto` agent resolution, SCM-backed pull-request and CI completion, partial manager launch failure, cancel-versus-replace races, configured worktree placement, orphan-gate rollback, symlink hook rollback, UTF-16 Windows environments, the production wizard prompt order, the Windows scheduled-task action, or rendered legacy ASCII identity

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5458` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 5458 in / 73 out`

### Correctness

- assessment and evidence: the current aggregate passes, but production tracing found blocked default execution, self-certified SCM stages, cancellation and launch-retry races, ignored placement configuration, broken wizard ordering, and Windows service startup defects. These paths lack end-to-end regression tests.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: the main pipeline reads linearly, but declared owners such as `ResolveAgent`, `ReviewAgents`, `worktrees.Layout`, and SCM clients are bypassed by production wiring. The resulting duplicate or disconnected paths make the configured behavior differ from the executed behavior.
- helper coverage: covered, level 3, confidence 0.71

### Architecture

- assessment and evidence: `executeRun` constructs typed owners directly instead of using agent routing, PR and CI delegate to generic model verdicts instead of SCM owners, and worktree creation bypasses the package documented as the sole placement owner. These ownership breaks cause CR-155, CR-156, CR-160, and CR-166.
- helper coverage: covered, level 3, confidence 0.96

### Security

- assessment and evidence: Windows reads UTF-16LE environment blocks as byte strings, so daemon-side nested-run markers never match. Existing Unix tests do not prove the Windows authorization boundary.
- helper coverage: covered, level 2, confidence 0.55

### Performance

- assessment and evidence: no critical or major performance defect was confirmed. Status scans each repository's full run history, but the review found no measured hot-path failure or task requirement that makes this blocking.
- helper coverage: covered, level 3, confidence 0.52

## Verification Story

- command or inspection: `npm test`; `go test -race ./internal/daemon ./internal/gate ./internal/cli`; Windows cross-compilation with `GOOS=windows GOARCH=amd64 go test -c -o <temp>` for daemon, CLI, and Git packages; complete diff and caller inspection
- result: the root aggregate passed with 136 Node tests, all Go race packages, vet, a temporary binary build, identity checks, and two release tests. Focused race tests passed. Windows test binaries compiled; hosted Windows execution was unavailable.
- manual, screenshot, or before-and-after evidence: no pull request, hosted release, authorized live-provider run, or Windows host was available. Source inspection decoded the post-receive banner as the retired "NO MISTAKES" name.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-155 Default runs cannot resolve the typed validation owner

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:485`
- failure mode: a default installation reaches the first typed step with agent `auto`; `agent.NewWithOptions` does not accept `auto`, so the run fails before validation.
- evidence or reproduction: `DefaultGlobalConfig` selects `AgentAuto` at `internal/config/config.go:1909-1914`. `executeRun` merges and passes that value directly at `internal/cli/daemon.go:485-515`. `Typed` constructs it directly at `internal/pipeline/steps/validation.go:90-100`. The implemented `Config.ResolveAgent` at `internal/config/config.go:1338-1375` has no production caller.
- fix direction: resolve the merged agent list once before pipeline registration, retain the resolved fallback chain, and add a production-path test for an absent global config with one available harness.

### CR-156 Pull-request and CI stages can pass without SCM operations

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/pr.go:5`
- failure mode: an agent can return `{"verdict":"pass"}` for pull-request and CI, allowing the run to complete without creating a pull request or observing CI.
- evidence or reproduction: `PR` and `CI` only call generic `Typed` at `internal/pipeline/steps/pr.go:5-6` and `ci.go:5-6`. `Typed` accepts a model verdict at `validation.go:107-126`. No production step calls the added SCM clients or persists a PR URL, although `db.UpdateRunPRURL` exists. `executeRun` treats those nil returns as completion at `internal/cli/daemon.go:530-583`.
- fix direction: route pull-request creation and CI polling through the SCM owner, persist provider identity and PR URL, and derive pass only from observed provider state. Keep typed agents for analysis, not external-state attestation.

### CR-157 Cancelling an older run can cancel its replacement

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:332`
- failure mode: a cancel request for run A can cancel and wait for newer run B on the same branch if replacement occurs between the database update and `Manager.Active` lookup.
- evidence or reproduction: the handler cancels by run ID, reloads A, then looks up the current branch handle and cancels it without checking its run ID at `internal/cli/daemon.go:332-344`. `Manager.Replace` swaps branch-keyed handles at `internal/daemon/manager.go:63-100`; `Active` accepts only the branch key at lines 115-119.
- fix direction: make the manager cancel operation compare the requested run ID under its lock and act only on that exact handle; add a barrier-based cancel-versus-replace race test.

### CR-158 Partial launch failure is acknowledged as an already-started run

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/manager.go:79`
- failure mode: if status transition or worktree ownership commit fails after run insertion, the row remains pending or running without an executor. Notification retry then finds the launch nonce and returns success, removing the durable receipt while the daemon stays alive.
- evidence or reproduction: `Manager.Replace` persists before transition, ownership commit, handle registration, and goroutine start at `internal/daemon/manager.go:79-102`. `recordPush` returns nil for any matching nonce at `internal/cli/daemon.go:405-408`. Recovery exists only during daemon startup.
- fix direction: distinguish active ownership from an inert duplicate row and resume or register the latter before acknowledging the receipt; test failures at both post-insert steps without restarting the daemon.

### CR-159 Windows nested-run authorization cannot read environment markers

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/processenv_windows.go:31`
- failure mode: Windows validation descendants can pass daemon-side mutation authorization because the UTF-16LE environment block is searched as UTF-8 bytes, so `SD_PARENT_RUN_ID=` and `SD_MANAGED_HOOK=` never match.
- evidence or reproduction: `processEnvironment` returns raw remote bytes at `processenv_windows.go:31-38`. Authorization converts them directly with `string(env)` and calls `strings.Contains` at `internal/daemon/admission.go:137-141,236-241`. ASCII characters in a Windows environment block are separated by NUL bytes.
- fix direction: decode the environment block as UTF-16LE into entries before marker checks and add Windows-specific unit coverage for both markers.

### CR-160 Configured worktree roots are ignored for new runs

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:261`
- failure mode: valid `worktree_roots` configuration never affects explicit or admitted runs; all worktrees land below `SD_HOME`, and startup recovery scans only the default root.
- evidence or reproduction: creation uses `p.WorktreeDir` at `internal/cli/daemon.go:261-262,410-412`. `worktrees.Layout.Dir`, documented as the sole new-run placement decision at `internal/worktrees/worktrees.go:53-63`, has no production caller. The global config is not loaded until execution after creation at `internal/cli/daemon.go:461-490`.
- fix direction: construct and validate one layout before worktree creation, persist its selected path, and recover journals from configured roots using durable run records.

### CR-161 Fresh-init rollback can delete a pre-existing orphan gate

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/gate/gate.go:193`
- failure mode: a failed initialization with no database row unconditionally removes the deterministic gate directory, even when it existed before the attempt and contains accepted refs or user data.
- evidence or reproduction: `provisionGate` reuses an existing bare directory via `git init --bare` at `internal/gate/gate.go:252-255`. Both provisioning failure and database insertion failure call `os.RemoveAll(bareDir)` when `existing == nil` at lines 193-202 and 223-229. The pre-mutation snapshot is ignored in this branch.
- fix direction: record whether the directory existed. Remove only a directory created by this attempt; otherwise restore owned metadata while preserving refs and unknown files. Add an orphan-gate failure test with a sentinel ref.

### CR-162 Existing-gate rollback converts custom hook symlinks into files

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/gate/gate.go:35`
- failure mode: failed gate repair destroys a custom hook's symlink identity and replaces it with a copied regular file.
- evidence or reproduction: `snapshotGate` uses `os.Stat` and `os.ReadFile`, which follow symlinks and discard their target at `internal/gate/gate.go:35-55`. Hook refresh renames a custom hook and writes a managed regular file at `internal/git/hook.go:130-148,219-239`. Restore writes saved bytes with `os.WriteFile` at `internal/gate/gate.go:58-76`. The regression test creates regular files only.
- fix direction: journal file type and symlink target with `Lstat` and `Readlink`, restore links atomically, and add pre- and post-receive symlink rollback tests.

### CR-163 The production wizard reads commands before showing the upstream prompt

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/wizard/setup.go:53`
- failure mode: first-time `safety-dance` setup blocks without a prompt; the user's upstream URL is consumed as the eight-command answer and rejected.
- evidence or reproduction: production passes `PromptLabels: []string{"upstream", "commands"}` at `internal/cli/wizard.go:140-143`. The label-building loop immediately reads `commands` at `internal/wizard/setup.go:53-73`, before the prompt loop prints `upstream` at lines 83-89.
- fix direction: model commands as an ordinary prompted field or process every label in one ordered print/read loop; test the exact production label sequence and transcript.

### CR-164 The Windows scheduled-task action is malformed

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/service.go:203`
- failure mode: the scheduled task receives literal backslashes around the executable and can be registered successfully while failing to start the persistent daemon, especially for paths containing spaces.
- evidence or reproduction: the raw format string contains `\\\"%s\\\"`; raw strings preserve those backslashes. `cmd.exe` does not use backslash as its quote escape. Host tests execute only the current OS branch, and CI runs on Linux.
- fix direction: construct a valid Windows command line with Windows quoting rules or a structured task definition, quote `SD_HOME` safely, and assert the exact `/TR` argument in a Windows-specific test.

### CR-165 The post-receive banner still displays the retired product name

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/git/hook.go:83`
- failure mode: every accepted push prints a three-line ASCII rendering of "NO MISTAKES", exposing the source product identity despite the task's no-reference requirement.
- evidence or reproduction: decoding lines 84-86 yields the retired two-word name. The identity scanner searches text tokens and therefore reports clean even though this user-facing rendered form remains.
- fix direction: replace the banner with Safety Dance text and add a rendered-banner assertion or normalized glyph fixture to the identity contract.

### CR-166 Typed review ignores reviewer ownership and fallback agents

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:90`
- failure mode: `review_agents.reviewer` and the configured fallback list are accepted but never used, so all typed stages run only the primary agent.
- evidence or reproduction: `Typed` constructs only `cfg.Agent` at `validation.go:90-98`. `Config.ForReviewAgent` exists at `internal/config/review_agents.go:34-49`, and the agent package has review-role routing, but production pipeline wiring calls neither. `cfg.Agents` is not traversed.
- fix direction: resolve and construct the configured fallback owner once, route the review purpose through the reviewer role, and add tests proving role selection and fallback behavior.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: `Config.ResolveAgent`, review-role routing, SCM pull-request/CI owners, and `worktrees.Layout.Dir` are behavior owners with no production path; CR-155, CR-156, CR-160, and CR-166 require wiring them rather than deleting them
- dependency findings: no critical or major dependency, lockfile, license, or notice defect was confirmed

## Verdict

- decision: request_changes
- overall code-health change: the branch adds a coherent product boundary and extensive checks, but production wiring still bypasses several declared owners and retains data-loss, authorization, platform, setup, and identity failures
- rationale: three critical and nine major findings remain; green aggregate tests do not exercise the failing production paths

## Review Limits

- blocked or unavailable checks: no hosted Windows execution, hosted `safety-dance-v*` release, authorized live-provider run, or pull-request CI run was available.
- residual manual verification: after fixes, run the real setup transcript, a Windows hook/service flow, a provider-backed pull-request and CI flow, orphan and symlink rollback fixtures, and cancellation/launch-recovery race tests
