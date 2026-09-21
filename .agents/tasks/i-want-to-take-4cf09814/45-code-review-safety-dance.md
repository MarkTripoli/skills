---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 64fab47b4d648c1ec03af85aa7358f01a12de4d6
status: findings
summary: "The complete 85-commit Safety Dance diff was reviewed at 64fab47 against origin/main. Aggregate tests pass, but the setup wizard writes an invalid configuration, explicit runs and same-branch replacement cancel incorrectly, validation and response owners remain disconnected, and publication, ancestry authorization, worktree cleanup, platform, TUI, and dependency-notice boundaries retain critical or major defects. The next fix round must repair these production paths and add regression tests before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `64fab47b4d648c1ec03af85aa7358f01a12de4d6`
- commits: 85 commits in `origin/main..HEAD`; commit subjects pass `npm run check-commits -- origin/main..HEAD`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: every `.agents/tasks/` artifact and the two untracked task paths

## Previous Round

- previous artifact: `43-code-review-safety-dance.md`
- CR-083 Production still self-certifies the fixed pipeline: fixed
- CR-084 Nested validation descendants can mutate the daemon: still open
- CR-085 Same-branch replacement fails after cancelling the active runner: still open
- CR-086 Respond persists decisions that no runner consumes: still open
- CR-087 Publication does not compare the final worktree HEAD with review evidence: fixed
- CR-088 Production never selects explicit-lease publication: still open
- CR-089 A daemon crash leaves publication permanently unclaimable: still open
- CR-090 Restart rejects worktrees advanced by completed steps: fixed
- CR-091 Worktree ownership and cleanup do not bracket filesystem creation: still open
- CR-092 Service installation records a PATH-dependent command: fixed
- CR-093 The setup wizard does not collect or persist the planned configuration: still open
- CR-094 Public installation docs promise an unsupported Windows archive: fixed
- CR-095 Release archives still omit linked dependency licenses: still open
- CR-096 The identity scanner applies task-history exclusion only to retired names: fixed
- CR-097 The interactive TUI never uses the terminal width: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced behavior under the independent Safety Dance identity without repository references
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and changed-file conventions enforced by `scripts/validate.mjs`

## Change Profile

- intent and expected behavior: add an authenticated local Git gate, durable branch runs, fixed validation and guarded publication, operator interfaces, a canonical non-worker skill, and native releases
- change description quality: 85 focused Conventional Commit subjects pass the repository checker; no pull request or pull-request title exists, so behavior, motivation, limits, and title quality cannot be reviewed from a PR description
- implementation model and review model: implementation model not recorded; review model `GPT-5.6 Sol`
- changed-line size and logical cohesion: 213 product files, 36,155 additions, and 4 deletions; the task is one product import, but the diff is too large for one review unit and still leaves several imported owners disconnected from production
- resulting large-file concerns: `internal/config/config.go` is 3,140 lines, `internal/scm/github/github.go` is 1,487 lines, `internal/agent/agent.go` is 1,353 lines, and `internal/db/run.go` is 1,122 lines; ownership is difficult to verify and production uses only a small shell-command runner around these packages
- dependency or lockfile changes: a new 67-module Go graph and `go.sum` were added; the built command uses 15 third-party modules, while the release notice names only 10 of them and packages no upstream license text

## Tests Reviewed First

- behavior claimed by tests: authenticated hook admission, branch replacement and overlap, durable steps, guarded publication, wizard callback compensation, TUI rendering, runtime installation, identity scanning, and release archive naming
- missing or misleading coverage: no production test covers managed-hook token issuance, nested descendant rejection, explicit-run lifetime after IPC disconnect, the production terminal callback during supersession, crash-stale `push_active`, generated wizard configuration parsing and preservation, parked response action semantics, a dirty worktree after review, macOS terminal-width discovery, Windows mutation support, or complete dependency notices

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `6310` in / `73` out

### Correctness

- assessment and evidence: `npm test` passes, but production lifecycle traces contradict required behavior. The wizard emits keys rejected by the strict loader, CLI-started work inherits a short-lived IPC context, replacement rejects the cancelled status produced by the runner, response actions do not preserve their semantics, and initial publication treats the gate's old SHA as an upstream rewrite lease.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: the current change adds 36,155 product lines and several files above 1,000 lines. The public execution path is split between a small `pipeline.Runner`, large imported agent and provider owners, and required shell commands, so names such as review, pull-request, and CI do not reveal which implementation actually runs.
- helper coverage: covered, level 2, confidence 0.50

