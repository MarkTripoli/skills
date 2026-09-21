---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 690c067eb66b9da34e9a51d6446c9c603c1eba42
status: findings
summary: "The complete 38,280-line task diff and the latest trust-boundary fix were reviewed at 690c067. Safety Dance still cannot run its validation pipeline, its admission and notification boundary is bypassable, service and wizard lifecycle operations can damage or fail existing installations, valid configuration is rejected while nested typos pass, the TUI is not interactive, publication can bind after cancellation, and the required Go aggregate fails. The next fix round must close these critical and major findings and restore the aggregate before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `690c067eb66b9da34e9a51d6446c9c603c1eba42`
- commits: 60 commits in `origin/main..HEAD`, ending with `5e48861 fix(safety-dance): close reviewed trust boundaries` and `690c067 docs(task): code-review-fixes artifact`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked task-owned directories; product review covered the remaining `origin/main...HEAD` diff

## Previous Round

- previous artifact: `27-code-review-safety-dance.md`
- CR-001 Validation steps approve every candidate without validation: fixed
- CR-002 Abort changes SQLite but leaves publication running: fixed
- CR-003 The receive gate authorizes ordinary direct pushes: still open
- CR-004 Accepted heads do not receive isolated worktrees: fixed
- CR-005 Publication can bind a candidate without checked reviewed-head continuity: still open
- CR-006 Fresh CLI runs never execute: fixed
- CR-007 Notifications can fabricate accepted updates: still open
- CR-008 Concurrent same-branch replacements can run together: fixed
- CR-009 A daemon crash leaves a permanent ownership lock: fixed
- CR-010 Service installation and stopping do not identify or control a service: still open
- CR-011 Wizard rollback can delete a pre-existing installation: still open
- CR-012 Repository configuration accepts misspelled safety fields: still open
- CR-013 Query-string credentials are persisted and logged: fixed
- CR-014 The installed skill documents a command the binary rejects: fixed
- CR-015 Release archives omit the required license notice: fixed
- CR-016 A custom post-receive hook disables durable run creation: still open
- CR-017 The TUI is a one-shot text print rather than an operator interface: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; acceptance contract in `05-plan-safety-dance.md`
- implementation source: `05-plan-safety-dance.md`, `26-implementation-safety-dance.md`, and the latest fix receipt `28-code-review-fixes-safety-dance.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: ship an independently branded local Git gate with authenticated admission, durable branch runs, real validation, guarded publication, operator interfaces, canonical skill distribution, and native releases
- change description quality: commit subjects identify phases and repair rounds, but the latest fix receipt calls several boundaries fixed even though the current code and required aggregate contradict those dispositions; no pull request exists, so no PR title or body was available
- implementation model and review model: implementation model not recorded in the selected implementation artifact; review model `GPT-5.6 Sol`
- changed-line size and logical cohesion: 234 files and 38,280 inserted lines span a complete imported product plus repository integration; this is too large for one review unit and has already required repeated verification and repair rounds
- resulting large-file concerns: `internal/config/config.go` is 3,119 lines and combines schema, parsing, merging, trust policy, and validation; the immediate findings below are behavioral rather than a size-only objection
- dependency or lockfile changes: a new Go module and lockfile add the tool dependencies; no new dependency-specific blocker was confirmed in this pass

## Tests Reviewed First

- behavior claimed by tests: gate initialization and hook preservation, authenticated hook execution, durable run coordination, publication ordering, service definitions, wizard compensation, CLI controls, TUI rendering, identity enforcement, installer distribution, and release packaging
- missing or misleading coverage: service tests only record executable names and never require definition files to exist; wizard tests use an abstract compensation callback instead of the CLI's broad `gate.Eject`; configuration tests cover only `{}` and a global unknown key; TUI tests cover static rendering only; admission tests do not bind notification to the consumed admission; the current hook and gate tests fail after the companion-hook change

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5441` in / `73` out

### Correctness

- assessment and evidence: every daemon-run pipeline stops at the first unconfigured step (`internal/cli/daemon.go:327-360`, `internal/pipeline/steps/intent.go:8-14`); valid repository fields are rejected while nested typos are accepted (`internal/config/config.go:263-346,2341-2357`); the required Go aggregate currently fails three gate and hook tests
- helper coverage: covered, level 3, confidence 0.96

### Readability and Simplicity

- assessment and evidence: the public runtime path is short enough to trace, but it fronts tens of thousands of imported lines while the core step functions remain 15-line failure stubs. The service API renders definitions that installation never writes, which splits one lifecycle operation into disconnected code paths (`internal/daemon/service.go:23-80`)
- helper coverage: covered, level 2, confidence 0.84

### Architecture

