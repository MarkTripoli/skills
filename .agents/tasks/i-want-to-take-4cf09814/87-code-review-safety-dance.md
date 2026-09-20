---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: e7acdd890fa4088f7254ba24f1ac53f59b07c35e
status: findings
summary: "The complete Safety Dance change was reviewed against origin/main at e7acdd8, with product code through 4034020. Three major trust and durability findings remain: custom gates and operator-approved reviews still bypass atomic checkpoint completion, and trusted policy can come from a different remote than the publication target. The next phase must close these paths and add crash-boundary and remote-identity regressions before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `e7acdd890fa4088f7254ba24f1ac53f59b07c35e`; product code is unchanged after `40340205d4360b93a5a84d6e08431387d5367b73`.
- commits: 156 commits after the merge base; 231 product files, 39,588 additions, and 4 deletions outside `.agents/tasks/`.
- staged and unstaged changes: None.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: All `.agents/tasks/` artifacts and the two untracked task evidence directories. No pull request exists for `safety-dance`, so `origin/main` is the repository default and review base.

## Previous Round

- previous artifact: `85-code-review-safety-dance.md`
- CR-303 Step completion and resulting HEAD remain non-atomic: still open
- CR-304 Final rewrite selection cannot affect the copied push request: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced local Git gate under the independent Safety Dance identity without product references to the source repository.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; the plan requires durable step results, restart-safe worktree custody, trusted policy, reviewed-head continuity, and guarded publication.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`.

## Change Profile

- intent and expected behavior: Add the Safety Dance Go tool, authenticated local gate, durable branch runs, fixed validation and publication pipeline, CLI/TUI/service operations, canonical skill distribution, identity checks, and native release contract.
- change description quality: No pull request description exists. Commit subjects pass the repository checker; the latest product commit and fix artifact identify the atomic checkpoint and lease-selection intent, tests, and deferred hosted evidence.
- implementation model and review model: implementation attribution is mixed across the 156 task commits; the latest product commit is by Mark Tripoli. Review model: GPT-5.6 Sol, with focused independent implementation-reviewer passes.
- changed-line size and logical cohesion: 39,588 product additions across 231 files form one new tool and its distribution contract, but the scope is too large for one ordinary review and has required repeated trust-boundary rounds.
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines; `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/db/run.go`, and `internal/cli/daemon.go` are each near or above 1,000 lines. The findings below target ownership errors rather than file length alone.
- dependency or lockfile changes: `tools/safety-dance/go.mod` and `go.sum` add pinned Go dependencies; `THIRD_PARTY_NOTICES.md` and the release tests cover packaged notices. No dependency changed in the latest fix commit.

## Tests Reviewed First

- behavior claimed by tests: `runner_test.go` covers a normal core step checkpoint and completed-step reuse; `push_test.go` covers callback-selected lease mode; end-to-end and aggregate suites cover local publication, restart, identity, release packaging, and runtime distribution.
- missing or misleading coverage: No test completes a custom gate that changes HEAD and then recovers from the durable run checkpoint. No test interrupts response consumption, review approval, and parked-step completion. No test changes the working checkout's `origin` while the persisted publication URL remains fixed.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4355` in / `73` out

### Correctness

- assessment and evidence: The latest core-step transaction closes the normal CR-303 path, and the rewrite callback now runs before Git arguments are built. Custom gates omit checkpoint registration at `tools/safety-dance/internal/cli/daemon.go:834-849`, while recovery reconstructs from persisted `run.HeadSHA` at `tools/safety-dance/internal/cli/daemon.go:720`; CR-305 records the resulting restart loss. The response path records approval and consumes the response outside step completion at `tools/safety-dance/internal/cli/daemon.go:380-390` and `tools/safety-dance/internal/pipeline/runner.go:156-175`; CR-306 records the split transition.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: Step execution and durable completion are centralized in `pipeline.Runner`, but callers must separately remember checkpoint registration. That split caused the custom-gate omission. The mutable `BeforePush(*PushRequest)` callback also grants more authority than the production caller needs; ADV-001 recommends narrowing or revalidating it.
- helper coverage: covered, level 2, confidence 0.71

### Architecture

- assessment and evidence: Durable completion belongs to the runner/database transaction, yet custom gates and parked responses bypass it. Trusted-policy fetches also use mutable working-copy remote configuration while publication uses the persisted repository record, so one run can cross two repository identities.
- helper coverage: covered, level 3, confidence 0.83

### Security

- assessment and evidence: `pinGatesForAdmission` and `executeRun` fetch trusted policy through `repo.WorkingPath` remote `origin` at `tools/safety-dance/internal/cli/daemon.go:507` and `tools/safety-dance/internal/cli/daemon.go:735`. Publication uses `repo.PushURL()` at `tools/safety-dance/internal/cli/daemon.go:814`; CR-307 records how a changed working remote makes policy validation and publication disagree.
- helper coverage: covered, level 2, confidence 0.57

### Performance

- assessment and evidence: The changed runner queries at most the bounded core plus custom-gate step set, and publication performs bounded local Git and SQLite work. The reviewed diff showed no critical or major unbounded loop, N+1 remote call, blocking leak, or hot-path allocation regression.
- helper coverage: unavailable

## Verification Story

