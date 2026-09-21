---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 4cc33ce600797d9c0ad650fb9bb56b8c583002f8
status: findings
summary: "The complete Safety Dance change was reviewed through 4cc33ce against origin/main. Critical publication, receipt, and cancellation races remain, and major provider, evidence, operator-interface, worktree-custody, replacement, logging, rollback, and regression-contract gaps remain. The next fix round must close CR-189 through CR-202 and add production-path regressions before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `4cc33ce600797d9c0ad650fb9bb56b8c583002f8`
- commits: 113 commits in `origin/main..HEAD`; latest product repair is `23a101b` and latest task receipt is `4cc33ce`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked task-evidence directories were excluded as review subjects

## Previous Round

- previous artifact: `61-code-review-safety-dance.md`
- CR-175 Nested validation can forge managed-hook admission: fixed
- CR-176 Receipt reconciliation deletes an admission before Git commits it: fixed
- CR-177 Delayed older notifications can cancel the newer branch run: fixed
- CR-178 Receipt processing races startup recovery: fixed
- CR-179 Cancellation can strand a successful remote push without a binding: still open
- CR-180 Orphan gate rollback can mutate or delete pre-existing state: fixed
- CR-181 Windows service installation still cannot create a task: fixed
- CR-182 Non-GitHub providers remain advertised but cannot execute: still open
- CR-183 Pull-request target selection is not durable across restart: fixed
- CR-184 Typed validation drops the required findings and evidence: still open
- CR-185 Public commands do not expose the required exit classes: still open
- CR-186 The distributed skill directs operators to prompts that status and logs do not show: fixed
- CR-187 The identity scanner does not enforce the imported permission-text boundary: fixed
- CR-188 Setup and TUI omit required operator state: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; latest implementation receipt `26-implementation-safety-dance.md`; verification `16-verification-safety-dance.md`; latest fixes `62-code-review-fixes-safety-dance.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed-file rules enforced by `scripts/validate.mjs`

## Change Profile

- intent and expected behavior: add the independently branded Safety Dance local Git gate, durable daemon, fixed validation and guarded publication pipeline, operator interfaces, canonical skill distribution, identity enforcement, and native release contract
- change description quality: no pull request exists; commit subjects pass the repository check, while task artifacts carry behavior, motivation, evidence, and limits
- implementation model and review model: implementation model is not recorded; review used GPT-5.6 Sol with four fresh GPT-5.6 Sol specialist passes
- changed-line size and logical cohesion: 225 non-task files and 37,888 added lines form one product import but remain far above the review split signal
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, and `internal/db/run.go` exceed 1,000 lines; no size-only finding is raised
- dependency or lockfile changes: the new Go module and `go.sum` passed race tests, vet, temporary build, identity scanning, and release-contract checks

## Tests Reviewed First

- behavior claimed by tests: the verification artifact records nine repository commands and all locally decidable acceptance items as passing at `49c6c2d`; the current review reran focused gate, daemon, CLI, pipeline, SCM, TUI, wizard, and worktree race tests, then `npm run test:safety-dance`
- missing or misleading coverage: current tests do not cover cancellation after a remote write, rejected-receive receipt replay, accepted objects absent from the working checkout, concurrent same-branch replacements, branch deletion, missing durable logs, pre-existing gate compensation, redirected TUI output, typed-result persistence, non-GitHub execution, or the required identity and Windows release matrix

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `6250` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 6250 in / 73 out`

### Correctness

- assessment and evidence: the fixed pipeline passes its current suites, but source tracing confirms that cancellation can leave a successful push unbound, rejected receives can later replay, accepted objects are recovered from the wrong repository, and several public commands still contradict the planned behavior. CR-189 and CR-194 through CR-201 record the concrete paths.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: package ownership is mostly explicit, but several public contracts are represented only by fields or readers that production never fills. Typed evidence, wizard choices, TUI publication state, and log paths are the clearest mismatches.
- helper coverage: covered, level 2, confidence 0.64

### Architecture

- assessment and evidence: gate admission, durable runs, publication, SCM, CLI, TUI, and release checks have distinct owners. The remaining defects cross those owners because the gate is not the accepted-object source, SCM detection exceeds executable providers, and validation output never reaches the durable step owner.
- helper coverage: covered, level 3, confidence 0.63