- assessment and evidence: admission consumption and accepted-update notification are separate, unbound IPC methods, so the daemon cannot prove that a notification corresponds to the update it admitted (`internal/daemon/admission.go:57-84`). Wizard rollback discards gate transaction ownership and substitutes broad ejection (`internal/cli/wizard.go:38-50`)
- helper coverage: covered, level 3, confidence 0.62

### Security

- assessment and evidence: any same-user local IPC client with a peer PID can issue an admission token, and notification requires only a same-user peer plus caller-supplied gate/ref/SHA. Neither path applies the available nested-run ancestry classifier or a durable one-use receipt (`internal/daemon/admission.go:42-54,68-84`)
- helper coverage: covered, level 3, confidence 0.59

### Performance

- assessment and evidence: no new hot-path query, unbounded network loop, or allocation regression was confirmed. Branch runs use detached worktrees and the manager releases its mutex before long-running execution (`internal/daemon/manager.go:42-88`)
- helper coverage: covered, level 3, confidence 0.67

## Verification Story

- command or inspection: `cd tools/safety-dance && go test ./internal/git ./internal/daemon ./internal/cli ./internal/config ./internal/pipeline/... ./internal/safeurl ./internal/worktrees`
- result: failed in `internal/git`; `TestRefreshManagedPostReceiveHookPreservesCustomHook` and `TestPostReceiveHook_FallsBackToHookLocationForGateDir` failed
- command or inspection: `npm run test:safety-dance`
- result: failed; `internal/gate` failed `TestInitRefreshPreservesCustomPostReceiveHook`, and `internal/git` failed the two hook tests above
- command or inspection: direct `LoadRepoFromBytes` probe with `no_ci: true` and `commands.tset`
- result: the valid `no_ci` field returned `unknown field "no_ci"`; the misspelled nested command returned no error
- command or inspection: `GOOS=windows GOARCH=amd64 go test -c ./internal/daemon`
- result: passed compilation
- manual, screenshot, or before-and-after evidence: static code inspection only; no live hosted release, provider, or interactive terminal evidence was available

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-018 The daemon has no working validation pipeline

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:327`
- failure mode: every fresh or received run fails on `intent` before review, test, document, lint, push, pull request, or CI can execute, so the tool cannot perform its core task
- evidence or reproduction: `executeRun` registers the eight core step functions directly at lines 327-348; each function, beginning with `steps.Intent` at `internal/pipeline/steps/intent.go:8-14`, returns `"... implementation is not configured"` for every non-cancelled context
- fix direction: connect the imported agent, configuration, command, provider, and evidence owners to concrete step implementations; keep fail-closed behavior for a genuinely missing dependency, and add a built-binary end-to-end test that reaches guarded publication through real validation

### CR-019 Admission tokens do not authorize the matching notification

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:68`
- failure mode: any same-user process can call `notify_push` with a registered gate path and arbitrary new SHA, causing `recordPush` to create a durable run without proving Git accepted an update that passed pre-receive admission
- evidence or reproduction: `notifyPush` checks only `PeerPID > 0` and non-empty caller fields at lines 68-80; the one-use token is consumed and discarded by `admit` at lines 57-65, and `recordPush` trusts the notification's `New` value at `internal/cli/daemon.go:261-299`
- fix direction: mint a durable one-use admission receipt bound to peer lineage, gate, ref, old SHA, and new SHA; require and consume it in `notify_push` before creating the accepted ref and run

### CR-020 Any local child can mint the token that supposedly protects the gate

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:42`
- failure mode: the receive hook now rejects tokenless pushes, but the token-issuing IPC method grants a gate/ref token to any same-user process with a peer PID, including a nested validation child; the hidden CLI exposes that method, so the gate still lacks the parent-process policy required by the plan
- evidence or reproduction: `issue` checks only `PeerPID > 0` at lines 42-54; `AuthenticateAdmission` likewise checks only peer presence and token equality in `internal/ipc/auth.go:63-73`; the hook accepts that token from a push option at `internal/git/hook.go:46-60`; no public run or documented push flow obtains the now-required option
- fix direction: apply the authoritative gate-context ancestry policy when issuing and consuming tokens, issue tokens only from an explicit trusted top-level operation, and add a supported command path that performs the tokenized push while proving nested children cannot use it

### CR-021 Service installation references files it never creates

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/service.go:50`
- failure mode: macOS and Linux installation ask the service manager to load a plist or unit under `SD_HOME`, but no code writes either definition, so a new installation cannot start the daemon service
- evidence or reproduction: `Definition` only returns a string at lines 23-37; `Install` validates that string and then invokes `launchctl load <home>/safety-dance.plist` or `systemctl --user enable ...service` at lines 50-67. Search found no production write of the returned definition; `service_test.go:31-42` records only command names
- fix direction: write the platform definition atomically to the platform-correct user service location, load that exact file or unit, verify its binary and `SD_HOME`, and remove only the owned definition on uninstall

