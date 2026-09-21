---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 390f7c202bca502c19d99191127683a51b2aff8d
status: findings
summary: "The complete 106-commit Safety Dance diff was reviewed through 390f7c2 against origin/main. Eight critical or major findings remain in CI candidate binding and polling, provider and PR-target routing, duplicate-run recovery, configured-root cleanup, orphan-gate rollback, and Windows service installation; the next fix round must close them before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` against `origin/main`
- reviewed HEAD: `390f7c202bca502c19d99191127683a51b2aff8d`
- commits: 106 commits in `origin/main..HEAD`; latest product fix is `758af0c fix(safety-dance): close reviewed runtime findings`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts under `.agents/tasks/` and the two untracked task-owned directories

## Previous Round

- previous artifact: `57-code-review-safety-dance.md`
- CR-155 Default runs cannot resolve the typed validation owner: fixed
- CR-156 Pull-request and CI stages can pass without SCM operations: fixed
- CR-157 Cancelling an older run can cancel its replacement: fixed
- CR-158 Partial launch failure is acknowledged as an already-started run: still open
- CR-159 Windows nested-run authorization cannot read environment markers: fixed
- CR-160 Configured worktree roots are ignored for new runs: fixed
- CR-161 Fresh-init rollback can delete a pre-existing orphan gate: fixed
- CR-162 Existing-gate rollback converts custom hook symlinks into files: fixed
- CR-163 The production wizard reads commands before showing the upstream prompt: fixed
- CR-164 The Windows scheduled-task action is malformed: still open
- CR-165 The post-receive banner still displays the retired product name: fixed
- CR-166 Typed review ignores reviewer ownership and fallback agents: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; preserve the referenced local Git gate as a fully rebranded Safety Dance system
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; latest implementation receipt `26-implementation-safety-dance.md`; latest fix receipt `58-code-review-fixes-safety-dance.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `skills/delivery/review-code/SKILL.md`

## Change Profile

- intent and expected behavior: add an independently branded Go gate with authenticated admission, durable branch runs, owned worktrees, fixed validation, candidate-bound publication, operator interfaces, skill distribution, and release packaging
- change description quality: the plan and phase receipts describe the intended invariants; no pull request exists, so no PR title or body was available to review
- implementation model and review model: implementation model is not recorded in the selected receipts; review model is GPT-5.6 Sol
- changed-line size and logical cohesion: 37,667 non-task-artifact changed lines across the Go tool, canonical skill, tests, docs, scripts, and workflows; the scope is one product import but requires separate trust-boundary review across runtime owners
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, and `internal/db/run.go` exceed 1,000 lines, increasing ownership and review cost; the concrete gate remains the functional findings below
- dependency or lockfile changes: the new Go module and `go.sum` are covered by the aggregate build, race, vet, release, license, and notice checks; no unresolved dependency finding was identified

## Tests Reviewed First

- behavior claimed by tests: the root aggregate covers 136 Node tests, the full Go race suite, vet, a temporary binary build, identity checks, and release-contract tests; focused package tests cover daemon, gate, hook, pipeline, wizard, and worktree behavior
- missing or misleading coverage: no production-path tests exercise candidate-bound CI, CI polling, non-GitHub SCM construction, PR target selection, pending duplicate-run recovery, configured-root journal recovery, orphan-gate rollback after mutation, or Windows scheduled-task arguments

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4943` in / `73` out

### Correctness

- assessment and evidence: the focused and aggregate suites pass, but production paths still accept checks from a changed PR head, fail immediately on pending CI, strand pending duplicate runs, skip configured-root recovery journals, and leave pre-existing orphan gates mutated after failed initialization (`internal/scm/github/github.go:438-475`, `internal/pipeline/steps/ci.go:25-43`, `internal/daemon/manager.go:138-164`, `internal/cli/daemon.go:359-373`, `internal/gate/gate.go:207-248`)
- helper coverage: covered, level 3, confidence 0.97

### Readability and Simplicity

- assessment and evidence: the new orchestration is direct at its call sites, but provider and lifecycle policy is reconstructed inside `internal/cli/daemon.go:466-618` instead of using the richer SCM and durable-run contracts already present; this divergence produced the candidate, provider, target, and recovery failures below
- helper coverage: covered, level 2, confidence 0.82

