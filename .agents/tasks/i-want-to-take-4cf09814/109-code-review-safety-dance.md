---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 654f0496e09aacebb990d74cf304c6c045a86f41
status: findings
summary: "The complete Safety Dance change was reviewed through 654f049 against origin/main. CR-350 is fixed, but CR-349 remains open because the built production binary now contains an environment-controlled fake SCM implementation that bypasses provider detection and fabricates pull-request state. The aggregate passes, but its publication test still does not exercise the release binary's normal SCM path."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `654f0496e09aacebb990d74cf304c6c045a86f41`
- commits: 189 commits in `origin/main..HEAD`; the latest product commit is `4967099 fix(safety-dance): close code review findings`.
- staged and unstaged changes: None before this artifact was written.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: Task artifacts and the two task-owned untracked evidence directories were excluded from product review.

## Previous Round

- previous artifact: `107-code-review-safety-dance.md`
- CR-349 The publication target still does not prove the shipped aggregate path: still open
- CR-350 Ownership-journal failure strands a running run without an executor: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently branded Safety Dance behavior based on the named source repository, with no product references to that source.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; Phase 4 requires the built production command to complete the real gate and publication lifecycle, and Phase 6 requires that proof in the aggregate.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `skills/review-code/SKILL.md`.

## Change Profile

- intent and expected behavior: Add a local Git gate, durable daemon, fixed validation pipeline, guarded publication, operator interfaces, portable skill distribution, identity checks, and native releases under the Safety Dance identity.
- change description quality: No pull request exists. `npm run check-commits -- origin/main..HEAD` accepted all 189 commit subjects. The latest product subject overstates closure because the release binary now carries the fake SCM used by the end-to-end test.
- implementation model and review model: The implementation model was not recorded; the review model is GPT-5.6 Sol.
- changed-line size and logical cohesion: 40,386 inserted and 4 deleted product lines across 233 files. The six planned phases are related, but the size requires the package, aggregate, and built-binary gates named by the plan.
- resulting large-file concerns: Existing files above 1,000 lines remain, including `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, and `internal/db/run.go`. No new size-only finding was raised.
- dependency or lockfile changes: The new Go module and `go.sum` are part of the planned tool. The latest fix adds no dependency or lockfile change.

## Tests Reviewed First

- behavior claimed by tests: Package and end-to-end tests cover authenticated admission, durable coordination, publication, recovery, operator commands, installation, identity, and release contracts. `TestPublicBinarySmoke` now runs from `npm test` and asserts completed publication with matching upstream and gate refs.
- missing or misleading coverage: The test sets `SD_E2E_SCM=1`, which makes the production binary return an in-process fake SCM before provider detection. The fake reports availability, fabricates a pull-request URL, and returns open and mergeable state without contacting the fake `gh` executable or the real provider adapter.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3371` in / `73` out; performance returned `unclear` and was decided from the pinned scope

### Correctness

- assessment and evidence: CR-350 is fixed by committing ownership before the `running` transition and terminally failing a run when ownership commit fails (`tools/safety-dance/internal/daemon/manager.go:128-146`). CR-349 remains open because the green built-binary test selects an SCM implementation that release users can also select by environment (`tools/safety-dance/internal/cli/test_scm_default.go:10-37`).
- helper coverage: covered, level 3, confidence 0.91

### Readability and Simplicity

- assessment and evidence: The tagged completion and cleanup variants were deleted, which restores the production lifecycle. The replacement moved the test SCM into an untagged production file and named it `test_scm_default.go`, hiding a test-only branch inside normal command construction rather than removing the branch.
- helper coverage: covered, level 2, confidence 0.66

### Architecture

- assessment and evidence: `newSCMHost` checks `newTestSCMHost` before provider detection and real GitHub adapter construction (`tools/safety-dance/internal/cli/daemon.go:709-727`). This makes a process environment variable, not the SCM owner or injected test boundary, select the trust-boundary implementation in every shipped binary.
- helper coverage: covered, level 2, confidence 0.56

### Security

- assessment and evidence: `SD_E2E_SCM=1` bypasses provider detection and authentication. Its host returns success from `Available`, invents PR `1`, reports an open PR and mergeable state, and supplies no checks (`tools/safety-dance/internal/cli/test_scm_default.go:10-35`). A run with trusted `no_ci: true` can therefore publish and complete with fabricated provider state.
- helper coverage: covered, level 3, confidence 0.64

### Performance

- assessment and evidence: The latest fix adds no meaningful hot-path work outside one environment lookup during SCM construction. No critical or major performance regression was found in the pinned scope.
- helper coverage: unavailable

## Verification Story

- command or inspection: `npm test`; `npm run check-commits -- origin/main..HEAD`; `git diff --check origin/main...HEAD -- . ':(exclude).agents/tasks'`; latest product diff; built-binary SCM selection; ownership transition order and forced-failure test.
- result: `npm test` passed with 137 Node tests, all Go race packages, vet, an untagged binary build, the built-binary end-to-end target, and 3 release tests. All 189 commit subjects and product whitespace checks passed. These green checks reproduce the SCM substitution described in CR-351.
- manual, screenshot, or before-and-after evidence: No interface change was introduced by the latest fix. Hosted release, authorized provider, Windows service, and induced OS/process crash evidence remain unavailable.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-351 The release binary ships an environment-controlled fake SCM

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/test_scm_default.go:10-37`
- failure mode: Any Safety Dance daemon started with `SD_E2E_SCM=1` bypasses provider detection and the real GitHub adapter. The pipeline can publish, record a fabricated pull request, and complete when trusted policy disables CI, even though no provider authentication or pull-request operation occurred. The same hidden branch makes the aggregate's built-binary proof weaker than the release behavior it claims to cover.
- evidence or reproduction: `newTestSCMHost` reads the ordinary process environment and returns `e2eSCMHost`; the host's `Available` always succeeds, `CreatePR` returns `https://safety-dance.test/pull/1`, and its state methods return open and mergeable with no checks. `newSCMHost` returns this object before `scm.DetectProvider` (`tools/safety-dance/internal/cli/daemon.go:709-727`). `TestPublicBinarySmoke` enables the branch on every command and daemon process (`tools/safety-dance/internal/e2e/public_binary_test.go:58-62,100-103`).
- fix direction: Remove the test SCM and `SD_E2E_SCM` switch from production code. Drive the real GitHub adapter through the test's fake `gh` executable and local Git URL rewrite, or inject the SCM dependency through a test-only command-construction boundary that cannot be activated in a release binary. Keep `make e2e` in the aggregate and retain the production completion, cleanup, provider-detection, and source-resolution paths.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: None confirmed. The deleted build-tag variants have no remaining references; the default completion and cleanup implementations remain live in untagged builds.
- dependency findings: The planned Go module and lockfile remain bounded to the tool. Package, race, vet, identity, built-binary, and release-contract checks passed; hosted release execution remains unproved.

## Verdict

- decision: request_changes
- overall code-health change: The fix repairs ownership registration and restores production completion and cleanup, but it moves the fake SCM into every release binary.
- rationale: CR-351 keeps CR-349's shipped-path proof gap open and adds an environment-controlled provider bypass at the publication boundary. It is a major finding despite the green aggregate.

## Review Limits

- blocked or unavailable checks: Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence were not available. The helper returned `unclear` for performance, so that axis was decided directly from the pinned scope and its judgment was skipped.
- residual manual verification: After CR-351 is fixed, repeat the aggregate and confirm the built command reaches the real provider adapter through deterministic external fixtures. Keep hosted release, provider, and platform evidence as deferred proof where credentials or hosted runners are required.
