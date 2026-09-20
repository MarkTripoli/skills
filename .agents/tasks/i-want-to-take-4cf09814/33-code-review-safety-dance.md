---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 6ece31b0a75cb5fc51ec051d23b1ceaccd8464fe
status: findings
summary: "Review of the 39,138-line Safety Dance change found that the shipped validation stages still publish after only an empty worktree whitespace check, while the managed hook cannot obtain a token from a normally started daemon. Cancellation, receipt delivery, service ownership, operator controls, nested-run isolation, runtime permissions, configuration parsing, and hook rollback also retain critical or major failures. The next fix round must restore the gate's ordinary push path and close every trust-boundary finding before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `6ece31b0a75cb5fc51ec051d23b1ceaccd8464fe`
- commits: 66 commits on `safety-dance` after `origin/main`; no pull request exists for the branch.
- staged and unstaged changes: none.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: task artifacts and the two untracked task evidence directories were excluded as review subjects.

## Previous Round

- previous artifact: `31-code-review-safety-dance.md`
- CR-027 The daemon still has no working validation pipeline: still open as CR-034
- CR-028 Any same-user child can mint the gate token: still open as CR-035
- CR-029 The TUI is still a one-shot text command: still open as CR-040
- CR-030 Cancellation can still race publication binding: fixed; CR-036 covers the remaining pre-push race
- CR-031 Admission receipts can disappear after Git accepts the ref: still open as CR-037
- CR-032 Windows services ignore the selected runtime home and remain installed: fixed
- CR-033 Wizard rollback can remove a pre-existing service definition: still open as CR-039

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced local Git gate under the independent Safety Dance identity without source-product references outside the required license.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; the latest verification artifact passed revision `49c6c2d`, before the three review-fix rounds now in scope.
- repository instructions: root and worktree `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md` contracts apply.

## Change Profile

- intent and expected behavior: add an authenticated local bare Git gate, durable branch-scoped runs, fixed validation and guarded publication, operator interfaces, skill distribution, identity enforcement, and native releases.
- change description quality: commit subjects pass the repository check, but no pull request title or body exists. The latest code commit has no body explaining the remaining validation and ancestry limits.
- implementation model and review model: implementation receipts do not record one model consistently; review used GPT-5.6 Sol plus four read-only GPT-5.6 Sol codebase-analysis passes.
- changed-line size and logical cohesion: 239 files, 39,138 insertions, and 4 deletions; excluding task history, 206 files and 35,217 insertions. The feature is one product import, but its gate, runtime, provider, CLI, release, and repository-integration boundaries require separate fixes and proof.
- resulting large-file concerns: `internal/config/config.go` is 3,121 lines, `internal/scm/github/github.go` is 1,487 lines, `internal/agent/agent.go` is 1,353 lines, and `internal/db/run.go` is 1,108 lines. Their imported behavior is mostly disconnected from the shipped daemon pipeline.
- dependency or lockfile changes: a new Go 1.25 module and `go.sum` add Cobra, Charmbracelet terminal packages, YAML, and modernc SQLite plus transitive modules. No root npm dependency changed; no dependency security scan was available.

## Tests Reviewed First

- behavior claimed by tests: package and race suites cover gate setup, direct token admission, branch replacement, worktree custody, push leases and binding, static TUI rendering, installer distribution, identity scanning, and release archive shape.
- missing or misleading coverage: executable hook tests mint a token directly and always pass it as a push option; pipeline and e2e tests inject successful closures instead of driving the shipped validation implementations; TUI tests render a static model; service tests do not exercise installed-service stop or definition rollback.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5485` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 5485 in / 73 out`

### Correctness

- assessment and evidence: a built-HEAD ordinary push fails before ref mutation because token issuance reads the daemon environment, and the validation pipeline substitutes `git diff --check` for every named gate. Publication cancellation, receipt recovery, service lifecycle, and operator controls retain the failures recorded below.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: the fixed pipeline names nine distinct stages, but eight wrappers collapse to the same generic check, hiding missing behavior behind successful durable step rows. `internal/tui/app.go` is the only Go file reported by `gofmt -l`.
- helper coverage: covered, level 3, confidence 0.54

### Architecture

- assessment and evidence: imported agent, configuration, provider, findings, and approval owners exist, but `cli.executeRun` bypasses them. Daemon lifecycle is split between PID-based CLI ownership and service-manager ownership, and receipt state is split between a gate-side text file and daemon JSON without one retry owner.
- helper coverage: covered, level 3, confidence 0.91

### Security

- assessment and evidence: token authorization trusts daemon-global environment instead of authenticated peer ancestry, nested validation children can stop the daemon, and runtime state containing findings and configuration snapshots is created world-readable on Unix.
- helper coverage: covered, level 3, confidence 0.93

### Performance

