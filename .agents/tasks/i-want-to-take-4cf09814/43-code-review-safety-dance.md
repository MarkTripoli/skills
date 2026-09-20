---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: e6b2a27aaf96901592db9bb6b54ee692f676b964
status: findings
summary: "The complete 82-commit Safety Dance diff was reviewed at e6b2a27 against origin/main. Production can still publish after empty validation stages, nested validation descendants can mutate the daemon, and run replacement, response resume, reviewed-head continuity, publication recovery, platform service, wizard, TUI, licensing, and release claims retain critical or major defects. The next fix round must close these paths and add production-level regression tests before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `e6b2a27aaf96901592db9bb6b54ee692f676b964`
- commits: 82 commits in `origin/main..HEAD`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two task-owned untracked directories were excluded as review subjects

## Previous Round

- previous artifact: `41-code-review-safety-dance.md`
- CR-070 Production still self-certifies the fixed pipeline: still open
- CR-071 Darwin descendants bypass the nested-run fence: still open
- CR-072 Rejected pushes leave replayable admission receipts: fixed
- CR-073 Replaying an accepted nonce cancels its authoritative run: fixed
- CR-074 Supersession can race an externally visible push: still open
- CR-075 Trusted policy can come from a stale local tracking ref: fixed
- CR-076 Respond reports success but no pipeline consumes the decision: still open
- CR-077 The promised Windows binary cannot admit or mutate: fixed
- CR-078 Service ownership is not stable across install and stop: fixed
- CR-079 Publication persists raw credential-bearing remotes: fixed
- CR-080 The identity scanner skips project skills and mixed-case branding: fixed
- CR-081 Release archives omit required dependency notices: still open
- CR-082 Missing-binary recovery points to a skill-only installer: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; the request imports the referenced repository's behavior under the Safety Dance identity without product references to the source repository
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add a branded local Git gate, durable daemon, fixed validation pipeline, guarded publication, operator interfaces, canonical skill distribution, identity enforcement, and native releases
- change description quality: no pull request exists; commit subjects pass the repository check, but there is no PR body describing behavior, decisions, evidence, or limits
- implementation model and review model: implementation model was not recorded in the selected implementation receipt; review used GPT-5.6 Sol and four focused GPT-5.6 Sol implementation-review workers
- changed-line size and logical cohesion: 35,981 non-task changed lines across 213 files and 82 commits; the change is a single product import, but it exceeds the review guide's split signal by more than an order of magnitude
- resulting large-file concerns: `internal/config/config.go` is 3,140 lines, `internal/agent/agent.go` is 1,353 lines, and several imported packages exceed 1,000 lines; production pipeline wiring bypasses much of the imported validation behavior
- dependency or lockfile changes: a new Go module and dependency graph were added; release notices do not cover all linked third-party license obligations

## Tests Reviewed First

- behavior claimed by tests: the prior verification artifact records all local checks passing at `49c6c2d`; at reviewed HEAD, `npm test` passed 136 Node tests, the full Go race suite, `go vet`, a temporary binary build, and 2 release tests
- missing or misleading coverage: the end-to-end suite wires synthetic step callbacks rather than the production `executeRun` path; it does not prove substantive default validation, same-branch replacement with the real runner, response wake-up, final-HEAD continuity, stale `push_active` recovery, absolute service execution, the full wizard contract, application-level responsive TUI rendering, or complete archive notices

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `6107` in / `73` out

### Correctness

- assessment and evidence: the run lifecycle cannot replace a cancelled active run, consume operator responses, resume after a HEAD-changing step, or recover publication ownership after a daemon crash. Publication also trusts two copies of stored review evidence instead of comparing it with the final worktree HEAD.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: the production path is short but misleading because named validation stages collapse to one optional shell-command helper and a whitespace check. `WithRun` and durable response storage advertise control paths that no production runner uses.
- helper coverage: covered, level 3, confidence 0.67

### Architecture

- assessment and evidence: the imported agent, provider, response, and recovery owners are not connected to the daemon pipeline. Worktree creation occurs before durable ownership, while terminal cleanup is absent.
- helper coverage: covered, level 3, confidence 0.84

