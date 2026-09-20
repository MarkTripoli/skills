---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 61e2afbf6253d152674e131b6de53ec223aa8d7a
status: findings
summary: "The complete 116-commit Safety Dance change was reviewed through 61e2afb against origin/main. Publication and admission receipts still cross terminal-state boundaries unsafely, and major validation, provider, CLI, service, cleanup, wizard, logging, TUI, and regression-contract defects remain. The next fix round must close CR-203 through CR-216 and add production-path regressions before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `61e2afbf6253d152674e131b6de53ec223aa8d7a`
- commits: 116 commits on `safety-dance` after the merge base
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: all `.agents/tasks/` artifacts and the two untracked task-evidence directories; no pull request exists

## Previous Round

- previous artifact: `63-code-review-safety-dance.md`
- CR-189 Cancellation can still strand a successful remote push without a binding: still open
- CR-190 Non-GitHub providers remain advertised but cannot execute: still open
- CR-191 Typed validation still drops durable findings and evidence: still open
- CR-192 Public commands still do not expose the required usage exit class: still open
- CR-193 Setup and TUI fields exist but production does not use them: fixed
- CR-194 A rejected receive can be replayed later as an accepted push: still open
- CR-195 Accepted-head custody reads from the mutable working checkout: fixed
- CR-196 Branch deletion is admitted but cannot become a durable run: fixed
- CR-197 Concurrent same-branch replacements can let the older request win: fixed
- CR-198 Abort requests are rejected once publication ownership is active: fixed
- CR-199 The logs command reads files no production path writes: still open
- CR-200 Wizard compensation does not restore a repaired existing gate: still open
- CR-201 Redirected TUI output can enter the interactive polling loop: fixed
- CR-202 Phase 6 regression and documentation contracts remain incomplete: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; autonomously fold the referenced local Git gate into this repository with independent Safety Dance identity
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, commit checks, and changed-file tests

## Change Profile

- intent and expected behavior: add the branded Go gate, durable branch runs, fixed validation and guarded publication pipeline, CLI/TUI/service surfaces, canonical skill distribution, identity checks, and native releases
- change description quality: task artifacts record decisions and checks; no pull request title or body exists to review
- implementation model and review model: implementation model not recorded; review model `GPT-5.6 Sol`
- changed-line size and logical cohesion: 47,430 changed lines across 292 files, including 37,995 non-task-artifact lines; the product slices are related but exceed the plan's review-splitting signal
- resulting large-file concerns: `internal/config/config.go` is 3,140 lines and several imported agent, database, Git, gate, and SCM files exceed 1,000 lines; this review records only concrete failures
- dependency or lockfile changes: new Go module and `go.sum`; aggregate verification and `go mod verify` pass, but the committed third-party notice does not match the locked graph

## Tests Reviewed First