- assessment and evidence: no critical or major hot-path performance defect was found. SQLite is limited to one connection and receipt operations are bounded, but the TUI redraws an unbounded full frame every 250 milliseconds; this is secondary to its missing semantics.
- helper coverage: covered, level 3, confidence 0.52

## Verification Story

- command or inspection: `npm test`; focused `go test ./internal/daemon ./internal/pipeline/... ./internal/tui ./internal/cli`; `gofmt -l`; built-binary temporary repository with `init`, `daemon start`, and ordinary `git push safety-dance HEAD:refs/heads/main`.
- result: both test commands passed, including 136 Node tests and the Go race/vet/build aggregate. `gofmt -l` reported `internal/tui/app.go`. The built-binary push failed with `push-token issuance is restricted to the managed git hook` and `pre-receive hook declined`.
- manual, screenshot, or before-and-after evidence: terminal process evidence proved the ordinary push regression; no screenshot or hosted release/provider evidence exists.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-034 Validation stages approve candidates without performing their named checks

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:21`
- failure mode: a candidate with failing tests, lint errors, documentation omissions, review findings, no pull request, or failed provider checks reaches publication and completion.
- evidence or reproduction: intent, rebase, review, test, document, lint, PR, and CI all call `Validate`, which runs only `git -C <owned-worktree> diff --check`. The owned detached worktree is normally clean, so the command examines no committed candidate diff. `tools/safety-dance/internal/cli/daemon.go:328-361` never loads repository configuration, invokes the imported agent package, runs configured commands, creates a provider PR, or polls CI. Existing pipeline and e2e tests replace the shipped steps with closures.
- fix direction: resolve trusted global and repository configuration once per run, connect each stage to its real agent, command, documentation, and provider owner, and prove a configured failing gate cannot reach `Publish` while a successful configured run can.

### CR-035 Token authorization checks the daemon process instead of the hook caller

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:84`
- failure mode: normally started daemons reject every ordinary gate push. If the daemon itself inherits `SD_HOOK_HELPER=1`, any authenticated same-user IPC client can mint a token, so CR-028's ancestry boundary also remains open.
- evidence or reproduction: `hook.go:58` sets `SD_HOOK_HELPER=1` only on the short-lived CLI client, while the daemon handler reads `os.Getenv` in the long-lived server. A built-HEAD `init`, `daemon start`, and ordinary push reproduced the rejection. `hook_e2e_test.go:93-113` bypasses the path by calling `Admission.Issue` and supplying the token explicitly.
- fix direction: authorize issuance from the OS-authenticated peer PID and verified managed-hook ancestry, reject validation descendants, and add separate-process tests for an ordinary tokenless push and an unauthorized same-user child.

### CR-036 Cancellation can reactivate push ownership and publish a cancelled run

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/push.go:87`
- failure mode: cancellation between the status read and push-active write is overwritten, so Git can update the upstream after durable cancellation. The final binding transaction then rejects the cancelled run, leaving an unrecorded external publication.
- evidence or reproduction: `Publish` reads status, then calls `SetRunPushActive`; `internal/db/run.go:559-560` updates by run ID without a status predicate. `CancelRun` separately writes `cancelled,push_active=0`. The transactional guard at `internal/db/publications.go:49` runs only after the remote push and mirror update.
- fix direction: acquire push ownership with one compare-and-set that requires a pending/running status and checks the affected row before any remote operation. Add a barrier test that cancels immediately before ownership acquisition.

### CR-037 Admission receipt delivery is neither retryable nor single-consumer

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/admission.go:126`
- failure mode: a transient notification failure after Git accepts a ref can leave no durable run, while two concurrent notifications for one receipt can both create runs and supersede each other.
- evidence or reproduction: the post-receive hook deletes its gate-side token before notification and only logs failure (`internal/git/hook.go:98-104`). Startup loads receipts but never retries them, and discards JSON/read errors (`admission.go:67-71`). `notifyPush` unlocks after reading the receipt, invokes the side-effecting callback, and deletes afterward, so concurrent callers can both consume it.
- fix direction: persist a receipt state machine with atomic claim, idempotent run creation, retryable failure, and completed state. Reconcile accepted gate refs on startup, retain the hook-side receipt until acknowledgement, and fail daemon readiness on an unreadable receipt store.

### CR-038 CLI daemon stop does not own service-started daemons

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:124`
- failure mode: `daemon stop` reports success while a wizard-installed service daemon remains running, and a service manager may restart a directly signalled process.
- evidence or reproduction: service definitions invoke hidden `daemon serve` directly, but only `daemon start` writes `daemon.pid`. `stopDaemon` treats a missing PID file as a successful stop and never calls launchd, systemd, or Task Scheduler.
- fix direction: give stop and restart one lifecycle owner. Detect and stop the home-scoped installed service through its manager, or make `serve` maintain verified process identity and disable service restart before termination.

### CR-039 Wizard service repair overwrites pre-existing definitions without rollback

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/service.go:111`
- failure mode: if service activation fails during repair, the pre-existing definition remains overwritten. A new definition can also remain when service-manager cleanup fails.
- evidence or reproduction: `Install` replaces the definition before calling the manager. The wizard records only whether the path existed, then deliberately skips `StopService` for an existing definition. No code snapshots or restores the prior bytes and registration state.
- fix direction: journal prior definition content and service registration before mutation, restore both on failure, and remove newly owned files even when manager cleanup also fails while returning both errors.

