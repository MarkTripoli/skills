---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 5297c50b217f9346c698ba2f715964f56e895cfa
status: findings
summary: "The complete 40,036-line Safety Dance product diff was reviewed at 5297c50 against origin/main, including the 6a5e24d repair. Deferred notification metadata is now preserved, but five major findings remain: the required built-binary push-to-publication regression is still absent, its cleanup can target the user's default daemon, accepted pushes can be lost before notification persistence, replacement validation can go stale while an older publication rewinds the gate, and receipt acknowledgements are not crash-durable. The next fix round must close these lifecycle and durability gaps before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `5297c50b217f9346c698ba2f715964f56e895cfa`; latest product commit `6a5e24d3b2cfc9d86c80ea5f361776690d1db75b`
- commits: 171 commits after the merge base; 232 product files changed with 40,036 insertions and 4 deletions
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked task-evidence trees

## Previous Round

- previous artifact: `95-code-review-safety-dance.md`
- CR-336 Deferred reconciliation drops accepted push metadata: fixed
- CR-337 The shipped workflow still has no binary end-to-end regression: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced local Git gate as the independently branded Safety Dance system
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; latest receipt `.agents/tasks/i-want-to-take-4cf09814/26-implementation-safety-dance.md`; verification `.agents/tasks/i-want-to-take-4cf09814/16-verification-safety-dance.md`; latest fixes `.agents/tasks/i-want-to-take-4cf09814/96-code-review-fixes-safety-dance.md`
- repository instructions: root and worktree `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and the review-code skill

## Change Profile

- intent and expected behavior: add an authenticated local Git gate, durable branch-scoped daemon runs, fixed validation and guarded publication, operator CLI/TUI/service flows, canonical skill distribution, identity enforcement, and checksummed native releases under the Safety Dance identity
- change description quality: task artifacts describe the behavior and repair history; no pull request exists, and the latest product commit has a compliant standalone subject but no explanatory body
- implementation model and review model: implementation model unrecorded; review model GPT-5.6 Sol with three GPT-5.6 Sol specialist passes
- changed-line size and logical cohesion: 40,036 product insertions across 232 files form one product import but exceed the normal review-size split signal; prior review/fix checkpoints supplied narrower repair scopes
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/db/run.go`, and `internal/cli/daemon.go` remain over 1,000 lines; the findings below arise from boundary behavior rather than file size alone
- dependency or lockfile changes: the new Go module and `go.sum` add pinned runtime dependencies; no dependency changed in the latest repair

## Tests Reviewed First

