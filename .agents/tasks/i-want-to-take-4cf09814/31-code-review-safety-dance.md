---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 1ef50b7620c4258145ca7b9aded5fca5fac85bca
status: findings
summary: "The 63-commit Safety Dance diff and the latest boundary repairs were reviewed at 1ef50b7. The aggregate checks pass, but the validation pipeline still cannot run, any same-user process can mint admission tokens, the TUI is not interactive, cancellation can race publication binding, admitted updates can be lost on daemon failure, and service setup remains unsafe on Windows and during wizard rollback. The next fix round must close these critical and major findings before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` against `origin/main`
- reviewed HEAD: `1ef50b7620c4258145ca7b9aded5fca5fac85bca`
- commits: 63 commits after the merge base; the latest product change is `645df6d fix(safety-dance): close review boundary gaps`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two task-owned untracked directories; these are workflow history or evidence rather than product review subjects

## Previous Round

- previous artifact: `29-code-review-safety-dance.md`
- CR-018 The daemon has no working validation pipeline: still open
- CR-019 Admission tokens do not authorize the matching notification: fixed
- CR-020 Any local child can mint the token that supposedly protects the gate: still open
- CR-021 Service installation references files it never creates: fixed
- CR-022 Wizard compensation can eject a repaired installation: fixed
- CR-023 Repository strict parsing rejects valid fields and misses nested typos: fixed
- CR-024 The TUI never starts an interactive application: still open
- CR-025 The custom-hook repair leaves the required aggregate red: fixed
- CR-026 Cancellation can race the final publication binding: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate behavior as an independently branded, renamed tool without product references to the source repository
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; the selected plan requires a working fixed validation pipeline, authenticated receive-hook admission, durable accepted updates, guarded publication, an interactive TUI, transactional setup, and home-scoped services on macOS, Linux, and Windows
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`; code review is read-only and task artifacts are committed separately

## Change Profile

- intent and expected behavior: add the Safety Dance Go tool, local bare Git gate, durable branch runs, validation and publication pipeline, operator CLI and TUI, canonical skill distribution, identity checks, and native release packaging
- change description quality: no pull request exists. Commit subjects pass the repository check, but the latest product commit's one-line subject does not explain the unresolved pipeline, admission, TUI, cancellation, or service limits.
- implementation model and review model: implementation model was not recorded; review model is GPT-5.6 Sol with focused implementation-review workers
- changed-line size and logical cohesion: 236 files, 38,730 insertions, and 4 deletions. The change is much larger than a normal coherent review slice, and seven release-blocking behaviors remain incomplete.
- resulting large-file concerns: `internal/config/config.go` is 3,121 lines and several imported agent, database, Git, and SCM files exceed 1,000 lines. This review blocks on functional boundaries rather than file size alone.
- dependency or lockfile changes: the new Go module and `go.sum` add the tool's dependency graph. `npm test`, Go race tests, `go vet`, and the temporary binary build all pass; no dependency-specific defect was confirmed.

## Tests Reviewed First

- behavior claimed by tests: the current tests cover hook token consumption and matching notification, same-branch manager replacement, durable step rows, publication ordering, service command injection, wizard compensation callbacks, TUI text rendering, runtime installation, identity scanning, and release archive shape
- missing or misleading coverage: no test starts a successful real validation step from `executeRun`; no test proves token issuance rejects an arbitrary same-user child; no TUI test starts an event and keyboard loop; no barrier test cancels between the final status read and publication writes; no test restarts between admission and notification or retries a failed notification; Windows service tests do not prove `SD_HOME` propagation or task deletion; wizard tests do not preserve a pre-existing service definition after install failure

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5194` in / `73` out

### Correctness

- assessment and evidence: the daemon registers fail-closed step stubs at `tools/safety-dance/internal/cli/daemon.go:328-359`, and every validation step returns `implementation is not configured`, beginning at `tools/safety-dance/internal/pipeline/steps/intent.go:8-14`. Runs therefore fail at the first step. `tools/safety-dance/internal/tui/app.go:5-7` blocks on context without rendering or input, while `tools/safety-dance/internal/cli/tui.go:15-39` prints one snapshot and exits. Publication checks status at `tools/safety-dance/internal/pipeline/steps/push.go:120-132` before two unguarded writes, so `tools/safety-dance/internal/db/runs.go:79-87` can cancel between the check and binding.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: critical behavior is represented by exported step functions whose only implementation is an error, while `executeRun` presents them as the real pipeline. The service owner combines serialization, filesystem writes, platform naming, manager commands, and cleanup in `tools/safety-dance/internal/daemon/service.go:21-142`; that makes ownership and rollback state hard to reason about. No separate readability-only blocker was found beyond the functional findings.
- helper coverage: covered, level 3, confidence 0.56