### Architecture

- assessment and evidence: package ownership exists for SCM hosts, worktree layout, journals, and gate snapshots, but the production daemon bypasses or incompletely composes those owners by constructing only GitHub, scanning only the default worktree root, and not restoring a snapshotted orphan gate (`internal/cli/daemon.go:359-373,525-532`, `internal/gate/gate.go:207-248`)
- helper coverage: covered, level 3, confidence 0.89

### Security

- assessment and evidence: candidate integrity is not maintained through CI because GitHub replaces the expected reviewed SHA with the live PR head before querying checks; Windows service command construction also interpolates the runtime home into `cmd /C` without metacharacter-safe quoting (`internal/scm/github/github.go:443-472`, `internal/daemon/service.go:203-204`)
- helper coverage: covered, level 2, confidence 0.66

### Performance

- assessment and evidence: no new unbounded query, loop, hot-path allocation, or blocking fan-out defect was identified in the pinned diff; CI currently performs too little work rather than polling within the configured bounded timeout (`internal/pipeline/steps/ci.go:25-43`)
- helper coverage: covered, level 3, confidence 0.81

## Verification Story

- command or inspection: `npm test`; `go test -race ./internal/cli ./internal/daemon ./internal/gate ./internal/git ./internal/pipeline/steps ./internal/wizard`; production call tracing for daemon execution, SCM checks, run recovery, worktree journals, gate rollback, and service construction
- result: both test commands passed; `npm test` reported 136 passing Node tests plus the full Safety Dance aggregate. `git diff --check origin/main...HEAD` reports trailing whitespace only in excluded task artifact `02-research-local-git-gate.md`
- manual, screenshot, or before-and-after evidence: none; hosted Windows execution, live provider behavior, and hosted release execution remain unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-167 CI can certify checks from an unreviewed replacement head

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/scm/github/github.go:443`
- failure mode: after Safety Dance publishes and reviews candidate A, another actor can move the pull request to candidate B before the CI step; the run then records CI success from B even though this run never reviewed B
- evidence or reproduction: `CI` seeds `PR.HeadSHA` from the durable run (`internal/pipeline/steps/ci.go:25`), but `GetChecks` replaces that value with the live PR head at lines 443-450 and checks that replacement at lines 451-475 without comparing it to the expected SHA
- fix direction: keep the expected reviewed candidate immutable, read the live PR head separately, fail on mismatch before querying checks, and add a regression test that force-pushes the PR between publication and CI discovery

### CR-168 CI fails instead of polling newly created checks

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/ci.go:25`
- failure mode: a newly opened pull request normally has no checks or pending checks on the first query, so the fixed pipeline fails immediately instead of waiting for the provider verdict
- evidence or reproduction: lines 26-43 call `GetPRState` and `GetChecks` once and return an error for zero, pending, or non-passing checks; `pipeline.Run` treats that error as terminal at `internal/pipeline/runner.go:177-195`, despite the planned CI polling behavior and configured timeout
- fix direction: route CI through a bounded provider monitor that polls until pass, terminal failure, cancellation, or the configured timeout, and test initial-empty, pending-to-pass, failure, timeout, and cancellation sequences

### CR-169 Non-GitHub repositories cannot complete the fixed pipeline

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:525`
- failure mode: GitLab, Bitbucket, Azure DevOps, Forgejo, Gitea, and unknown/local repositories reach the pull-request step with no SCM owner and fail every run
- evidence or reproduction: production constructs `scmHost` only for `ProviderGitHub` at lines 525-532, while PR and CI reject nil owners (`internal/pipeline/steps/pr.go:9-14`, `internal/pipeline/steps/ci.go:9-14`); provider detection and configuration expose the other supported providers (`internal/scm/scm.go:22-31`, `internal/config/config.go:710-749`)
- fix direction: construct the selected concrete host for every supported provider through one SCM factory, fail unsupported providers during setup rather than after validation and publication, and add provider-fixture tests for each advertised provider

### CR-170 Pull-request creation ignores the configured target branch

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/pr.go:32`
- failure mode: a repository configured to merge into a non-default integration branch finds or creates a pull request against the default branch instead, so CI and completion refer to the wrong integration target
- evidence or reproduction: merged configuration preserves `PR.BaseBranch` at `internal/config/config.go:3059-3063` and durable runs carry `PRBaseBranch` at `internal/db/run.go:82-85`, but lines 32-37 always pass `repo.DefaultBranch` to `FindPR` and `CreatePR`
- fix direction: resolve the target in precedence order from the durable run override, merged repository policy, then repository default; persist the chosen target and test both existing-PR and create-PR paths