### Security

- assessment and evidence: the current admission path checks authenticated peer PID, managed-hook ancestry, gate/ref-bound single-use tokens, and the nested-run marker. No new critical or major authorization or secret-exposure defect was found; the rejected-receive replay in CR-194 is a receipt-integrity failure rather than an identity bypass.
- helper coverage: covered, level 2, confidence 0.55

### Performance

- assessment and evidence: no critical or major performance regression was found. Branch work is serialized only while coordinating ownership, CI polling is bounded, and the current Go race suites pass.
- helper coverage: unavailable

## Verification Story

- command or inspection: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli ./internal/pipeline/... ./internal/gate ./internal/scm ./internal/tui ./internal/wizard ./internal/worktrees/... && go vet ./...`
- result: exit 0; `internal/scm` has no test files
- command or inspection: `npm run test:safety-dance`
- result: exit 0; identity scan, full Go race suite, vet, temporary binary build, and two release-contract tests passed
- command or inspection: `git diff --check origin/main...HEAD -- ':!.agents/tasks/**'` and `npm run check-commits -- origin/main..HEAD`
- result: exit 0; 113 commit subjects passed
- command or inspection: built `cmd/safety-dance`, then ran `safety-dance respond` without its required run ID
- result: exit 5 with `accepts 1 arg(s), received 0`; the required usage class is 2
- manual, screenshot, or before-and-after evidence: no interface screenshot applies; hosted provider, Windows service, and release execution remain unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-189 Cancellation can still strand a successful remote push without a binding

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/push.go:142-175`
- failure mode: cancellation after `git push` writes the candidate can make the cancelled context fail post-push mirror work. `Publish` then clears `push_active`, the daemon marks the run cancelled, and future publication recovery rejects the terminal run before recording the mirror and binding.
- evidence or reproduction: `Push` verifies the remote with the caller context, and its new background reconciliation covers only the failed `Push` return. The subsequent mirror call and explicit context check still use the cancelled context. Current cancellation tests cancel before push starts and do not exercise this window.
- fix direction: reconcile every uncertain post-push outcome with a bounded non-cancelled context, retain durable publication ownership until remote, mirror, and binding agree, and add a test that cancels after the remote receives the candidate.

### CR-190 Non-GitHub providers remain advertised but cannot execute

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:500-509`
- failure mode: GitLab, Bitbucket, Azure DevOps, Forgejo, and Gitea remotes are detected and configured elsewhere, but every accepted run on those providers fails before the pipeline because the production SCM factory constructs only GitHub.
- evidence or reproduction: `scm.Provider` and configuration advertise six providers, while `newSCMHost` returns an unsupported-provider error for every provider except GitHub. No non-GitHub provider implementation or provider-backed fixture exists.
- fix direction: either implement and test each advertised provider through the shared host boundary or remove unsupported provider detection, configuration, documentation, and choices until implementations exist.

### CR-191 Typed validation still drops durable findings and evidence

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:95-167`
- failure mode: review and intent agents return findings and evidence, but the pipeline discards both after checking the verdict. Operators, restart recovery, and audit history cannot recover what the agent found or which output produced the verdict.
- evidence or reproduction: `typedResult` parses findings and evidence, then `Typed` returns only `nil` or an error. `Runner.Run` completes the step with zero duration, empty log path, and no `FindingsJSON` write at `internal/pipeline/runner.go:177-188`.
- fix direction: return a typed step result, validate finding objects against the domain schema, and persist findings, evidence, attempts, output references, duration, exit classification, and reviewed head before advancing.