### Architecture

- assessment and evidence: admission receipts live only in the `Admission` process object at `tools/safety-dance/internal/daemon/admission.go:25-33` even though the durable run begins later in the notification callback. The callback consumes the receipt before durable creation at `tools/safety-dance/internal/daemon/admission.go:100-112`, so daemon restart or callback failure crosses the durability boundary without recoverable state. Service installation also overwrites its definition before the platform manager succeeds and exposes no created-versus-repaired journal to wizard compensation.
- helper coverage: covered, level 3, confidence 0.75

### Security

- assessment and evidence: `tools/safety-dance/internal/daemon/admission.go:46-58` issues a valid gate/ref token to every same-user IPC peer with a PID. The hidden public command at `tools/safety-dance/internal/cli/daemon.go:53-65` exposes that method without the required ancestry or parent-run policy, so a nested validation child can authorize its own push. The documented ordinary push at `skills/delivery/safety-dance/references/commands.md:16-25` cannot supply the now-required token, while a bypassing child can mint one.
- helper coverage: covered, level 2, confidence 0.52

### Performance

- assessment and evidence: no material performance regression was confirmed. The branch manager joins only the replaced branch run, different branch keys can proceed independently, receive-hook processing is bounded by pushed refs, and the reviewed database queries operate on run-scoped records. The larger risk is correctness under concurrency, recorded below, rather than throughput.
- helper coverage: covered, level 3, confidence 0.63

## Verification Story

- command or inspection: `npm test`; `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git ./internal/pipeline/... ./internal/cli ./internal/config ./internal/tui ./internal/wizard`; `gofmt -d` on the seven product files changed by `645df6d`; direct tracing through the changed callers and tests
- result: `npm test` passed 136 Node tests, the complete Safety Dance race suite, `go vet`, temporary binary build, identity scan, and 2 release tests. The focused race command passed all named packages, and `gofmt -d` produced no output. These checks do not exercise the missing successful pipeline, issuance authorization, interactive TUI, final cancellation barrier, durable notification receipt, or unsafe service rollback cases.
- manual, screenshot, or before-and-after evidence: none for an interactive TUI, hosted release, Windows service lifecycle, or authorized live provider execution

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-027 The daemon still has no working validation pipeline

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:328`
- failure mode: every fresh or gate-triggered run fails at `intent`; no candidate can complete review, tests, documentation, lint, publication, pull request creation, or CI through the shipped daemon
- evidence or reproduction: `executeRun` registers `steps.Intent` first, and `tools/safety-dance/internal/pipeline/steps/intent.go:8-14` always returns `intent validation implementation is not configured`. The remaining validation step files have the same stub shape. The aggregate stays green because tests assert pipeline mechanics, not a successful configured daemon run.
- fix direction: connect each fixed step to the imported agent, configuration, Git, provider, and command implementations, pass the owned worktree and typed inputs, persist typed results, and add a built-binary test that reaches publication only after all real gates pass

### CR-028 Any same-user child can mint the gate token

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:46`
- failure mode: a validation child or any process running as the user can call the hidden token endpoint, then push with that token and bypass the parent-run fence the admission token is meant to enforce
- evidence or reproduction: the issuer checks only `ipc.PeerPID(ctx) > 0` and immediately calls `a.Issue`; `tools/safety-dance/internal/cli/daemon.go:53-65` exposes the call. No ancestry, gate-hook, or `SD_PARENT_RUN_ID` policy is evaluated. Meanwhile the documented `git push safety-dance HEAD` at `skills/delivery/safety-dance/references/commands.md:16-25` has no supported token acquisition path and is rejected by `tools/safety-dance/internal/git/hook.go:48-60`.
- fix direction: authorize issuance from a supported top-level push flow using OS process ancestry and the parent-run policy, keep issuance unavailable to validation descendants, and make the documented ordinary command execute that flow without exposing a general token mint