- behavior claimed by tests: gate and hook admission, durable manager recovery, fixed pipeline order, guarded push, installer/runtime distribution, identity scanning, release packaging, CLI/TUI rendering, worktree ownership, and local end-to-end publication
- missing or misleading coverage: no regression covers cancellation after the remote write, preserved-hook rejection followed by reconciliation, typed-result persistence, the hardcoded PR title, shorthand usage exits, repaired-gate wizard rollback, gate-owned terminal cleanup, crash-before-cleanup journaling, systemd enablement, Windows task ownership, daemon-log production, unchanged interactive TUI refreshes, each required identity class, or Windows archive members

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5867` in / `73` out

### Correctness

- assessment and evidence: the aggregate is green, but remote publication can remain unbound after cancellation (`internal/pipeline/steps/push.go:159-177`, `internal/db/publications.go:49-56`), rejected receive receipts can later reconcile (`internal/git/hook.go:62-73`, `internal/daemon/admission.go:86-107`), typed evidence is malformed or lost, PR creation self-fails repository CI, and gate-created worktrees cannot be removed through the working checkout
- helper coverage: covered, level 3, confidence 0.97

### Readability and Simplicity

- assessment and evidence: the trust-boundary flow is split across shell receipts, daemon receipts, run state, worktree journals, and publication bindings; several fixes update one representation without updating its paired owner, which produces CR-203, CR-205, CR-207, CR-208, and CR-214
- helper coverage: covered, level 2, confidence 0.81

### Architecture

- assessment and evidence: non-GitHub provider types have no production hosts, gate repair exposes no compensation handle, daemon logs have no producer, and terminal cleanup uses the wrong repository owner; these are ownership gaps rather than formatting concerns
- helper coverage: covered, level 2, confidence 0.61

### Security

- assessment and evidence: IPC peer and nested-run checks exist, but a receive rejected by the preserved pre-receive hook leaves its durable daemon admission receipt active, allowing later ref equality to authorize a run that did not come from the successful receive
- helper coverage: covered, level 2, confidence 0.85

### Performance

- assessment and evidence: no unbounded database or network hot path was found, but the interactive TUI writes a full unchanged view every 250 ms, causing continuous terminal output and assistive-technology repetition
- helper coverage: covered, level 2, confidence 0.72

## Verification Story

- command or inspection: `npm test`; `git diff --check 4458fbf...HEAD -- ':!.agents/tasks/**'`; built CLI with `-z`; repository commit-title checker with `Safety Dance validation`; temporary bare-gate worktree removed through an unrelated working checkout
- result: `npm test` passed 136 Node tests, the full Go race suite, vet, temporary build, identity scan, and two release tests; product diff check passed; `safety-dance -z` returned 5 instead of usage class 2; the generated PR title failed the repository checker; unrelated-checkout removal returned Git exit 128
- manual, screenshot, or before-and-after evidence: source inspection confirmed the publication/status transaction conflict, stale daemon receipts, malformed typed findings payload, absent service/logging contracts, and missing regression cases; hosted Windows service, live provider, and hosted release execution remain unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-203 Cancellation still strands a confirmed remote publication

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/db/publications.go:49`
- failure mode: cancellation after Git verifies the remote candidate changes the run to `cancelled`; mirror reconciliation continues, but the binding transaction rejects the terminal status, leaving the remote and possibly the gate mirror advanced without a durable publication receipt
- evidence or reproduction: `Publish` deliberately continues after remote success at `internal/pipeline/steps/push.go:159-177`, while `CancelRun` can mark a `push_active` run cancelled and `RecordPublicationAndBinding` accepts only pending/running rows; restart then rejects the cancelled run at `push.go:90-95`
- fix direction: serialize cancellation with publication ownership or atomically persist a verified publication for a cancellation-requested run while preserving its cancelled terminal outcome; add a cancellation-after-remote-write regression

### CR-204 Advertised non-GitHub providers still cannot execute

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:500`
- failure mode: GitLab, Bitbucket, Azure DevOps, Forgejo, and Gitea remotes are detected and have configuration/public types, but every production run fails before the pipeline because only GitHub constructs an SCM host
- evidence or reproduction: `internal/scm/scm.go:25-30` identifies six providers and `internal/config/config.go:710-777` exposes several provider settings; `newSCMHost` rejects every provider except GitHub
- fix direction: implement and test the advertised provider hosts, or remove unsupported detection and configuration from the shipped contract

### CR-205 Typed validation findings and evidence are still not durable

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:164`
- failure mode: failed or blocked typed verdicts return before filling the evidence sink; passing verdicts store a top-level findings array that the canonical `types.Findings` reader cannot decode, and evidence written to `last_activity` is immediately replaced by step completion
- evidence or reproduction: `validation.go:164-173` fills the sink only after a pass; `runner.go:184-197` persists it only on success; `db/step.go:362-370` overwrites `last_activity`; `types/findings.go:275-348` expects an object with a `findings` member
- fix direction: validate and serialize canonical `types.Findings`, then persist findings and evidence in durable fields before both success and failure transitions; add pass, fail, blocked, restart, and reader regressions