- behavior claimed by tests: the latest admission regression proves accepted push options and validation generation reach the reconciliation callback; the expanded binary test proves init, daemon start/restart/stop, empty status, and generated hook installation
- missing or misleading coverage: the binary test never pushes through the generated remote, observes a durable run, responds, or verifies upstream publication; its comment claims durable post-receive reconciliation despite checking only hook text, and no test covers notification interruption, replacement during publication, or crash-durable receipt writes

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4610` in / `73` out; performance judgment unavailable after an `unclear` result

### Correctness

- assessment and evidence: CR-336 is fixed because `notifyPush` persists both metadata fields before deferred acknowledgement and `ReconcileOnce` replays them at `internal/daemon/admission.go:426-444,131`. CR-338 remains because `internal/e2e/public_binary_test.go:49-69` stops without a gate push or publication. CR-340 through CR-342 identify accepted-update loss, stale replacement validation, and non-durable acknowledgements in the gate, admission, manager, and publication paths.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: the metadata contract now has one direct route from `NotifyPushParams` through the persisted receipt to `PushNotification`. The binary test's comment at `internal/e2e/public_binary_test.go:12-14` overstates behavior, and the separate daemon and gate receipt journals do not expose one recovery owner for the interval between ref mutation and accepted-notification persistence.
- helper coverage: covered, level 2, confidence 0.79

### Architecture

- assessment and evidence: admission owns authenticated tokens, the manager owns branch replacement, and publication owns remote, mirror, then binding order. CR-340 shows that no owner reconciles gate-local receipts after daemon restart; CR-341 shows the manager validates before a blocking prior-run join even though publication may still mutate the same gate afterward.
- helper coverage: covered, level 3, confidence 0.70

### Security

- assessment and evidence: the latest receipt fields do not weaken admission binding or expose secrets. CR-339 is a test-safety boundary failure: the cleanup process omits `SD_HOME`, resolves the real default runtime root, and can stop a user's daemon or installed service.
- helper coverage: covered, level 2, confidence 0.82

### Performance

- assessment and evidence: the latest changes copy bounded push-option slices and add no new unbounded hot-path work. Deferred reconciliation still processes a fixed receipt snapshot once per tick; no critical or major performance regression was found.
- helper coverage: unavailable

## Verification Story

- command or inspection: read the verification item table; inspected commit `6a5e24d`; ran `git diff --check` on product paths, `npm run check-commits -- origin/main..HEAD`, `go test -race ./internal/daemon ./internal/ipc -run 'ReconcileOncePreservesAcceptedNotificationMetadata|Admission|IPC'`, and a built-binary `TestPublicBinarySmoke` with `HOME` isolated from the user's default runtime
- result: product diff check emitted no diagnostics; 171 commit subjects passed; focused daemon and IPC race tests passed; the safely isolated built-binary smoke passed but executed no push or publication
- manual, screenshot, or before-and-after evidence: source tracing confirms the smoke cleanup omits `SD_HOME`; hosted release, live provider, Windows service, and induced power-loss evidence remain unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-338 The shipped workflow still lacks a binary push-to-publication regression

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/e2e/public_binary_test.go:49`
- failure mode: `make e2e` can pass while generated-hook authentication, post-receive reconciliation, durable run construction, response handling, or publication wiring is broken because the only built-binary test stops after lifecycle and hook-text checks.
- evidence or reproduction: the test pushes its seed commit directly to `origin` before initialization at lines 27-37, then runs only `init`, daemon lifecycle, empty `status`, and hook substring assertions at lines 49-69. It never pushes to `safety-dance`, observes an accepted ref or run, responds, or verifies the upstream and gate refs. The safely isolated focused test passed while exercising only that scope; Phase 4 requires the built binary to complete the gate journey in `05-plan-safety-dance.md:484-492`.
- fix direction: drive the built binary through init, daemon start, a generated-remote authenticated push, durable run and required response, verified upstream publication, restart/recovery, and daemon stop against temporary repositories and `SD_HOME`; make the aggregate execute this regression rather than skip it when `SD_E2E_BINARY` is absent.

### CR-339 Binary-test cleanup can stop the user's default daemon

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/e2e/public_binary_test.go:51`
- failure mode: every successful smoke test runs its cleanup after the explicit isolated stop, but cleanup launches `safety-dance daemon stop` without the temporary `SD_HOME`. The child binary therefore resolves `~/.safety-dance` and may stop the developer's real daemon or installed service; an earlier test failure also leaves the temporary daemon running while targeting the wrong runtime.
- evidence or reproduction: normal test commands add `SD_HOME=<temp>` at lines 39-43, while the cleanup uses a bare `exec.Command` at line 51. `paths.Home` defaults to `~/.safety-dance` when the variable is absent at `internal/paths/home.go:8-17`, and `stopDaemon` shuts down the daemon or installed service rooted there at `internal/cli/daemon.go:162-190`. The focused test was run with an isolated outer `HOME` to avoid this side effect.
- fix direction: route cleanup through the same isolated command helper or explicitly set its directory and `SD_HOME`; retain cleanup even after intermediate failures and assert the isolated daemon exits.

### CR-340 A committed gate update can be lost before accepted notification persists

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/admission.go:93`
- failure mode: if Git commits the gate ref and the daemon becomes unavailable before `notifyPush` marks the daemon receipt accepted, restart reconciliation ignores the unaccepted daemon receipt and never imports the gate-local receipt. The accepted push then creates no durable run.
- evidence or reproduction: pre-receive appends the admitted update to `<gate>/.safety-dance-receipts` before allowing ref mutation at `internal/git/hook.go:109-112`; post-receive treats notification failure as non-fatal and retains that journal entry at lines 196-205. `ReconcileOnce` selects only daemon receipts with `Accepted=true` at `internal/daemon/admission.go:93-108`, and no startup path reads the gate-local journal. The CR-336 regression injects an already accepted receipt, so it does not cover this interval.
- fix direction: give startup reconciliation one durable owner for post-ref/pre-notification custody, such as importing authenticated gate-local receipts and validating the live ref before marking them accepted; add a restart test that interrupts after ref mutation but before `notifyPush` persistence and proves exactly one run is created.