### Architecture

- assessment and evidence: gate, daemon, database, pipeline, worktree, service, and release packages have distinct owners, but production does not route typed agent, pull-request, and CI behavior through those owners. Wizard output also bypasses the repository configuration schema rather than using the config owner.
- helper coverage: covered, level 3, confidence 0.82

### Security

- assessment and evidence: local IPC authenticates the operating-system peer, but mutation and token authorization trust command-line substrings and stop ancestry inspection early. A validation descendant can invoke or impersonate a `safety-dance` command after removing its direct marker, and Darwin environment inspection does not establish the full ancestry policy.
- helper coverage: covered, level 3, confidence 0.81

### Performance

- assessment and evidence: no unbounded remote query or hot-path allocation regression was found. Daemon polling uses bounded 100 ms and 250 ms intervals, and publication performs a bounded sequence of remote-head checks; the material problems are correctness and lifecycle ownership rather than throughput.
- helper coverage: covered, level 3, confidence 0.85

## Verification Story

- command or inspection: `npm test`; `git diff --check origin/main...HEAD -- . ':(exclude).agents/tasks/**'`; `go list -deps -f '{{with .Module}}{{.Path}} {{.Version}}{{end}}' ./cmd/safety-dance`; targeted caller and test inspection
- result: `npm test` exited 0 with 136 Node tests, Go race tests, vet, a temporary binary build, identity checks, and 2 release tests; the product diff check passed; the built command resolved 15 third-party modules and 5 were absent from `THIRD_PARTY_NOTICES.md`
- manual, screenshot, or before-and-after evidence: none; no hosted release, live provider, macOS terminal, or Windows environment was available

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-098 Nested descendants can bypass mutation authorization

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:121-145,176-199`
- failure mode: a validation descendant can remove `SD_PARENT_RUN_ID` from the direct CLI process or spoof hook and binary names in its command line, then issue tokens or mutate, respond to, or cancel its parent run
- evidence or reproduction: `AuthorizeMutationPeer` returns at the first command containing `safety-dance` instead of scanning every ancestor and matching an exact executable; `managedHookPeer` accepts command text containing the gate path and a hook suffix; Darwin reads `ps ... command=` rather than a verified per-process environment; no executable ancestry test covers this boundary
- fix direction: authenticate the exact managed hook or CLI executable, inspect the complete ancestry before granting authority, use supported OS-native ancestry and environment APIs, and add Linux and Darwin executable tests that attempt marker stripping and argv spoofing

### CR-099 The wizard writes configuration that the daemon rejects

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/wizard.go:64-109`
- failure mode: setup reports success after writing top-level `gate` and `provider` keys, but the next daemon pipeline load rejects both as unknown; the wizard also omits all required validation commands
- evidence or reproduction: `config.parseRepoConfig` accepts neither key and enables strict known-field decoding at `tools/safety-dance/internal/config/config.go:2353-2371`; production requires a nonempty command for every validation stage at `tools/safety-dance/internal/pipeline/steps/validation.go:47-67`; wizard tests cover callback order but never parse the generated file
- fix direction: write the canonical `RepoConfig` shape through the config owner, collect the planned validation and provider settings, parse before commit, and add a wizard-to-daemon production test

### CR-100 Wizard rollback destroys an existing repository configuration

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/wizard.go:64-105`
- failure mode: the wizard overwrites an existing `.safety-dance.yaml`; when gate or service setup fails, compensation leaves the overwritten file because it removes the file only when none existed before
- evidence or reproduction: the code records only `configExisted`, not the original bytes or mode, then always calls `os.WriteFile`; the compensation branch at lines 93-95 has no restore path for an existing file
- fix direction: journal the original file bytes and permissions, restore them on every later failure, and prove successful idempotent reruns and failed reruns preserve pre-existing content

### CR-101 Explicit runs are cancelled when their IPC request ends

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:221-251`
- failure mode: `safety-dance run` returns a receipt and closes its IPC connection, which cancels the run context and causes the new terminal callback to mark the run cancelled and remove its worktree
- evidence or reproduction: `Manager.Replace` derives the run context from the handler context at `tools/safety-dance/internal/daemon/manager.go:88-95`; `handleConn` cancels that context when the handler connection exits at `tools/safety-dance/internal/ipc/server.go:152-171`; `callDaemon` closes immediately after `Call` at `tools/safety-dance/internal/cli/runtime.go:32-42`
- fix direction: derive durable run contexts from daemon lifetime, not request lifetime, and add a built-client test that closes the start request then observes the run reaching a real terminal state