### CR-171 Pending duplicate runs execute without becoming running

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/manager.go:138`
- failure mode: retrying a notification for a row left pending by a partial launch starts its executor, but successful completion cannot transition `pending` to `completed`; the row remains pending, its worktree is not cleaned, and later retries execute it again
- evidence or reproduction: `recordPush` resumes every nonce match at `internal/cli/daemon.go:416-424`; `Resume` registers the row without validating or transitioning its status at lines 138-164; completion only compares `running` to `completed` at `internal/cli/daemon.go:203-204`
- fix direction: make resume accept only pending or running rows, compare-and-set pending to running before registration, treat terminal matches as completed receipts, and test crash recovery from each status

### CR-172 Startup recovery ignores configured worktree roots

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:359`
- failure mode: after a crash before run persistence or during cleanup, worktrees placed under a configured root retain pending or removing journals and stale Git worktree registrations indefinitely
- evidence or reproduction: creation and removal journals are adjacent to each worktree (`internal/worktrees/ownership.go:15-16,27-33,73-75`), but startup scans only `<SD_HOME>/worktrees` at lines 369-373 even though new runs can use arbitrary validated roots
- fix direction: derive every active configured root through `worktrees.Layout`, scan each unique root plus the default root while honoring protected paths, and add crash-recovery tests under a custom root

### CR-173 Failed fresh initialization leaves a pre-existing orphan gate mutated

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/gate/gate.go:207`
- failure mode: when the deterministic gate directory exists without a database row, a failed initialization preserves the directory but leaves changed Git config, hooks, stamp, or origin values behind
- evidence or reproduction: the code snapshots the gate at line 209, but both failure branches for `existing == nil` only avoid `RemoveAll` when `bareExisted` is true and never call `gateBefore.restore()` (`internal/gate/gate.go:210-219,241-248`); provisioning mutates configuration, hooks, the stamp, origin, and working remote at lines 270-303
- fix direction: restore the snapshot whenever the gate existed before the attempt, regardless of database ownership, and add injected failures after each provisioning mutation for a pre-existing orphan gate

### CR-174 Windows scheduled-task installation remains malformed

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/service.go:39`
- failure mode: ordinary absolute Windows homes produce a task label containing a drive colon, which Task Scheduler rejects; homes containing command metacharacters also break or alter the `/TR` command
- evidence or reproduction: `Label` replaces slashes, backslashes, and dots but leaves `:` at lines 39-40, then passes the label to `schtasks /TN` at lines 203-204; the same action interpolates `SD_HOME` into an unquoted `set SD_HOME=%s` command. Current tests do not execute or assert Windows arguments, and the recorded proof only cross-compiles
- fix direction: generate a Task Scheduler-safe stable label, construct `cmd` environment assignments with Windows-safe quoting or avoid `cmd /C`, and test exact `/TN` and `/TR` arguments for spaces, colons, percent signs, ampersands, and quotes

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none identified; the custody owner is now used by the daemon manager
- dependency findings: no new unresolved maintenance, license, lockfile, or security finding was identified by the available checks

## Verdict

- decision: request_changes
- overall code-health change: Safety Dance adds the intended module boundaries and broad automated coverage, but production orchestration still bypasses candidate, provider, recovery, rollback, and Windows invariants those packages describe
- rationale: one critical integrity defect and seven major functional, durability, or platform defects remain in ordinary or supported production paths

## Review Limits

- blocked or unavailable checks: live provider-backed PR and CI behavior, hosted Windows service and hook execution, and hosted `safety-dance-v*` release execution were unavailable
- residual manual verification: run the repaired pipeline against an authorized provider, execute installation and recovery on Windows, and inspect the first hosted release after the findings are fixed
