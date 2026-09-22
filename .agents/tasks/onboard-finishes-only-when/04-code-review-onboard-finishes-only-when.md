---
type: code-review
date: 2026-09-22
branch: onboard-finishes-only-when
base_branch: epic-slack-assistant-bot-dms
base_sha: 4b632ce1d6b8b1da71a0b09067f70729a4c1e691
head_sha: cd5218617501f5f9acdd13bc085bed07a3851cfa
status: clean
summary: "Reviewed the complete owner-verification and repair diff after the prior fix round. Both major findings are fixed, the named race suite passes, and no critical or major findings remain."
---

# Code Review

## Scope

- merge base: `4b632ce1d6b8b1da71a0b09067f70729a4c1e691` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists for this branch)
- reviewed HEAD: `cd5218617501f5f9acdd13bc085bed07a3851cfa`
- commits: `6546687` feature implementation; `b6f2567` commit artifact; `4f76973` prior review artifact; `ac4859c` review fixes; `cd52186` fixes artifact
- staged and unstaged changes: none (`git status --short --branch` clean)
- task-owned untracked files: none
- excluded changes: `.agents/tasks/onboard-finishes-only-when/01-commit-onboard-finishes-only-when.md`, `02-code-review-onboard-finishes-only-when.md`, and `03-code-review-fixes-onboard-finishes-only-when.md` are task artifacts, read as evidence only

Reviewed code scope: 17 Go source and test files under `tools/slack-coordinator/`, 1,092 additions and 129 deletions against the merge base. The current code includes the prior review fixes in `internal/cli/daemon.go`, `internal/cli/service_test.go`, `internal/ipc/server.go`, and `internal/ipc/ipc_test.go`.

## Previous Round

- previous artifact: `.agents/tasks/onboard-finishes-only-when/02-code-review-onboard-finishes-only-when.md`
- CR-001 Installed-service token replacement leaves the daemon down on Linux: fixed. `restartDaemon` now uninstalls and reinstalls the owned service before waiting for health; `TestRestartDaemonReinstallsAnInstalledLinuxService` checks the Linux command sequence.
- CR-002 A pending verification outlives a disconnected onboard client: fixed. `ipc.Server.handleConn` reads in a separate goroutine and cancels the request context on EOF or scanner error; `TestHandlerContextCancelsWhenClientDisconnects` proves the blocked handler observes cancellation.

## Requirements and Standards