### CR-192 Public commands still do not expose the required usage exit class

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/root.go:30-49`
- failure mode: Cobra argument-validation errors that do not contain the words `usage` or `unknown command` are classified as generic run failures, so scripts cannot distinguish invalid invocation from failed validation.
- evidence or reproduction: a freshly built binary running `safety-dance respond` without its required argument exits 5 and prints `accepts 1 arg(s), received 0`; the plan requires usage errors to exit 2.
- fix direction: map typed Cobra and command errors to explicit `ExitCodeError` values instead of classifying free-form message text, then test every public exit class through the built binary.

### CR-193 Setup and TUI fields exist but production does not use them

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/wizard.go:79-142`
- failure mode: setup asks for gate and provider values but ignores them when writing configuration or initializing the gate. The TUI type has publication and key-hint fields, but its loader never populates them and ignores `fix_review` prompts, so the required operator state is still absent.
- evidence or reproduction: the wizard write callback consumes only `Upstream` and `ValidationCommands`. `internal/cli/tui.go:64-81` fills neither `Publication` nor `KeyHint` and recognizes only `awaiting_approval`, despite `fix_review` being respondable.
- fix direction: either apply and validate every collected setup value or stop asking for it, then derive publication, key hints, and every durable prompt state from the same semantic model used by status and plain output.

### CR-194 A rejected receive can be replayed later as an accepted push

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/git/hook.go:46-70`
- failure mode: pre-receive persists admission receipts before all ref checks and before the preserved user hook succeeds. If a later ref or user hook rejects the receive, the daemon retains those receipts and can start a stale run if the gate ref later happens to equal the recorded candidate.
- evidence or reproduction: `ReconcileOnce` at `internal/daemon/admission.go:86-108` now keeps every nonmatching receipt indefinitely and treats a future matching ref as proof of acceptance. The receipt contains no durable receive-completion identity.
- fix direction: bind receipts to a receive transaction that post-receive marks complete, discard all receipts when pre-receive rejects, and test a multi-ref or preserved-hook rejection followed by a later ref reaching the old candidate.

### CR-195 Accepted-head custody reads from the mutable working checkout

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:468-473`
- failure mode: a push accepted by the bare gate can fail before durable run creation when the accepted object is absent from the originally registered working checkout. Recovery has the same dependency and can fail after that checkout prunes the object.
- evidence or reproduction: `recordPush` and `executeRun` call worktree creation and recovery with `repo.WorkingPath`, not the persisted bare gate that received `n.New`. The plan names the gate head as the durable custody source.
- fix direction: create and recover detached worktrees from the gate repository or an explicit durable object store, verify the checked-out SHA, and test a push whose object exists only in the gate.

### CR-196 Branch deletion is admitted but cannot become a durable run

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/admission.go:277-298`
- failure mode: deleting a branch passes admission because the all-zero new revision is nonempty. Post-receive then tries to create a detached worktree at the zero object, fails notification, and leaves an accepted gate mutation without a durable run.
- evidence or reproduction: neither the generated hook nor `admit` rejects deletion updates, while `recordPush` passes `n.New` directly to `worktrees.CreateDetached`. No deletion test exists.
- fix direction: reject deletions before mutation unless deletion is a supported durable operation, or model and persist deletion runs without requiring a commit worktree.

### CR-197 Concurrent same-branch replacements can let the older request win

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/manager.go:48-80`
- failure mode: `Replace` releases the global mutex while waiting for the prior run. Two replacements for the same branch can both wait on that run; whichever reacquires the mutex first becomes current, while the other errors, regardless of notification order.
- evidence or reproduction: lines 67-73 unlock for `prior.Wait` and only reject the loser after another request installs a replacement. There is no per-key sequencing token or lock, and tests cover only one replacement.
- fix direction: serialize cancel, join, persist, and assign with a per-branch coordinator or monotonic accepted-update sequence, while leaving different branch keys independent.

### CR-198 Abort requests are rejected once publication ownership is active

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/db/runs.go:79-94`
- failure mode: an operator abort during push preparation returns an error instead of cancelling the run context, so publication may proceed despite the requested cancellation.
- evidence or reproduction: the daemon IPC handler calls `CancelRun` before `manager.Cancel`; `CancelRun` requires `push_active = 0`, so the active runner never receives cancellation once publication ownership is acquired. Current tests cover only a context cancelled before `Push` starts.
- fix direction: persist cancellation intent even during publication, signal the exact run, and make the publication owner reconcile whether the remote changed before deciding cancelled versus published.

### CR-199 The logs command reads files no production path writes

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/logs.go:11-30`
- failure mode: `safety-dance logs` and `safety-dance logs <run-id>` report `no logs` for real daemon and run activity, preventing operators from diagnosing failed durable runs.
- evidence or reproduction: the command reads `daemon.log` and `<run-id>/run.log`, but production has no writer for either path. Direct daemon startup inherits terminal streams, service definitions do not route output to these files, and durable steps persist empty log paths.
- fix direction: make the daemon and step executor own bounded log files, persist their paths, route service output there, and test both daemon and run log commands through a built binary.