### CR-040 The operator interface cannot show or answer durable prompts

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/tui.go:46`
- failure mode: typing `r` in the interactive TUI does nothing, and operators cannot discover the step/action needed by `respond` from TUI, status, or the documented run-specific logs command.
- evidence or reproduction: `tui.App` calls `Respond` only when non-nil, but the CLI supplies no callback. Refresh fills only run ID, branch, status, and error despite model fields for step, findings, and prompt. `logs` accepts and ignores `<run-id>` and reads only `daemon.log`; `status` lists active runs without prompts or actions. Tests cover static rendering only.
- fix direction: load the active step, findings, and prompt from durable state, bind response to the selected run and step, implement run-specific inspection, and add interactive refresh/respond/abort/quit tests.

### CR-041 Nested validation children can stop or restart the parent daemon

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/daemon.go:30`
- failure mode: a child running with `SD_PARENT_RUN_ID` can stop the daemon that owns its parent run, bypassing the hard nested-run fence.
- evidence or reproduction: `init`, `run`, `respond`, and `abort` call `nestedMutation`, but daemon `start`, `stop`, and `restart` do not. `stopDaemon` signals the recorded PID and removes its file without checking the fence.
- fix direction: apply the nested mutation guard to every daemon lifecycle mutation and test each command under `SD_PARENT_RUN_ID`; keep health/status read-only.

### CR-042 Runtime state is world-readable on Unix

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/paths/paths.go:135`
- failure mode: other local users can read repository paths, findings, configuration snapshots, responses, and logs from the runtime home on multi-user systems.
- evidence or reproduction: `EnsureDirs` creates the root and every sensitive subdirectory with `0755`; SQLite is opened without a restrictive creation mode and was observed as `0644`. The database schema stores findings, errors, global/repository configuration snapshots, and user responses. Tool documentation says `SD_HOME` must remain private.
- fix direction: create and repair private runtime directories as `0700` and state, WAL, config, receipt, PID, and log files as `0600`; add mode tests on Unix.

### CR-043 Multi-document YAML bypasses strict configuration validation

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/config/config.go:2074`
- failure mode: unknown or safety-sensitive settings after `---` are silently ignored instead of rejected, so a repository can appear validated while part of its supplied configuration never reaches policy checks.
- evidence or reproduction: global and repository parsers decode only the first YAML document and never require the next decode to return `io.EOF`. Existing tests cover unknown fields only in the first document.
- fix direction: reject every second non-empty YAML document and add global and repository multi-document regression tests.

### CR-044 Post-receive hook repair can disable a preserved user hook

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/git/hook.go:207`
- failure mode: a write failure after renaming a custom post-receive hook leaves no active post-receive hook on an existing gate.
- evidence or reproduction: `RefreshManagedPostReceiveHook` renames the user hook to its companion, then returns directly if writing the managed wrapper fails. The pre-receive equivalent restores its companion on the same failure path.
- fix direction: atomically restore the companion to `post-receive` when managed-wrapper installation fails and add a forced-write-failure regression test.

## Advisories

### ADV-001 Format the interactive TUI source

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `tools/safety-dance/internal/tui/app.go:1`
- evidence: `gofmt -l` reports this file; the rest of the Go tree is formatted.
- suggestion: run `gofmt` on the file with the TUI behavior fix.

## Dead Code and Dependency Review

- newly orphaned code: imported agent, provider, configuration, findings, and approval implementations compile into the module but do not participate in the shipped daemon pipeline; CR-034 requires connecting the intended owners rather than deleting behavior the plan requires.
- dependency findings: `go.mod` and `go.sum` are internally consistent and the full race/vet/build aggregate passes. No vulnerability or license scan was available, so transitive dependency security remains unverified.

## Verdict

- decision: request_changes
- overall code-health change: the review-fix rounds improved publication binding, receipt persistence, Windows task scoping, and polling, but the product still fails its ordinary gate path and can publish without its named validations.
- rationale: three critical and eight major findings contradict the gate, validation, cancellation, durability, operator, and security requirements. Green package tests do not execute the failing ordinary-token path or the real configured pipeline.

## Review Limits

- blocked or unavailable checks: no hosted `safety-dance-v*` release, Windows service-manager execution, authorized live-provider run, dependency vulnerability scan, or pull request title/body has been observed.
- residual manual verification: after fixes, repeat a built-binary tokenless push, configured failing and successful validation runs, cancellation barriers, receipt restart/retry/concurrency cases, service rollback/stop on supported operating systems, and interactive prompt response.