### CR-029 The TUI is still a one-shot text command

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/tui.go:15`
- failure mode: `safety-dance tui` prints one database snapshot and exits, so operators cannot observe live updates, navigate, respond, abort, or use the required keyboard interface
- evidence or reproduction: `renderTUI` reads active runs once and prints `tui.Plain` at lines 25-39. `tools/safety-dance/internal/tui/app.go:5-7` only waits for context cancellation, and no caller starts it. The tests cover static formatting only.
- fix direction: run the actual terminal application, subscribe to daemon events, reconcile snapshots, handle resize and keyboard input, and prove interactive status, response, and abort behavior while preserving plain non-TTY output

### CR-030 Cancellation can still race publication binding

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/push.go:120`
- failure mode: cancellation after the final status/context check can still insert a publication and update the run's push binding, recording a cancelled run as published
- evidence or reproduction: `Publish` reads status and context at lines 120-132, then calls independent unconditional writes at lines 133-137. `tools/safety-dance/internal/db/publications.go:13-21` does not guard on run state, and `tools/safety-dance/internal/db/run.go:502-509` updates the binding by ID only. `CancelRun` is a separate update at `tools/safety-dance/internal/db/runs.go:79-87`. No barrier test places cancellation in this window.
- fix direction: commit publication, push binding, and the legal run-state transition in one transaction with a running-state compare-and-set; add a deterministic race test that pauses immediately before the transaction

### CR-031 Admission receipts can disappear after Git accepts the ref

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/admission.go:25`
- failure mode: a daemon restart after pre-receive admission loses the in-memory receipt, and a notification callback error consumes the receipt before durable run creation. The accepted gate ref then has no durable run and cannot be retried with the same receipt.
- evidence or reproduction: receipts are an in-memory map initialized in `NewAdmission` at lines 25-36. `notifyPush` deletes the receipt at lines 100-105 before `a.notify` creates accepted-ref custody at lines 109-112. The post-receive hook launches notification asynchronously and only logs a failure at `tools/safety-dance/internal/git/hook.go:89-100`.
- fix direction: persist the admitted update before Git can accept it or persist a retryable receipt keyed by gate, ref, old SHA, and new SHA; consume it in the same durable transaction that creates accepted-ref custody, and recover admitted-but-unnotified updates on restart

### CR-032 Windows services ignore the selected runtime home and remain installed

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/service.go:117`
- failure mode: the Windows scheduled task starts without `SD_HOME`, so a non-default runtime home operates a different state directory. Stopping or compensating setup ends the task but does not delete its definition.
- evidence or reproduction: the default platform branch creates `/TR <binary> daemon serve` without setting `SD_HOME` at lines 117-119. `Stop` calls only `schtasks /End` at lines 140-142, while install used `/Create`. The release matrix includes Windows, and the tests execute only the host platform branch.
- fix direction: create a Windows task command or wrapper that sets the exact runtime home with safe quoting, and delete only the home-specific task during uninstall or compensation; add platform-independent golden command tests

### CR-033 Wizard rollback can remove a pre-existing service definition

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/wizard/setup.go:54`
- failure mode: if service installation fails while repairing an existing setup, rollback can stop and delete the user's pre-existing service definition even though the wizard did not create it
- evidence or reproduction: `Service.Install` overwrites the definition before invoking the manager at `tools/safety-dance/internal/daemon/service.go:100-119`. On any manager error, `Setup.Run` calls `StopService` unconditionally at `tools/safety-dance/internal/wizard/setup.go:54-60`; on macOS and Linux that removes the definition at `tools/safety-dance/internal/daemon/service.go:121-139`. The `createdGate` guard in `tools/safety-dance/internal/cli/wizard.go:38-52` protects only gate ejection.
- fix direction: journal whether the service definition and registration were created or repaired, preserve and restore prior content and manager state, and compensate only writes made by this wizard attempt

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: `tools/safety-dance/internal/tui/app.go` is not called by the CLI and does not implement a terminal loop; CR-029 treats this as part of the required missing behavior
- dependency findings: no lockfile integrity, license, or maintenance finding was confirmed. The new dependency graph builds and tests offline under the repository's aggregate command.

## Verdict

- decision: request_changes
- overall code-health change: the latest fix closes notification matching, service-file creation on macOS and Linux, repaired-gate ejection, strict YAML decoding, custom-hook test drift, and the aggregate failure, but leaves four previous blockers open and adds no durable receipt or service rollback boundary
- rationale: one critical and six major findings prevent the core gate, validation, operator, cancellation, durability, and service contracts from being safe or usable despite green checks

## Review Limits

- blocked or unavailable checks: no pull request exists, so no PR title or hosted CI was inspected. Hosted `safety-dance-v*` release behavior, Windows Task Scheduler execution, and authorized live-provider behavior remain untested.
- residual manual verification: after fixes, exercise a real successful validation run, ordinary tokenized gate push, daemon restart between admission and notification, cancellation at the final binding barrier, interactive TUI session, and repair failure with a pre-existing service on macOS, Linux, and Windows