### Security

- assessment and evidence: validation commands do not receive `SD_PARENT_RUN_ID`, authorization stops at the first command containing `safety-dance`, and Darwin environment inspection did not expose the marker in a live exact-PID probe. A validation descendant can therefore invoke mutating CLI operations or local pushes.
- helper coverage: covered, level 3, confidence 0.75

### Performance

- assessment and evidence: no hot-path query or loop regression was found. Receipt reconciliation holds its global mutex while durable run replacement may wait for an active run to stop, which serializes unrelated hook admission during that wait, but the correctness findings are the release blockers.
- helper coverage: covered, level 3, confidence 0.54

## Verification Story

- command or inspection: `npm test`; `npm run check-commits -- origin/main..HEAD`; `git diff --check origin/main...HEAD`; focused source and test inspection across daemon, pipeline, database, worktree, service, wizard, TUI, identity, and release paths; live Darwin `ps eww -p <pid> -o command=` probe with `SD_PARENT_RUN_ID=probe`
- result: `npm test` passed 136 Node tests plus all Go race, vet, build, and release checks; 82 commit subjects passed. `git diff --check` reported three trailing-whitespace lines only in excluded task history. The Darwin probe did not expose `SD_PARENT_RUN_ID`.
- manual, screenshot, or before-and-after evidence: no new interface screenshot or hosted release evidence exists; prior verification still records hosted release and live-provider checks as untested

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-083 Production still self-certifies the fixed pipeline

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:41`
- failure mode: a repository with valid empty/default command configuration passes intent, rebase, review, test, document, lint, pull-request, and CI after only repeated `git diff --check` calls, then publishes without agent review or provider-backed PR and CI validation
- evidence or reproduction: `Validate` runs a stage command only when its string is nonempty and otherwise proceeds directly to `git diff --check` at lines 50-64. The daemon records `HEAD` as approved after that no-op review at `internal/cli/daemon.go:440-448`. The production path does not call the imported agent or provider owners.
- fix direction: connect the actual typed agent review, rebase, pull-request, and CI owners to production execution and fail closed when a required owner is unavailable; add a built-binary test with empty command configuration that cannot publish

### CR-084 Nested validation descendants can mutate the daemon

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:52`
- failure mode: a configured validation command can invoke `safety-dance run`, `respond`, `abort`, lifecycle commands, or a local push against its parent run because the spawned shell has no parent-run marker
- evidence or reproduction: `exec.CommandContext` inherits the daemon environment and never adds `SD_PARENT_RUN_ID`; `executeRun` also never calls the otherwise unused `steps.WithRun`. `AuthorizeMutationPeer` returns on the first ancestry command containing `safety-dance` at `internal/daemon/admission.go:182-197`, so even a marked parent could be bypassed by unsetting the variable on the direct CLI child. On Darwin, the exact command used by `processEnvironment` did not expose `SD_PARENT_RUN_ID` in a live probe.
- fix direction: inject immutable parent-run identity into every validation process, inspect the full ancestry before accepting an exact executable identity, replace Darwin `ps` parsing with an API that returns the target process environment, and add executable Linux and Darwin descendant tests

### CR-085 Same-branch replacement fails after cancelling the active runner

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/manager.go:62`
- failure mode: a newer accepted push cancels and joins the prior production runner, but the runner records cancellation as `failed`; `SupersedeRun` then rejects that terminal status and the replacement run is never created
- evidence or reproduction: the daemon runner changes any `executeRun` error from `running` to `failed` at `internal/cli/daemon.go:187-195`. `Replace` waits for that callback before calling `SupersedeRun` at lines 62-76, while `SupersedeRun` updates only `pending` or `running` rows at `internal/db/runs.go:97-109`. Existing manager tests use a callback that does not transition status, so they miss the production failure.
- fix direction: make cancellation and supersession one durable state transition owned by the manager, then add a production-runner regression test proving the replacement persists and starts

### CR-086 Respond persists decisions that no runner consumes

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:246`
- failure mode: `respond` can acknowledge a stored approval, fix, skip, or abort decision but no parked pipeline step wakes, consumes it, or changes state
- evidence or reproduction: the handler validates and inserts a row at lines 246-284; `RecordResponse` only inserts at `internal/db/responses.go:16-28`; the synchronous runner at `internal/pipeline/runner.go:51-109` has no response reader or wait channel. Production also never creates an awaiting-approval step through this runner.
- fix direction: add durable parking and response consumption with compare-and-set step transitions, resume the matching run after restart, and acknowledge only after the response is bound to a waiting step