### CR-102 Same-branch replacement still rejects its cancelled predecessor

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/manager.go:62-78`
- failure mode: replacement cancels and joins the active runner, the production wrapper persists `cancelled`, then `SupersedeRun` rejects that status; the newer accepted update is not assigned after the older run has already stopped
- evidence or reproduction: the wrapper maps `ctx.Err()` to `RunCancelled` at `tools/safety-dance/internal/cli/daemon.go:185-197`, but `SupersedeRun` accepts only pending, running, or failed at `tools/safety-dance/internal/db/runs.go:97-109`; the same-branch test does not use the production wrapper
- fix direction: make replacement one durable compare-and-set that accepts its own cancellation result, and test two accepted pushes through the production manager and terminal callback

### CR-103 Response resumption cannot preserve operator intent

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/runner.go:83-113`
- failure mode: `fix` is completed as approval, resumed review approval bypasses the callback that records the approved head, and production never parks a step, so the public `respond` command has no complete lifecycle
- evidence or reproduction: every non-abort and non-skip response calls `CompleteStep`; the review callback that writes `ReviewApprovedHeadSHA` runs only during fresh execution at `tools/safety-dance/internal/cli/daemon.go:467-480`; no product caller invokes `ParkStepForApproval`; runner tests cover only completed-step skipping
- fix direction: connect the production gate owner, persist and recover each action's distinct transition, rerun fixes, record review evidence on approval, and test approve, fix, skip, abort, and restart through IPC

### CR-104 Initial and fast-forward publications are treated as rewrites

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:355-370,423-435`
- failure mode: a new branch records Git's all-zero old gate SHA as the verified upstream head, enables rewrite because the string is nonempty, and then fails because an absent upstream ref cannot equal that SHA; ordinary fast-forwards also use force-with-lease instead of a normal push
- evidence or reproduction: `PreviousReconciledHead` comes from `PushNotification.Old`, not a freshly verified upstream ref; `Rewrite` is set whenever `run.BaseSHA != ""`; `Push` rejects any live head unequal to the supplied value at `tools/safety-dance/internal/pipeline/steps/push.go:34-49`
- fix direction: persist the last verified upstream head separately from the gate's old ref, normalize zero SHAs to absent, determine fast-forward versus approved rewrite from the live graph, and test first publication plus ordinary fast-forward publication through production

### CR-105 Crash-stale publication ownership is reclaimed without reconciliation

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/push.go:89-130`
- failure mode: after a daemon crash, restart clears any durable `push_active` claim before proving whether the old Git process, upstream ref, or gate mirror completed; a second publication can race or bind state it did not own
- evidence or reproduction: lines 102-108 unconditionally clear the claim; startup resumes recoverable runs immediately; the recovery test returns an error in-process, so deferred cleanup clears `push_active` and never simulates process death
- fix direction: persist publication phases, reconcile the target fingerprint, live upstream, candidate, and gate mirror before reclaiming, and add crash points before push, after remote write, after mirror update, and before binding

### CR-106 Terminal cleanup can delete a recoverable run's worktree

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:185-202`
- failure mode: failed status updates are ignored and the owned worktree is removed anyway, leaving a pending or running durable record with no worktree to resume
- evidence or reproduction: both `UpdateRunErrorStatus` and fallback terminal transitions discard their errors, then cleanup executes unconditionally; existing recovery tests recreate a missing worktree but do not prove cleanup waits for a persisted non-recoverable state
- fix direction: persist and confirm terminal ownership before deletion, surface persistence failures, and leave the worktree intact whenever the durable record remains recoverable

### CR-107 Post-review worktree changes are silently omitted from publication

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:437-498`
- failure mode: test, document, or lint commands can modify tracked files after review without committing; publication verifies only `rev-parse HEAD`, pushes the reviewed commit, and silently leaves those changes out while cleanup deletes the worktree
- evidence or reproduction: validation ends with `git diff --check`, which does not require a clean worktree, at `tools/safety-dance/internal/pipeline/steps/validation.go:68-78`; `push_active` is acquired only later inside `Publish`, despite the plan requiring ownership before formatting and reconciliation
- fix direction: acquire publication ownership before modifying publication preparation, either commit and revalidate allowed changes or reject a dirty worktree, and test a format command that changes a tracked file after review