### CR-341 Replacement validation can go stale while an older publication rewinds the gate

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/manager.go:78`
- failure mode: a newer accepted head is validated before the manager cancels and waits for the prior run. If the prior run has already published remotely, it ignores cancellation for mirror reconciliation and can overwrite the gate with its older candidate. The manager then starts the replacement without revalidating, leaving its durable accepted head inconsistent with the live gate.
- evidence or reproduction: `ReplaceValidated` calls `validate` only at lines 78-82, then waits for the prior run at lines 99-121 and creates the replacement at lines 122-138 without a second check. After remote success, `Publish` uses a cancellation-independent context for mirror and binding at `internal/pipeline/steps/push.go:162-180`; the mirror callback unconditionally calls `git update-ref <ref> <candidate>` at `internal/cli/daemon.go:954-957` without an expected-old value.
- fix direction: prevent an older publication from replacing a newer accepted gate head by using compare-and-swap mirror updates and reconciling the newer head, then revalidate replacement custody after the blocking join before persisting or starting the run; add a barrier-based regression for this ordering.

### CR-342 Receipt acknowledgements are not crash-durable

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/admission.go:27`
- failure mode: admission and accepted-notification RPCs can acknowledge receipt persistence even though neither the temporary file nor its containing directory is synced. A power loss can retain the Git ref update while losing the only daemon receipt needed for restart recovery.
- evidence or reproduction: `saveReceipts` writes a fixed `.tmp` file and renames it at lines 27-40 without `File.Sync` or a directory sync, yet admit and notify return success after that helper. The gate-side journal similarly appends and renames through shell operations at `internal/git/hook.go:109-112,197-203` without a durability barrier. The plan requires durable accepted-ref custody and restart recovery, not process-lifetime persistence only.
- fix direction: implement atomic durable replacement with a uniquely created temporary file, file sync, rename, and parent-directory sync; apply an equivalent durable gate-journal operation before allowing mutation, and add fault-injection tests around each acknowledgement boundary.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found; the test-only hook helper, receipt metadata fields, and lifecycle smoke all have callers
- dependency findings: no dependency changed in the latest repair; pinned module checks passed in the existing verification evidence

## Verdict

- decision: request_changes
- overall code-health change: the latest repair closes deferred metadata loss and expands lifecycle coverage, but the complete change still has one unproved composition path, one test isolation hazard, and three durability or ordering failures
- rationale: CR-338 through CR-342 can hide broken shipped wiring, stop user state, lose accepted pushes, start a run against stale gate custody, or lose acknowledged receipts; each is major severity

## Review Limits

- blocked or unavailable checks: no pull request exists, so no title or hosted CI run was available; hosted release, authorized live-provider, hosted Windows service, and induced OS power-loss evidence remain unavailable. The performance axis judgment returned `unclear`, so that helper judgment was skipped and the axis was decided from source inspection.
- residual manual verification: run the first hosted `safety-dance-v*` release, an authorized provider flow, Windows service lifecycle, and power-loss recovery when those environments are available