### CR-087 Publication does not compare the final worktree HEAD with review evidence

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:464`
- failure mode: test, document, or lint commands may change or commit the worktree after review, but publication pushes the older stored review SHA and silently omits or misattributes later validated changes
- evidence or reproduction: review stores `HEAD` at lines 440-448, later commands run at lines 449-454, and push copies the same stored value into both `Candidate` and `ReviewedHead` at lines 464-471. `Push` therefore compares caller-supplied identical strings instead of resolving current `HEAD`.
- fix direction: resolve `HEAD` immediately before publication, require exact equality with durable review evidence, and test committed and uncommitted mutations after review

### CR-088 Production never selects explicit-lease publication

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:362`
- failure mode: accepted pushes do not retain the verified upstream or previously reconciled head, so production never sets `VerifiedHead` or `Rewrite` and cannot perform the planned guarded rewrite
- evidence or reproduction: `recordPush` leaves `PreviousReconciledHead` empty at lines 362-363; production builds `PushRequest` from the resulting empty `run.BaseSHA` and never sets `Rewrite` at lines 419-428. The explicit lease path at `internal/pipeline/steps/push.go:39-49` is exercised only by direct test requests.
- fix direction: persist the live verified upstream head during branch reconciliation, select rewrite only through approved policy, and drive `--force-with-lease=<ref>:<verified-head>` through the production daemon path in an end-to-end test

### CR-089 A daemon crash leaves publication permanently unclaimable

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/pipeline/steps/push.go:102`
- failure mode: a crash after setting `push_active` leaves the recoverable run unable to reacquire publication ownership, including the case where the remote write succeeded but mirror and binding persistence did not
- evidence or reproduction: `AcquireRunPushActive` requires `push_active=0` at `internal/db/run.go:557-568`. `Publish` acquires before checking whether upstream already equals the candidate at lines 102-119. `Manager.Recover` resumes pending/running runs without clearing or reconciling stale ownership.
- fix direction: add restart ownership recovery that inspects durable state, upstream, and gate mirror before safely reclaiming or clearing stale `push_active`; test process interruption after the network push

### CR-090 Restart rejects worktrees advanced by completed steps

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:383`
- failure mode: after rebase or another completed step changes `HEAD`, daemon restart compares the worktree to the original accepted head and fails before the durable runner can skip or resume steps
- evidence or reproduction: `RecoverDetached` requires current `HEAD == run.HeadSHA` at `internal/worktrees/ownership.go:43-61`, while the runner skips completed steps solely by status at `internal/pipeline/runner.go:82-87`. No step result persists the resulting HEAD and input fingerprint required by the plan.
- fix direction: persist each modifying step's resulting HEAD and inputs, recover the worktree at the latest durable step head, and skip only when both durable inputs and output head match

### CR-091 Worktree ownership and cleanup do not bracket filesystem creation

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:234`
- failure mode: a crash after `git worktree add` but before run persistence leaves an unowned registered worktree, and terminal completion or failure never removes owned worktrees
- evidence or reproduction: fresh and notified runs create worktrees before `Manager.Replace` persists ownership at lines 234-242 and 358-366. Terminal handling at lines 187-195 only updates status. `RemoveDetached` exists at `internal/worktrees/ownership.go:35-40` but has no production caller.
- fix direction: reserve the run and intended path durably before creation, mark creation complete transactionally, and perform ownership-checked cleanup only after non-resumable terminal state

### CR-092 Service installation records a PATH-dependent command

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/wizard.go:43`
- failure mode: wizard setup can report success while launchd or systemd cannot find `safety-dance`, because user services do not reliably inherit the interactive shell PATH
- evidence or reproduction: the wizard passes literal `safety-dance`; `Service.Validate` checks only that the string is nonempty at `internal/daemon/service.go:36-63`, then writes it into `ProgramArguments` or `ExecStart`
- fix direction: resolve `os.Executable`, require an absolute executable file, persist that path in the service definition, and test startup definitions with a restricted PATH