### CR-108 Release archives omit compiled dependency notices

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/THIRD_PARTY_NOTICES.md:1-31`
- failure mode: published archives claim to identify every compiled module but omit modules and include no required upstream license or notice text
- evidence or reproduction: `go list -deps` for `./cmd/safety-dance` found 15 third-party modules; the manifest omits `github.com/charmbracelet/x/term`, `github.com/dustin/go-humanize`, `github.com/google/uuid`, `github.com/ncruces/go-strftime`, and `github.com/remyoudompheng/bigfft`; `package-release.sh` copies only this hand-written manifest and the project license
- fix direction: generate notices from the exact built module graph, include every required license and notice text in each archive, and make release tests extract the archive and compare notice coverage with `go list -deps`

### CR-109 The production pipeline does not use the imported validation owners

- type: Refactor suggestion
- severity: major
- category: Maintainability and code quality
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:47-78`
- failure mode: intent, rebase, review, pull-request, and CI are eight required shell strings rather than the typed agent and provider implementations in the imported packages; a repository without hand-authored commands cannot run, and those names do not guarantee the behavior the fixed pipeline promises
- evidence or reproduction: every non-push stage calls the same `sh -c` helper; the plan requires typed agent output, safe reconciliation, provider PR creation, and CI polling; the wizard and public configuration docs expose none of the required command contract
- fix direction: route each named stage to its responsible typed owner, retain shell commands only for the configured test, format, and lint hooks they actually represent, and add production-path behavior tests rather than name-only step tests

### CR-110 macOS never receives responsive TUI width

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/tui/app.go:25-43`
- failure mode: supported macOS releases call GNU-only `stty -F /dev/tty`; the command fails, width becomes zero, and compact or wide rendering is never selected
- evidence or reproduction: BSD/macOS `stty` uses `-f`, and the function ignores the `*os.File` it already obtained; tests inject a width but never exercise native width discovery
- fix direction: use an OS terminal-size API on the actual output descriptor and add Darwin plus redirected-output tests through `App.Run`

### CR-111 Windows behavior required by the plan is absent

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/admission.go:123-126,176-181`
- failure mode: Windows can neither issue managed-hook tokens nor invoke mutating daemon methods, and the release matrix omits Windows rather than implementing the planned platform
- evidence or reproduction: both authorization paths reject Windows unconditionally; `.github/workflows/safety-dance-release.yml:11-17` contains only Linux and macOS while the approved plan requires Windows service and archive behavior
- fix direction: implement authenticated Windows local transport and ancestry or narrow the approved requirements through a revised plan before release; restore Windows packaging only after production-path tests pass

## Advisories

### ADV-001 Release tests assert names rather than archive contents

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `tests/safety-dance-release.test.mjs:19-27`
- evidence: the test checks one tarball filename and a matching checksum line, but never extracts the archive, verifies the executable name, recomputes the checksum, or checks bundled notices
- suggestion: inspect archive contents and verify checksums and generated notice coverage for every supported format

## Dead Code and Dependency Review

- newly orphaned code: no package is unreachable from the built command, but the production pipeline bypasses the substantive typed agent and provider behavior linked through `internal/agent` and `internal/scm`; CR-109 records that architectural orphaning
- dependency findings: the Go graph is pinned in `go.sum` and aggregate build and race checks pass; release license coverage is incomplete under CR-108, and no live vulnerability or license audit was available

## Verdict

- decision: request_changes
- overall code-health change: the branch adds a separately branded product with passing aggregate checks, but its production setup, run lifecycle, trust boundary, publication recovery, and platform contracts remain unsafe or incomplete
- rationale: two critical findings and twelve major functional, durability, distribution, and platform findings block approval despite green tests

## Review Limits

- blocked or unavailable checks: no pull request description or title, hosted GitHub release, authorized live provider, macOS terminal, Windows host, live launchd/systemd/Task Scheduler run, vulnerability audit, or generated third-party notice audit
- residual manual verification: after fixes, repeat built-binary wizard, explicit run, same-branch push, crash-point publication, macOS TUI, platform service, archive extraction, checksum, and notice checks