### CR-200 Wizard compensation does not restore a repaired existing gate

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/wizard.go:111-138`
- failure mode: if setup repairs an existing gate and service installation then fails, compensation restores repository configuration and origin but leaves changed gate hooks, bare configuration, and the Safety Dance remote in place.
- evidence or reproduction: compensation calls `gate.Eject` only when `gate.Init` reports `createdGate`. Existing-gate repairs return false, and the wizard holds no snapshot or compensating action for those writes.
- fix direction: have gate initialization return a rollback handle for both creation and repair, execute it in reverse order on later failure, and add a service-failure test starting from a tampered existing gate.

### CR-201 Redirected TUI output can enter the interactive polling loop

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/tui.go:84-93`
- failure mode: redirecting stdout while stdin remains attached to a terminal starts the interactive polling loop and emits repeated snapshots instead of the required one-shot ANSI-free plain view.
- evidence or reproduction: noninteractive selection checks `os.Stdin.Fd()` rather than the actual output writer. The TUI has no explicit plain flag and no redirected-output regression.
- fix direction: choose interactive mode only when both input and output are terminals, support explicit plain mode, and test redirected stdout with terminal stdin.

### CR-202 Phase 6 regression and documentation contracts remain incomplete

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `tests/safety-dance-identity.test.mjs:16-38`
- failure mode: the required identity classes and Windows release asset contract can regress while the aggregate remains green, and repository testing documentation does not tell maintainers which Safety Dance proof is local versus hosted.
- evidence or reproduction: identity tests cover one generic retired-name string, task-history exclusion, and an incomplete license. Release tests omit the Windows matrix and archive executable name. `docs/testing.md` was not updated with Safety Dance checks, temporary-remote proof, provider evidence, or hosted release limits.
- fix direction: add the planned command, module, environment, path, service, release-asset, and copied-legal-text fixtures; inspect Windows archive naming and executable contents; update `docs/testing.md` with the evidence boundaries.

## Advisories

### ADV-001 Identity scanning is broader than the product scope

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `scripts/check-safety-dance-identity.mjs:14-46`
- evidence: the scanner recursively reads the whole repository except a short skip list, although the plan limits enforcement to shipped Safety Dance tool, skill, scripts, tests, generated metadata, root docs, and product workflow files.
- suggestion: enumerate the shipped roots so unrelated skill, workflow, or documentation text cannot fail the product identity gate.

### ADV-002 Public platform documentation omits Windows releases

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `docs/safety-dance.md:7`
- evidence: the guide says release archives cover Linux and macOS, while the release matrix also publishes Windows.
- suggestion: list the actual supported targets and keep that list checked against the workflow matrix.

## Dead Code and Dependency Review

- newly orphaned code: no newly orphaned production package was proven; `typedResult.Findings`, `typedResult.Evidence`, `tui.Model.Publication`, and `tui.Model.KeyHint` are populated or declared but not carried into their durable or rendered production owners as recorded above
- dependency findings: no lockfile, license, maintenance, or build failure was found in the pinned Go module; `npm run test:safety-dance` and notice generation passed

## Verdict

- decision: request_changes
- overall code-health change: the branch adds a coherent product boundary and fixes several prior trust and recovery defects, but critical data-integrity races and multiple major acceptance gaps remain
- rationale: CR-189 through CR-202 affect required publication safety, accepted-push durability, cancellation, provider behavior, audit evidence, operator commands, setup rollback, or specified regression proof

## Review Limits

- blocked or unavailable checks: no pull request or hosted CI run exists; live non-GitHub provider, hosted Windows service, and product release execution were unavailable; the previous verification artifact pins `49c6c2d`, not current HEAD; the performance helper row returned `unclear`, so performance coverage was decided directly and recorded as unavailable
- residual manual verification: after fixes, exercise a built binary from gate push through daemon completion, cancel after remote write, replay a rejected receive, push an object absent from the registered checkout, run concurrent same-branch replacements, inspect real logs and TUI redirection, and verify hosted provider, Windows service, and release behavior
