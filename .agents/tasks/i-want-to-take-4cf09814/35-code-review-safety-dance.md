---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: bf6f8f49890d86f1efdd11b991827bbf7ed96a83
status: findings
summary: "Review of the 69-commit Safety Dance change found that ordinary runs still publish after only repeated whitespace checks, and any local IPC client can mint admission tokens because the daemon never verifies hook ancestry. Accepted updates can still be lost after notification failure, and the TUI silently approves blocked test or CI gates; the next fix round must close these four trust-boundary failures."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `bf6f8f49890d86f1efdd11b991827bbf7ed96a83`
- commits: 69 commits on `safety-dance` after `origin/main`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts under `.agents/tasks/i-want-to-take-4cf09814/`, including the two untracked directories

## Previous Round

- previous artifact: `33-code-review-safety-dance.md`
- CR-034 Validation stages approve candidates without performing their named checks: still open
- CR-035 Token authorization checks the daemon process instead of the hook caller: still open
- CR-036 Cancellation can reactivate push ownership and publish a cancelled run: fixed
- CR-037 Admission receipt delivery is neither retryable nor single-consumer: still open
- CR-038 CLI daemon stop does not own service-started daemons: fixed
- CR-039 Wizard service repair overwrites pre-existing definitions without rollback: fixed
- CR-040 The operator interface cannot show or answer durable prompts: still open
- CR-041 Nested validation children can stop or restart the parent daemon: fixed
- CR-042 Runtime state is world-readable on Unix: fixed
- CR-043 Multi-document YAML bypasses strict configuration validation: fixed
- CR-044 Post-receive hook repair can disable a preserved user hook: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently branded import of the referenced local Git gate
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`, with the latest implementation receipt at `26-implementation-safety-dance.md` and fix receipt at `34-code-review-fixes-safety-dance.md`
- repository instructions: root `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add a branded local Git gate with authenticated admission, durable branch-scoped validation, guarded publication, operator controls, runtime distribution, identity checks, and native release packaging
- change description quality: the commit subjects pass the repository checker; no pull request exists, so there is no title or body to review
- implementation model and review model: the selected implementation artifact does not record its model; review model is GPT-5.6 Sol with focused specialist review passes
- changed-line size and logical cohesion: 35,323 additions and 4 deletions across 206 non-task files; the work spans one product but is too large for a single ordinary review unit
- resulting large-file concerns: `internal/config/config.go` has 3,136 lines, `internal/scm/github/github.go` has 1,487 lines, and `internal/agent/agent.go` has 1,353 lines; this raises maintenance cost but is not a separate release blocker
- dependency or lockfile changes: a new Go module and `go.sum` are present; this review did not run a vulnerability or license scanner, and the imported MIT notice is retained at `tools/safety-dance/LICENSE`

## Tests Reviewed First

- behavior claimed by tests: gate initialization and hooks, authenticated IPC, branch replacement and recovery, guarded publication, service and wizard rollback, CLI and TUI rendering, installer adaptation, identity scanning, and release packaging
- missing or misleading coverage: no test proves an ordinary daemon run invokes configured agent, test, documentation, lint, pull-request, and CI owners; no test rejects a same-user non-hook token request; no test proves stored admission receipts replay after callback or startup failure; no TUI test prevents `r` from approving a failed gate without an explicit action

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4065` in / `73` out

`judge: model jev-1.13.0, tokens 4065 in / 73 out`
### Correctness

- assessment and evidence: the publication and cancellation compare-and-set now rejects cancelled runs, but ordinary validation remains a repeated `git diff --check` and persisted admission receipts have no replay path. The focused race suite passed, but it does not exercise those missing behaviors.
- helper coverage: covered, level 3, confidence 0.93

### Readability and Simplicity

- assessment and evidence: the fixed pipeline is easy to trace from `executeRun`, but every named stage delegates to one generic validator whose name overstates its behavior. `internal/tui/app.go` also fails `gofmt`, which obscures its one-line input switch.
- helper coverage: covered, level 3, confidence 0.57

### Architecture

- assessment and evidence: the repository imports agent, configuration, SCM, and evidence owners, but the daemon entry point bypasses them. Admission persistence owns storage but not recovery, leaving no component responsible for turning a stored accepted update into a run.
- helper coverage: covered, level 3, confidence 0.78

### Security

- assessment and evidence: token issuance authenticates that a local process exists but never proves it descends from the managed receive hook. Its `SD_PARENT_RUN_ID` check reads the daemon's environment rather than the IPC caller's environment, so validation children and other local clients can reach the minting endpoint.
- helper coverage: covered, level 2, confidence 0.52

### Performance

- assessment and evidence: no new blocking performance defect was found. Receipt notification serializes delivery while the callback creates a durable run, which bounds duplicate consumption at the cost of serial admission; branch execution remains coordinated by branch key.
- helper coverage: covered, level 3, confidence 0.50

## Verification Story

- command or inspection: latest verification artifact; `npm run check-commits -- origin/main..HEAD`; `go test -race ./internal/daemon ./internal/cli ./internal/pipeline/... ./internal/db ./internal/git ./internal/config ./internal/tui`; `gofmt -l ./internal ./cmd`; direct tracing of daemon, admission, hook, pipeline, DB, and TUI callers
- result: commit check passed for 69 subjects; focused race tests passed; `gofmt` reported `internal/tui/app.go`; direct tracing confirmed the four findings below
- manual, screenshot, or before-and-after evidence: verification at revision `49c6c2d` records the built-binary operator flow and local aggregate passes; no hosted release, Windows service-manager, or live-provider evidence exists

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-045 Ordinary runs publish without executing the named validation gates

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:353`
- failure mode: an ordinary accepted push can reach publication without running configured intent, agent review, tests, documentation, lint, pull-request creation, or CI checks
- evidence or reproduction: `executeRun` registers every named core step at lines 353-377, while each implementation in `internal/pipeline/steps/{intent,rebase,review,test,document,lint,pr,ci}.go` calls `Validate`; `Validate` only runs `git -C <worktree> diff --check` at `internal/pipeline/steps/validation.go:24-36`. The imported configuration, agent, and SCM owners are not called from this path.
- fix direction: make the daemon load the trusted repository configuration and connect each fixed stage to its real owner. Add an ordinary-run end-to-end test in which each configured gate fails in turn and proves publication does not occur.

