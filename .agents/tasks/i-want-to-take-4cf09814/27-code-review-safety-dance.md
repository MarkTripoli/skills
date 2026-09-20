---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: d6b1c00abc40a945bb293db5878ad3c4972ee0a8
status: findings
summary: "Review of the 57-commit Safety Dance change found that accepted pushes can publish after cancellation-only validation steps, and the gate, worktree, cancellation, service, and wizard boundaries do not enforce the plan's safety guarantees. The next phase must implement the real validation path and close every critical and major finding before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `d6b1c00abc40a945bb293db5878ad3c4972ee0a8`
- commits: 57 commits on `safety-dance` after `origin/main`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked task evidence directories

## Previous Round

None.

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate as an independently named, complete system
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; latest receipt `.agents/tasks/i-want-to-take-4cf09814/26-implementation-safety-dance.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed-file contracts named by the plan

## Change Profile

- intent and expected behavior: add a Safety Dance Go binary, authenticated local Git gate, durable branch runs, fixed validation pipeline, guarded publication, operator interfaces, canonical skill distribution, and native releases
- change description quality: no pull request exists; commit subjects are focused and passed the repository commit check, but the implementation receipts and verification artifact claim completed behavior that the production call paths do not provide
- implementation model and review model: implementation model was not recorded; review model `GPT-5.6 Sol`
- changed-line size and logical cohesion: 205 product files, 34,824 additions and 4 deletions, plus 27 task artifacts; the six planned phases are present in commit history, but several large imported packages remain disconnected from the public execution path
- resulting large-file concerns: `internal/config/config.go` is 3,106 lines and several imported agent, database, Git, and SCM files exceed 1,000 lines; the more serious issue is unused capability behind successful no-op pipeline steps
- dependency or lockfile changes: new Go module and lockfile with pinned versions; release archives do not carry the imported MIT license or third-party notices

## Tests Reviewed First

- behavior claimed by tests: the verification artifact records nine passing repository commands, 28 locally decidable acceptance items, three repeated root aggregate runs, authenticated hook fixtures, branch replacement, publication ordering, CLI flows, installer coverage, and release-contract checks
- missing or misleading coverage: executable hook coverage forces rejection with an empty token option instead of testing an ordinary tokenless push; pipeline tests inject fake successful steps rather than exercise the production no-op implementations; the end-to-end publication fixture starts upstream at the candidate and does not drive hook admission, daemon notification, worktree creation, validation, and publication as one flow; CLI tests do not prove that `run`, `abort`, service management, wizard rollback, or the TUI perform their documented operations

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `6143` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 6143 in / 73 out`

### Correctness

- assessment and evidence: the production daemon registers eight validation steps that return success without doing work, equates the accepted head with the reviewed head, and then publishes it (`tools/safety-dance/internal/pipeline/steps/review.go:5-11`, `tools/safety-dance/internal/cli/daemon.go:279-312`). Fresh runs are only inserted, abort does not cancel the runner, worktrees are not created, and service definitions and service commands cannot start or control a daemon.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: the public execution path is short but dishonest about its behavior. Large imported agent, SCM, configuration, and process-management packages compile while the fixed pipeline uses cancellation-only stubs, so the code presents capabilities that callers cannot reach.
- helper coverage: covered, level 2, confidence 0.64

### Architecture

- assessment and evidence: ownership is split at the wrong boundaries. `Manager` does not own worktree creation or external cancellation, admission does not use the existing process ancestry classifier, `StartFreshRun` bypasses the manager, and service installation has no platform owner beyond command names.
- helper coverage: covered, level 3, confidence 0.79

### Security

- assessment and evidence: the receive hook issues its own admission token to any same-user IPC peer, notification accepts arbitrary gate/ref/SHA strings, nested-run rejection is only an unsettable environment check at the CLI, and query-string credentials are retained by URL redaction.
- helper coverage: covered, level 3, confidence 0.97

### Performance

- assessment and evidence: no hot-path scalability regression was proven. The daemon does query all step rows before each pipeline step (`tools/safety-dance/internal/pipeline/runner.go:64-83`), but run histories are bounded enough that this is not a release-blocking issue compared with the correctness failures.
- helper coverage: covered, level 2, confidence 0.55