### CR-093 The setup wizard does not collect or persist the planned configuration

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/wizard.go:51`
- failure mode: setup asks only for the upstream and service confirmation, leaving gate location, validation commands, and provider choices unset despite presenting the setup as complete
- evidence or reproduction: `PromptLabels` contains only `upstream` at line 86, and `Write` updates origin then initializes the gate without writing `.safety-dance.yaml` at lines 54-63
- fix direction: collect every planned setup field before writes, validate the complete model, persist repository policy transactionally, and compensate all writes in reverse order

### CR-094 Public installation docs promise an unsupported Windows archive

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `docs/safety-dance.md:7`
- failure mode: users are told that product releases include Windows even though the release matrix deliberately removed Windows because admission and mutation authorization remain unsupported
- evidence or reproduction: the guide promises Linux, macOS, and Windows; `.github/workflows/safety-dance-release.yml` now contains only Linux and macOS targets
- fix direction: remove Windows from public support claims until authenticated Windows operation and packaging are restored

### CR-095 Release archives still omit linked dependency licenses

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/THIRD_PARTY_NOTICES.md:1`
- failure mode: distributed native binaries include dependencies whose license terms are absent from the archive materials
- evidence or reproduction: the notice covers only `modernc.org/sqlite`, while `go.mod` and the compiled command include Apache-2.0 and BSD-licensed dependencies such as Cobra and transitive modules. The release test checks filenames but not extracted notice coverage.
- fix direction: generate notices from the compiled dependency graph, include every required license and notice in each archive, and test extracted archive contents

### CR-096 The identity scanner applies task-history exclusion only to retired names

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `scripts/check-safety-dance-identity.mjs:47`
- failure mode: a historical task artifact containing the imported copyright line fails aggregate CI even though the plan requires task history to be excluded, while copied permission text without that line is not detected
- evidence or reproduction: the retired-name loop skips `.agents/tasks/` at lines 29-32; the legal loop walks every file again without that exclusion at lines 52-57 and compares only lines beginning with `Copyright`
- fix direction: use one shipped-file predicate for both scans and compare the protected imported notice, with tests for task-history exclusion and partial notice copies

### CR-097 The interactive TUI never uses the terminal width

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/tui/app.go:41`
- failure mode: the live TUI always renders with width zero, so the compact and wide behavior proven by direct renderer tests is not used by the application and narrow terminals can overflow or hide required state
- evidence or reproduction: the application loop calls `Render(..., 0)`; width-aware truncation in `internal/tui/view.go:21-48` runs only for a positive width
- fix direction: read terminal dimensions for every render, feed the current width to the semantic renderer, and add application-level narrow and wide tests

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: `steps.WithRun`, response rows, imported agent execution, and `worktrees.RemoveDetached` have no production consumer for the behavior their names promise; the critical findings above require connecting or removing those paths
- dependency findings: native archives lack complete linked-dependency license materials; no additional lockfile maintenance or vulnerability finding was proven in this review

## Verdict

- decision: request_changes
- overall code-health change: the branch adds the intended product structure and passes its current checks, but production behavior still bypasses core imported owners and breaks several durable lifecycle invariants
- rationale: two critical trust-boundary findings and thirteen major correctness, recovery, platform, interface, and distribution findings remain

## Review Limits

- blocked or unavailable checks: no hosted `safety-dance-v*` release, authorized live-provider run, live service-manager operation, or pull-request CI run exists; no pull request title or body was available
- residual manual verification: after repairs, exercise a built binary through substantive validation, same-branch replacement, response resume, crash recovery around publication, real launchd/systemd startup, narrow and wide TUI rendering, and archive license inspection