- task or ticket: `.agents/tasks/onboard-finishes-only-when/task.md` (issue #56), including five acceptance criteria and the required focused Go command
- implementation source: `01-commit-onboard-finishes-only-when.md` records the implementation decisions; current source and tests were reviewed against the task requirements
- repository instructions: root `AGENTS.md`; formatters, linters, and project-wide `npm test` were not run because `task.md` explicitly limits proof to the four Go packages

Acceptance criteria:

1. Met. `assistant.verify_owner` opens the owner DM, posts the fixed text, waits for a later owner DM or setup-thread reply, and returns the display name. Unit and in-process daemon tests cover the behavior.
2. Met. `routeDM` consumes a matching verification answer before request creation, reactions, or acknowledgements. `verify_test.go` asserts no request row, reaction, wake, or extra post.
3. Met. Successful onboarding prints the verified owner and app, removes `onboard.json`, prints step 8, and exits successfully. The end-to-end CLI test covers the real IPC path.
4. Met. Timeout returns the typed timeout result, preserves configuration, service, and checkpoint, and prints the required hints in order. The onboarding test covers the ordered output and retained checkpoint.
5. Met. Existing configuration routes to repair choices without `apps.manifest.create`; re-verification, service reinstall, and token replacement all end at step 7. Repair tests assert zero manifest-create calls.

## Change Profile

- intent and expected behavior: finish onboarding with a live owner DM verification, preserve ordinary DM routing around the verification, and provide repair choices for an existing setup
- change description quality: the commit receipt records the routing, timeout, repair, service, and display-name decisions; the prior review and fix receipt record the two repaired lifecycle defects
- implementation model and review model: implementation model not recorded; typed review helper was unavailable, so coverage was judged directly from the pinned diff and tests
- changed-line size and logical cohesion: one feature with assistant, IPC, CLI, onboarding, and focused tests; the service restart and IPC cancellation changes are required lifecycle fixes, so no split is required
- resulting large-file concerns: `internal/onboard/steps.go` and its tests grow, but remain one walkthrough topic; no orphaned feature path was found
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: owner DM and thread resolution; older timestamp routing; timeout and slot release; repair re-verification, service reinstall, token replacement, and invalid token preservation; in-process daemon onboarding; installed Linux restart commands; IPC cancellation on client disconnect
- missing or misleading coverage: no live Slack, launchd, or systemd process was used; the Linux supervisor behavior is checked through the injected service executor and generated command contract

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3694` in / `73` out; stderr provenance: `judge: model jev-1.13.0, tokens 3694 in / 73 out`; correctness `covered`, level 3, confidence 0.99; readability `covered`, level 3, confidence 0.84; architecture `covered`, level 3, confidence 0.97; security `covered`, level 3, confidence 0.87; performance `covered`, level 3, confidence 0.90

### Correctness

- assessment and evidence: covered. Verification state is serialized under `verifyMu`, is published only after the setup post returns, and clears on success, timeout, Slack failure, or IPC context cancellation. The prior Linux restart defect is fixed by explicit uninstall/install, and the prior disconnected-client leak is fixed by EOF-driven context cancellation. The focused tests cover the acceptance paths and both prior findings.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: covered. Verification state and routing remain in `assistant`; IPC owns request lifetime; CLI owns its 130-second call deadline; onboarding reuses one verification step for fresh and repair paths. The restart and reader changes are bounded to the owners of those lifecycles.
- helper coverage: covered, level 3, confidence 0.84

### Architecture

- assessment and evidence: covered. `assistant.Register` binds the daemon method at the assistant boundary, `routeDM` owns message consumption, `ipc.Server` owns peer cancellation, and `restartDaemon` owns supervisor relaunch. No new dependency or parallel abstraction was introduced.
- helper coverage: covered, level 3, confidence 0.97

### Security

- assessment and evidence: covered. The verification method has no caller-controlled Slack identifiers; it uses the configured owner. IPC continues to bind peer identity from the authenticated local connection, and repair token input uses the existing secret prompt, validation, and config-save path. No secret or authorization boundary was weakened.
- helper coverage: covered, level 3, confidence 0.87

### Performance

- assessment and evidence: covered. A verification blocks one IPC handler for at most 120 seconds, while each connection remains independently served. Message matching is constant-time under a mutex, and daemon health/service waits are bounded. No unbounded query or hot-path allocation was added.
- helper coverage: covered, level 3, confidence 0.90

## Verification Story

- command or inspection: `cd tools/slack-coordinator && go test -race -count=1 ./internal/assistant ./internal/onboard ./internal/cli ./internal/ipc`; `git diff --check 4b632ce1d6b8b1da71a0b09067f70729a4c1e691..HEAD`
- result: the four Go packages passed under the race detector (`88 passed in 4 packages`); diff whitespace check passed; working tree is clean
- manual, screenshot, or before-and-after evidence: no live Slack or service-manager session; the CLI test runs the daemon and IPC in-process and the focused service test checks the Linux command sequence

## Critical and Required Findings

Gate: critical- or major-severity findings only.

`None.`

## Advisories

### ADV-001 Verification treats a top-level owner verb as a command

- type: Nitpick
- severity: info
- category: Functional correctness
- location: `tools/slack-coordinator/internal/assistant/router.go:103-114`
- evidence: The `!` branch runs before `resolveVerify`, so an owner replying with `!help` is handled as a verb rather than consumed as the verification answer.
- suggestion: Keep the current order unless product behavior requires every top-level owner DM to answer verification; moving `resolveVerify` first would change the documented routing decision.

### ADV-002 WaitDaemon does not use its context

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/cli/onboard.go:185`
- evidence: The dependency accepts `context.Context` but calls the fixed five-second polling helper without passing cancellation through.
- suggestion: Thread context cancellation through the polling helper if onboarding cancellation needs to interrupt the health wait.

### ADV-003 Repair retains the prior checkpoint token until success

- type: Nitpick
- severity: trivial
- category: Security and privacy
- location: `tools/slack-coordinator/internal/onboard/steps.go:468`
- evidence: Token replacement updates the in-memory checkpoint state and config, but does not rewrite the step-6 checkpoint before verification completes. The checkpoint remains mode 0600 and repair reads the config token.
- suggestion: Remove or refresh the checkpoint token if later repair behavior needs the checkpoint to reflect the replacement immediately.

### ADV-004 Repair without a checkpoint cannot print the app name

- type: Nitpick
- severity: info
- category: Functional correctness
- location: `tools/slack-coordinator/internal/onboard/steps.go` (`verifyOwner`)
- evidence: A config-only repair has no stored app name, so its success line contains the owner but not the app name; the fresh walkthrough retains the app name in `onboard.json`.
- suggestion: Add an app-name lookup only if config-only repair is required to print the same app detail as a fresh setup.

## Dead Code and Dependency Review

- newly orphaned code: none found. The new restart wait hook is used by the restart path and its test; the IPC reader cancellation path is used by every connection.
- dependency findings: none; no dependency or lockfile changed

## Verdict

- decision: approve
- overall code-health change: the implementation satisfies the task and the prior two major lifecycle defects are repaired with focused regression tests
- rationale: The pinned scope has no critical or major finding. The required race suite passes, the five acceptance criteria are met by code and tests, and the remaining advisories are non-blocking behavior or maintenance choices.

## Review Limits

- blocked or unavailable checks: none. The typed-judgment helper returned `covered` for all five axes in one run. No project-wide `npm test`, formatter, or linter was run per `task.md`.
- residual manual verification: no live Slack workspace or real launchd/systemd service manager was exercised; service commands and daemon/IPC behavior are covered by focused tests.