## Verification Story

- command or inspection: accepted the recorded passes in `.agents/tasks/i-want-to-take-4cf09814/16-verification-safety-dance.md`; inspected every changed-file group through five focused review passes and traced the public daemon, hook, manager, pipeline, publication, CLI, service, wizard, configuration, release, and skill call paths
- result: repository checks are green, but source inspection found critical and major behavior gaps that the tests do not exercise
- manual, screenshot, or before-and-after evidence: no pull request, hosted release, live provider run, screenshot, or interactive TUI evidence exists; hosted release and provider checks remain deferred in the verification artifact

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 Validation steps approve every candidate without validation

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/review.go:5`
- failure mode: an accepted push proceeds through intent, rebase, review, test, document, lint, pull-request, and CI steps that only check cancellation and return success, so unreviewed and failing code reaches the upstream remote
- evidence or reproduction: all eight non-push step files have the same cancellation-only body; `executeRun` registers them and sets both `Candidate` and `ReviewedHead` to `run.HeadSHA` before calling `Publish` at `tools/safety-dance/internal/cli/daemon.go:279-312`
- fix direction: wire the imported agent, configured commands, SCM provider, and CI implementations into the fixed steps; persist each typed result and the actual approved head; fail closed when a required implementation or result is missing

### CR-002 Abort changes SQLite but leaves publication running

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:204`
- failure mode: `safety-dance abort` can report cancellation while the run context continues through push, mirror update, and publication binding
- evidence or reproduction: the cancel RPC calls only `d.CancelRun`; it never calls `RunHandle.Cancel`, and `Publish` does not require the durable run to remain active at its push, mirror, or binding boundaries (`tools/safety-dance/internal/pipeline/steps/push.go:85-116`)
- fix direction: route cancellation through the manager, wait for the runner to stop, and use guarded durable state checks immediately before push, mirror update, and binding

### CR-003 The receive gate authorizes ordinary direct pushes

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/git/hook.go:49`
- failure mode: a direct push with no pre-issued launch token asks the daemon for its own token and then consumes it, so the admission gate does not distinguish an authorized launch from a validation child or other local process
- evidence or reproduction: the hook calls `issue-push-token` when no push option exists; issuance accepts any IPC peer with a positive PID and performs no ancestry or launch-policy check (`tools/safety-dance/internal/daemon/admission.go:42-54`). The executable test forces rejection by supplying `safety-dance-token=` rather than testing a push with zero options (`tools/safety-dance/internal/daemon/hook_e2e_test.go:94-101`)
- fix direction: issue a gate/ref/process-bound token before the authorized push, pass it as a push option, reject tokenless hooks, and apply the existing ancestry classifier at daemon ingress

### CR-004 Accepted heads do not receive isolated worktrees

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/manager.go:58`
- failure mode: a run records a future worktree path but never creates or verifies it, then silently executes against the operator's mutable checkout
- evidence or reproduction: `Manager.Replace` persists and starts the runner without calling `worktrees.CreateDetached`; `executeRun` falls back to `repo.WorkingPath` when the recorded directory does not exist (`tools/safety-dance/internal/cli/daemon.go:269-273`). `CreateDetached` and `RecoverDetached` have no production callers
- fix direction: create and verify the detached worktree at the accepted gate head before transitioning to running; recover it on restart and fail closed on a head mismatch or missing custody

### CR-005 Publication can bind a candidate without checked reviewed-head continuity

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/push.go:90`
- failure mode: when upstream already equals the candidate, `Publish` skips `Push`, including its `Candidate == ReviewedHead` check, then updates the mirror and records a publication binding
- evidence or reproduction: reviewed-head validation exists only at `Push` lines 23-26; the upstream-equals-candidate branch at lines 90-98 bypasses that function
- fix direction: validate candidate identity and the persisted review approval at the start of `Publish`, before binding lookup or remote reconciliation, and retain the check at every replay path

### CR-006 Fresh CLI runs never execute

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:175`
- failure mode: `safety-dance run` prints that a run started, but the row remains unscheduled and no pipeline goroutine owns it
- evidence or reproduction: `MethodStartFreshRun` calls `InsertRun` and immediately returns a `created` receipt; it does not call `Manager.Replace`, transition to running, assign a worktree, or start `executeRun`
- fix direction: submit fresh runs through the same custody and manager path as accepted pushes and return only after durable assignment and scheduling