### CR-022 Wizard compensation can eject a repaired installation

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/wizard.go:38`
- failure mode: if service installation fails after `gate.Init` repaired an existing installation, compensation calls broad `gate.Eject` and can delete pre-existing gate, remote, database, or hook state rather than only mutations made by this wizard attempt
- evidence or reproduction: the CLI wires every write failure to `gate.Eject` at lines 41-47; the abstract wizard tests only verify that a callback ran and carry no created-versus-repaired journal (`internal/wizard/setup.go:45-61`)
- fix direction: make gate initialization return a mutation journal or rollback closure, record each successful service and gate mutation, and compensate those entries in reverse order without ejecting pre-existing state

### CR-023 Repository strict parsing rejects valid fields and misses nested typos

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/config/config.go:2341`
- failure mode: valid `commit`, `intent`, `providers`, `disable_project_settings`, and `no_ci` settings are rejected, while misspelled nested safety-sensitive keys are silently ignored
- evidence or reproduction: `RepoConfig` declares these fields at lines 291-346, but the hand-written allowlist at line 2346 omits them and validates only top-level keys; a direct probe returned `unknown field "no_ci"` for `no_ci: true` and no error for `commands:\n  tset: npm test`
- fix direction: decode the full repository schema with `yaml.Decoder.KnownFields(true)` or recursively validate nodes while preserving the custom `agentList` decoder; add table tests for every valid top-level field and unknown keys at each nested safety-sensitive object

### CR-024 The TUI never starts an interactive application

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/tui.go:15`
- failure mode: `safety-dance tui` prints one database snapshot and exits; it cannot receive daemon events, refresh state, show prompt changes, or support operator interaction
- evidence or reproduction: `renderTUI` reads active runs once and calls `tui.Plain` at lines 20-39; `tui.App.Run` only blocks until context cancellation at `internal/tui/app.go:5-7`; no CLI path constructs or runs the app
- fix direction: connect the daemon event subscription to a semantic model update loop, run the terminal application, expose required response controls, and test state changes and keyboard interaction rather than static strings only

### CR-025 The custom-hook repair leaves the required aggregate red

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/git/hook.go:198`
- failure mode: the branch cannot pass its own Safety Dance aggregate, and the hook preservation behavior is contradicted by current gate and Git tests
- evidence or reproduction: `npm run test:safety-dance` failed `TestInitRefreshPreservesCustomPostReceiveHook`, `TestRefreshManagedPostReceiveHookPreservesCustomHook`, and `TestPostReceiveHook_FallsBackToHookLocationForGateDir`; the focused Go command failed the latter two tests
- fix direction: settle the companion-hook contract, update the implementation and tests together, use bounded polling for asynchronous notification, and require the aggregate to pass before the next review

### CR-026 Cancellation can race the final publication binding

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/push.go:120`
- failure mode: a cancellation after the initial status check and after mirror update can still record a publication and push binding for a cancelled run
- evidence or reproduction: `Publish` checks run status once at lines 87-99, performs remote and mirror writes, reloads the run at lines 120-126 without validating its status, then records publication and binding at lines 127-131; `CancelRun` can independently set the terminal cancelled status at `internal/db/runs.go:79-87`
- fix direction: guard mirror reconciliation and publication binding with a transactional compare-and-set on the expected running generation, recheck context and durable status immediately before each irreversible state write, and add a barrier test that cancels after mirror completion but before binding

## Advisories

### ADV-004 Package version parsing accepts four components

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `tools/safety-dance/scripts/package-release.sh:12`
- evidence: direct execution accepted `1.2.3.4`; the shell glob does not enforce exactly three numeric components, although the hosted workflow currently validates its tag first
- suggestion: use one exact validator shared by workflow and packager, and add rejected-version cases to `tests/safety-dance-release.test.mjs`

## Dead Code and Dependency Review

- newly orphaned code: no single task-caused orphan was isolated beyond the imported validation/provider packages that remain disconnected from the runnable pipeline described in CR-018
- dependency findings: no lockfile, license, or known-vulnerability finding was confirmed; release archives now contain `LICENSE`

## Verdict

- decision: request_changes
- overall code-health change: the fix round closes several direct bypasses and adds worktree custody, but the product remains nonfunctional at its core and still violates admission, service, rollback, configuration, terminal-interface, cancellation, and verification contracts
- rationale: one critical and eight major findings remain in the pinned scope, including three prior findings that the fix receipt itself marked blocked and a failing required aggregate

## Review Limits

- blocked or unavailable checks: no pull request exists; hosted cross-platform release execution and authorized live-provider behavior remain unavailable; the prior verification artifact predates commit `5e48861` and does not prove the current tree
- residual manual verification: real launchd, systemd-user, and Task Scheduler lifecycle; live narrow-terminal interaction; hosted release assets; credentialed provider pull-request and CI behavior