### CR-046 Any local IPC client can mint a managed-hook admission token

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:84`
- failure mode: a validation child or other process with local socket access can mint a gate/ref token, call admission and notification directly, and start publication work without proving that Git's managed receive hook invoked it
- evidence or reproduction: `issue` accepts any positive authenticated peer PID at lines 84-102. It never calls the available process-ancestry inspector. The only nested-run check reads `os.Getenv("SD_PARENT_RUN_ID")` from the long-lived daemon process, not from the client. The hidden CLI command at `internal/cli/daemon.go:66-76` exposes the endpoint to any local caller.
- fix direction: verify the authenticated peer PID's ancestry and managed-hook identity on the server before issuing a token. Bind that proof to the request, fail closed on unsupported platforms, and add tests for managed-hook acceptance plus arbitrary same-user and validation-child rejection.

### CR-047 Accepted updates still have no durable delivery recovery

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/admission.go:67`
- failure mode: a corrupted receipt store or a transient failure while creating the durable run can leave an already accepted gate ref with no run, even after daemon restart
- evidence or reproduction: `newAdmission` ignores `loadReceipts` errors at lines 67-75, so the daemon reports health with an empty in-memory receipt set. A callback failure at lines 154-157 retains the receipt, but startup only reloads the map and never retries or reconciles it. The post-receive hook logs its one asynchronous notification failure and exits at `internal/git/hook.go:99-107`.
- fix direction: return receipt-load errors to daemon startup, then add an idempotent reconciliation worker that retries stored accepted receipts until durable run creation succeeds. Delete a receipt only after that durable transition and test restart after callback failure.

### CR-048 The TUI response key silently approves blocked gates

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/tui.go:72`
- failure mode: pressing `r` on any durable prompt submits `approve`, including failed test or CI gates where approval records an explicit waiver, without asking which action the operator intends
- evidence or reproduction: the interactive loop labels `r` as `respond` at `internal/tui/app.go:22-44`, but the callback always sends `types.ActionApprove` at `internal/cli/tui.go:72-78`. The action vocabulary also includes `fix`, `skip`, and `abort` at `internal/types/types.go:273-277`; no app or CLI test covers action selection or confirmation.
- fix direction: prompt for and validate an explicit action, show the gate evidence before approval or skip, and require confirmation for waiver actions. Add TUI tests proving `r` alone cannot approve a failed gate.

## Advisories

### ADV-001 TUI source is not formatted

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `tools/safety-dance/internal/tui/app.go:25`
- evidence: `gofmt -l ./internal ./cmd` reports `internal/tui/app.go`; the whole interactive loop uses compressed one-line statements
- suggestion: run `gofmt` on the file after the behavior fix

## Dead Code and Dependency Review

- newly orphaned code: the imported agent, configuration, SCM, and evidence packages are reachable in other imported paths, but the shipped ordinary daemon pipeline does not use them for its named gates; CR-045 covers the resulting behavior rather than declaring the packages dead
- dependency findings: no duplicate module or lockfile churn was found; vulnerability, maintenance, and transitive-license scans were not run

## Verdict

- decision: request_changes
- overall code-health change: the latest fix closes cancellation, service-stop, rollback, nested lifecycle, permissions, and YAML boundaries, but four release-blocking paths remain
- rationale: two critical trust-boundary failures permit unvalidated or unauthorized publication work, and two major failures can lose accepted updates or approve blocked gates without an explicit operator decision

## Review Limits

- blocked or unavailable checks: no dependency vulnerability scan, hosted product release, Windows service-manager execution, live provider run, or pull-request title/body was available
- residual manual verification: run hosted release and provider checks after the local trust-boundary findings are fixed; test service lifecycle on Windows before claiming cross-platform readiness