### CR-206 Shorthand flag errors still return the internal-failure exit class

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/root.go:37`
- failure mode: Cobra reports an unknown shorthand as `unknown shorthand flag`, which matches none of the string cases and returns exit 5 instead of the planned usage exit 2
- evidence or reproduction: a freshly built binary run as `safety-dance -z` printed `unknown shorthand flag: 'z' in -z` and returned 5
- fix direction: classify typed Cobra parse/argument errors rather than matching message fragments, add `cobra.NoArgs` where commands accept none, and test short flags, long flags, missing args, extra args, and invalid values

### CR-207 Rejected receives retain replayable daemon receipts

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/git/hook.go:62`
- failure mode: when the preserved user pre-receive hook rejects an update, shell cleanup removes only the gate-local lookup entry; the durable daemon receipt remains and later starts a run when the ref happens to equal the rejected receipt's new SHA
- evidence or reproduction: hook cleanup at lines 70-73 never revokes daemon state; `internal/daemon/admission.go:86-107` reconciles any retained receipt solely from ref equality, and each old token is a distinct launch nonce
- fix direction: give the complete receive transaction daemon-side commit/revoke semantics and revoke every admitted ref when any managed or preserved hook rejects; add rejected-receive then identical-success coverage

### CR-208 Terminal cleanup uses the wrong repository

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:213`
- failure mode: runs create and recover worktrees from the bare gate, but terminal cleanup invokes `git worktree remove` through the unrelated working checkout, so every normal cleanup can fail and leak owned worktrees
- evidence or reproduction: creation/recovery use the gate at `daemon.go:468-470,535-536`; cleanup uses `repo.WorkingPath`; a temporary reproduction returned `fatal: '<run>' is not a working tree` with exit 128
- fix direction: remove through `p.RepoDir(run.RepoID)` and add completed, failed, cancelled, and restarted production-path cleanup tests

### CR-209 Repaired existing gates still cannot be rolled back by the wizard

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/wizard.go:111`
- failure mode: gate initialization can repair hooks and bare configuration, but later service-install failure compensates only newly created gates, leaving an existing installation partially changed
- evidence or reproduction: `gate.Init` returns only `created`; compensation calls `gate.Eject` only when that flag is true, although `internal/gate/gate.go:209-235` already owns a private pre-repair snapshot during initialization
- fix direction: return a bounded repair rollback handle from gate initialization and invoke it when a later wizard action fails; test exact restoration of hooks, modes, config, stamp, and remotes

### CR-210 New pull requests always fail this repository's title check

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/pr.go:49`
- failure mode: the PR step creates every new pull request with `Safety Dance validation`, then the fixed CI step observes the repository's Conventional Commits job fail
- evidence or reproduction: `.github/workflows/commits.yml:20-27` validates every PR title; `node scripts/check-commits.mjs origin/main..HEAD --title 'Safety Dance validation'` returned 1
- fix direction: derive and validate a conventional title from durable intent evidence, persist it for replay, and add a new-PR-through-CI regression

### CR-211 Linux service installation generates a unit that cannot be enabled

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/service.go:69`
- failure mode: the generated systemd user unit has no `[Install]` target, but installation calls `systemctl --user enable --now`, so normal wizard service setup cannot enable it
- evidence or reproduction: the unit contains only `[Unit]` and `[Service]`; `service.go:211-219` always uses `enable --now`; current tests check strings and executor calls, not enablement
- fix direction: add `[Install]` with `WantedBy=default.target` and validate the generated unit plus enable lifecycle in a fixture