- command or inspection: `go test -race ./internal/pipeline ./internal/pipeline/steps ./internal/db ./internal/cli ./internal/e2e`
- result: Passed.
- command or inspection: `npm test`
- result: Passed; 137 Node tests, the full Go race suite, vet, temporary build, identity scan, and three release-contract tests completed successfully.
- command or inspection: `git diff --check origin/main...HEAD -- . ':(exclude).agents/tasks/**'` and `npm run check-commits -- origin/main..HEAD`
- result: The product diff check passed and all 156 commit subjects passed. An unscoped diff check reports pre-existing trailing spaces in the excluded research artifact.
- manual, screenshot, or before-and-after evidence: No new manual UI evidence was required for the latest database and publication fix. Hosted release, live-provider, and hosted Windows lifecycle evidence remain deferred.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-305 Custom gates still complete without an atomic HEAD checkpoint

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:834-849`
- failure mode: A successful custom gate can change or check out a commit, become durably completed, and leave `runs.head_sha` at the prior commit. If the daemon then restarts with a missing or reconstructed worktree, recovery restores the stale head and skips the completed gate, losing the gate's output or validating a different candidate.
- evidence or reproduction: Core steps receive `RegisterWithCheckpoint` at `tools/safety-dance/internal/cli/daemon.go:884-890`, but custom gates do not. The runner therefore calls `CompleteStepWithRunHead` with an empty checkpoint at `tools/safety-dance/internal/pipeline/runner.go:195-209`; the database skips the run update when `headSHA` is empty at `tools/safety-dance/internal/db/step.go:425-433`. Recovery uses persisted `run.HeadSHA` at `tools/safety-dance/internal/cli/daemon.go:720`, and the completed gate is reusable at `tools/safety-dance/internal/pipeline/runner.go:141-143`.
- fix direction: Make checkpoint capture part of registering every worktree step, including custom gates, rather than an optional caller-side add-on. Add a regression where a custom gate creates a commit, completion persists that head in the same transaction, and restart recovery skips the gate only after restoring that exact head.

### CR-306 Review responses expose authority before atomic step completion

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:380-390`
- failure mode: Approving a parked review records the response and then writes `review_approved_head_sha` before the review step completes. A crash can expose review authority for an incomplete step. On resume, the runner deletes the durable response before completing the step, so another crash can leave the review parked with no decision to consume.
- evidence or reproduction: The IPC handler performs `RecordResponse` and `UpdateRunReviewApprovedHeadSHA` as separate commits. `ConsumeResponse` deletes and commits the response at `tools/safety-dance/internal/db/responses.go:34-53`, then the runner uses legacy `CompleteStep` at `tools/safety-dance/internal/pipeline/runner.go:156-175`; this path never calls `CompleteStepWithRunHead`. The new atomicity test covers only a normal step callback, not the public `respond` and restart path.
- fix direction: Keep the response durable until one transaction completes or skips the parked step, records its checkpoint and findings, and records review authority only for an approved review. Add crash-point tests before response consumption, after decision selection, and after transaction commit.

### CR-307 Trusted policy can come from a different remote than publication

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/daemon.go:507`
- failure mode: Changing the registered working checkout's `origin` after setup makes admission and execution trust that remote's default-branch policy while the run publishes to the persisted repository URL. A permissive or unrelated repository can therefore authorize commands and gates for a different publication target.
- evidence or reproduction: Admission fetches `origin` through `repo.WorkingPath` at lines 500-537, and execution repeats that fetch at `tools/safety-dance/internal/cli/daemon.go:734-765`. The publication request instead uses `repo.PushURL()` at lines 809-814. `db.Repo` persists `UpstreamURL` and optional `ForkURL`, but these policy fetches do not name either URL or verify that working-copy `origin` still matches the persisted trust owner.
- fix direction: Fetch trusted default-branch policy from the persisted upstream identity, or fail closed after verifying the working remote against that record. Keep fork publication separate from upstream policy ownership and add a regression with a deliberately retargeted working `origin`.

## Advisories

### ADV-001 Revalidate the push request after the mutation callback

- type: Refactor suggestion
- severity: minor
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/push.go:30-58`
- evidence: `Push` checks `Candidate == ReviewedHead` before passing the whole request to `BeforePush`, then builds Git arguments without repeating candidate, review, remote, ref, or verified-head checks. The only production callback currently changes `Rewrite`, so this is not a present bypass.
- suggestion: Return a rewrite decision from the callback instead of a mutable request, or rerun all publication preconditions after the callback.

## Dead Code and Dependency Review

- newly orphaned code: None confirmed from the latest fix. `CompleteReviewStep` remains unused but was already unused before `4034020`, so it is not attributed to this round.
- dependency findings: No new dependency or lockfile change in the latest fix. The complete change pins Go dependencies and includes generated third-party notices; hosted vulnerability and platform execution evidence was not available locally.

## Verdict

- decision: request_changes
- overall code-health change: The latest fix closes core-step checkpoint atomicity and final rewrite lease selection, but equivalent durable transitions still diverge by caller and trusted policy is not bound to the publication repository.
- rationale: CR-305, CR-306, and CR-307 can lose validated state, expose incomplete review authority, or validate under the wrong repository policy. Green aggregate checks do not exercise those crash and remote-identity boundaries.

## Review Limits

- blocked or unavailable checks: Hosted `safety-dance-v*` release execution, authorized live-provider behavior, and hosted Windows service and descendant lifecycle were not available. The axis helper returned `unclear` for performance, so that judgment was skipped and the performance axis was decided from the pinned diff.
- residual manual verification: Run hosted release, provider, and Windows lifecycle evidence after the local critical and major findings are fixed.