### CR-007 Notifications can fabricate accepted updates

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:68`
- failure mode: any same-user IPC client can submit an arbitrary managed gate, ref, and SHA to start or supersede a run without a matching admitted Git update
- evidence or reproduction: `notifyPush` checks only for a positive peer PID and nonempty strings; it does not consume an admission receipt or resolve the gate ref to the claimed new SHA before `recordPush` persists it
- fix direction: carry a one-use admission receipt into post-receive, verify the gate ref equals the notification SHA, and reject nested process ancestry

### CR-008 Concurrent same-branch replacements can run together

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/manager.go:46`
- failure mode: two concurrent replacements that observe the same prior handle both wait for it; after one installs a replacement, the second proceeds without rechecking and overwrites the map, leaving both new runs active for the same branch
- evidence or reproduction: the manager releases its sole mutex before `prior.Wait`, then only conditionally deletes the old handle and continues directly to `CreateRunFromAccepted` at lines 51-70
- fix direction: serialize the complete replace operation with a keyed lock, or loop and re-read the current handle after every wait before creating the next run

### CR-009 A daemon crash leaves a permanent ownership lock

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/daemon.go:18`
- failure mode: an unclean daemon exit leaves the `O_EXCL` lock file, and every later start reports that the runtime home is already owned
- evidence or reproduction: `AcquireOwnership` treats every existing file as a live owner; only `Ownership.Close` removes it, and the test covers a live second owner rather than crash reacquisition
- fix direction: use an operating-system advisory lock released on process death, with platform implementations and an unclean-exit recovery test

### CR-010 Service installation and stopping do not identify or control a service

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/service.go:20`
- failure mode: generated definitions invoke `safety-dance daemon` without `serve`, every runtime home shares one label, and install/stop execute only `launchctl`, `systemctl`, or `schtasks` with no arguments
- evidence or reproduction: definitions at lines 28-34 omit `serve`; `Install` and `Stop` call the bare command names at lines 48-84; platform files contain no implementation
- fix direction: create home-specific labels and persisted platform definitions that invoke `daemon serve`, then run exact install/start/stop commands against that owned definition

### CR-011 Wizard rollback can delete a pre-existing installation

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/wizard.go:41`
- failure mode: if service setup fails after an idempotent gate repair, rollback calls full `gate.Eject` and removes pre-existing remote, gate, worktree, run, and repository state
- evidence or reproduction: the wizard ignores `gate.Init`'s created-versus-repaired result and always registers `gate.Eject` as compensation at lines 41-47
- fix direction: journal each write and its prior value, compensate only changes made by this attempt in reverse order, and test service failure against an existing installation

### CR-012 Repository configuration accepts misspelled safety fields

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/config/config.go:2341`
- failure mode: a misspelled repository setting silently falls back to a different validation or publication policy
- evidence or reproduction: repository YAML uses permissive `yaml.Unmarshal`, while only global configuration enables known-field rejection
- fix direction: decode repository configuration with `yaml.Decoder.KnownFields(true)` and add unknown-key tests for safety-sensitive fields

### CR-013 Query-string credentials are persisted and logged

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/safeurl/redact.go:9`
- failure mode: remotes using `access_token`, signed query parameters, or similar query credentials retain those secrets in database and log output
- evidence or reproduction: `Redact` removes only URL userinfo and leaves the complete query intact; gate initialization persists and reports the returned value at `tools/safety-dance/internal/gate/gate.go:118-123,167-175`
- fix direction: redact credential-like query values and fragments before persistence or logging, with table tests for supported remote URL forms

### CR-014 The installed skill documents a command the binary rejects

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/safety-dance/references/commands.md:27`
- failure mode: following the skill's response example fails with `unknown flag: --answer`
- evidence or reproduction: the skill documents `respond <run-id> <prompt-id> --answer ...`; the CLI accepts `respond <run-id> --step <step> --action <action>`
- fix direction: align the reference with the public parser and add a test that executes every documented command shape through Cobra parsing