### CR-212 Windows cannot recognize or remove its own scheduled task

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/service.go:156`
- failure mode: ownership checks query non-verbose `schtasks /FO LIST` output for the managed marker and runtime home even though that output does not expose the task action; repair treats the owned task as foreign and stop refuses deletion
- evidence or reproduction: the marker and `SD_HOME` exist only in the `/TR` action at lines 217-218; both installation collision checks and stop depend on `taskOwned`
- fix direction: query XML or verbose action data, validate marker/home/binary there, and add Windows install, repair, collision, and stop executor fixtures

### CR-213 The default logs command has no daemon log producer

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/logs.go:17`
- failure mode: `safety-dance logs` reads `$SD_HOME/logs/daemon.log`, but daemon startup inherits stdout/stderr and all service definitions omit output routing, so the advertised default log remains empty under normal operation
- evidence or reproduction: `internal/cli/daemon.go:94-101` starts without log files; `internal/daemon/service.go:63-72` defines no platform output targets; only per-run start/finish files are written
- fix direction: route daemon lifecycle and errors to `DaemonLog` and service/bootstrap output to `DaemonBootstrapLog`; test direct and service-started log flows

### CR-214 Interactive TUI emits an unchanged full view four times per second

- type: Potential issue
- severity: major
- category: Performance and scalability
- location: `tools/safety-dance/internal/tui/app.go:68`
- failure mode: a stationary run continuously appends duplicate full status blocks, rapidly scrolling terminals and repeatedly announcing content to screen readers
- evidence or reproduction: the 250 ms ticker calls `render` unconditionally at lines 119-122, and `render` always uses `Fprintln`; current tests never exercise periodic refresh output
- fix direction: render only when the semantic model changes or after an operator action, and test that unchanged state is emitted once

### CR-215 A crash after terminal status permanently abandons the worktree

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:193`
- failure mode: terminal status is persisted before worktree removal creates its cleanup journal; a crash in that gap leaves a terminal worktree with no journal, and startup protects active paths while recovering only journaled operations
- evidence or reproduction: completion sets failed/cancelled/completed at lines 193-205 before `RemoveDetached`; `internal/worktrees/ownership.go:65-76` journals only when removal begins; startup recovery does not scan terminal run paths
- fix direction: persist cleanup intent before the terminal transition or reconcile all recorded terminal worktrees during startup; add a crash-at-boundary recovery test

### CR-216 Phase 6 regression contracts are still incomplete

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `tests/safety-dance-identity.test.mjs:24`
- failure mode: required identity classes and Windows archive contents can regress while `npm test` stays green
- evidence or reproduction: the identity suite tests one generic retired spelling rather than command, module, environment, path, service, and release variants; the release suite matches Windows workflow text but executes only Linux packaging and never inspects archive members
- fix direction: add one negative fixture per required identity class and run Windows packaging against a fake `.exe`, then inspect the ZIP for `safety-dance.exe`, license, and generated notices

## Advisories

### ADV-001 Regenerate the committed dependency notice

- type: Potential issue
- severity: minor
- category: Data integrity and integration
- location: `tools/safety-dance/THIRD_PARTY_NOTICES.md:3`
- evidence: the committed file says it lists every compiled dependency and is included in every archive, but it omits direct and transitive modules from `go.mod`; release archives instead generate a different complete notice at packaging time
- suggestion: generate the committed notice from the locked module graph and add a byte-for-byte regeneration check, or remove the stale committed manifest if only generated release notices are authoritative

## Dead Code and Dependency Review

- newly orphaned code: none proven; `internal/custody` remains used by `daemon.Manager`
- dependency findings: `go.sum` verifies and release packaging generates dependency texts, but the committed `THIRD_PARTY_NOTICES.md` is stale as recorded in ADV-001

## Verdict

- decision: request_changes
- overall code-health change: the branch adds the intended product surface and a broad green suite, but trust-boundary, durability, provider, platform, and operator contracts remain unsafe or nonfunctional
- rationale: two critical and twelve major findings remain in the pinned scope; green aggregate checks do not exercise their failure windows

## Review Limits

- blocked or unavailable checks: no pull request or PR description; no hosted Windows service execution, live provider operation, or hosted `safety-dance-v*` release
- residual manual verification: service-manager behavior should be exercised on Linux and Windows after the local contract defects are repaired