### CR-015 Release archives omit the required license notice

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/scripts/package-release.sh:18`
- failure mode: native archives distribute only the executable, so recipients do not receive the imported MIT copyright and permission notice that the task explicitly preserves
- evidence or reproduction: both archive branches add only `safety-dance` or `safety-dance.exe`; the release workflow uploads those archives and a checksum manifest
- fix direction: include `tools/safety-dance/LICENSE` and applicable third-party notices in every archive, then inspect each platform archive in release-contract tests

### CR-016 A custom post-receive hook disables durable run creation

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/git/hook.go:194`
- failure mode: a repository with an existing custom post-receive hook accepts gate updates but never notifies the daemon, so no durable validation run starts
- evidence or reproduction: `RefreshManagedPostReceiveHook` returns without installing the managed notifier whenever the existing hook is not recognized as Safety Dance-owned
- fix direction: preserve the custom hook under an owned companion name, install a managed wrapper that replays stdin to both behaviors, and test accepted-ref notification with a pre-existing custom hook

### CR-017 The TUI is a one-shot text print rather than an operator interface

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/tui.go:15`
- failure mode: operators cannot observe live step, prompt, finding, error, or publication changes and cannot use the promised compact and wide interactive views
- evidence or reproduction: `renderTUI` reads one database snapshot, selects one active run, and prints text; `internal/tui/app.go` only blocks until context cancellation and has no production caller
- fix direction: subscribe to daemon events, update one semantic root model, implement TTY/plain behavior and key handling, and add compact/wide golden plus built-binary interaction tests

## Advisories

### ADV-001 Build jobs receive release write credentials

- type: Potential issue
- severity: minor
- category: Security and privacy
- location: `.github/workflows/safety-dance-release.yml:5`
- evidence: workflow-level `contents: write` applies to every matrix build that executes repository build and packaging code, although only the publish job creates the release
- suggestion: set workflow or build permissions to `contents: read` and grant `contents: write` only on the publish job

### ADV-002 Packager version validation accepts malformed versions

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `tools/safety-dance/scripts/package-release.sh:12`
- evidence: the script accepts values such as `1.2`, `1..2`, and `1.2.3.4`; the following `case` has no rejecting branch. The workflow performs a stricter check, but direct packaging does not
- suggestion: require exactly three numeric components in the script and add invalid-input cases

### ADV-003 Identity regression fixtures cover only one token family

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `tests/safety-dance-identity.test.mjs:23`
- evidence: the scanner tests one hyphenated retired token, not the planned command, module, environment, path, service, release-asset, and out-of-license legal-copy cases
- suggestion: add one fixture for each required identity category and case-insensitive display spelling

## Dead Code and Dependency Review

- newly orphaned code: the imported agent constructors and GitHub SCM implementation are not called by production validation; their intended review, PR, and CI owners are successful no-op step functions. `internal/custody` is also outside the command dependency graph
- dependency findings: versions are pinned in `go.sum`; several UI and formatting modules remain unused by the current command behavior, and release archives omit the imported MIT notice and third-party license material

## Verdict

- decision: request_changes
- overall code-health change: the branch adds a broad compileable product and green checks, but its trusted path currently weakens repository safety by publishing without validation and by bypassing durable lifecycle controls
- rationale: critical failures exist at validation, cancellation, admission, worktree custody, and publication continuity; major operator, recovery, configuration, documentation, and release defects remain

## Review Limits

- blocked or unavailable checks: no pull request title or body, hosted release, authorized provider run, or live service-manager execution exists
- residual manual verification: after fixes, drive one built binary through tokenized hook admission, isolated worktree creation, a failing and passing real validation command, abort during push preparation, restart recovery, guarded publication, interactive TUI, and each platform service definition
