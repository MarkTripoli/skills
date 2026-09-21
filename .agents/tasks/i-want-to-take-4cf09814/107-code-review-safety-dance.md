---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 425b8fb34dde8840995db18a8fcf5fc07e3cbb32
status: findings
summary: "The complete Safety Dance change was reviewed through 425b8fb against origin/main. CR-348 is fixed, but CR-347 remains open because the publication test uses a tagged lifecycle that the shipped binary does not contain and npm test still skips that test. A separate ownership-journal failure can leave a durable run marked running without an executor until daemon restart."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `425b8fb34dde8840995db18a8fcf5fc07e3cbb32`
- commits: 186 commits in `origin/main..HEAD`; the latest product commit is `fa39cec fix(safety-dance): prove built binary publication`.
- staged and unstaged changes: None before this artifact was written.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: Task artifacts and the two task-owned untracked evidence directories were excluded from product review.

## Previous Round

- previous artifact: `105-code-review-safety-dance.md`
- CR-347 The built-binary gate no longer proves completion or publication: still open
- CR-348 Imported structured-output fixtures are orphaned: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently branded Safety Dance behavior based on the named source repository, with no product references to that source.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; Phase 4 requires a built production command to complete gate admission, durable execution, and publication, while Phase 6 requires local end-to-end coverage in the aggregate.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `skills/review-code/SKILL.md`.

## Change Profile

- intent and expected behavior: Add a local Git gate, durable daemon, fixed validation pipeline, guarded publication, operator interfaces, portable skill distribution, identity checks, and native releases under the Safety Dance identity.
- change description quality: No pull request exists. `npm run check-commits -- origin/main..HEAD` accepted all 186 commit subjects. The latest product subject claims built-binary publication proof, but the target compiles a test-tagged lifecycle rather than the shipped command and the aggregate does not run it.
- implementation model and review model: The implementation model was not recorded; the review model is GPT-5.6 Sol.
- changed-line size and logical cohesion: 40,337 inserted and 4 deleted product lines across 236 files. The six planned phases are related, but the size requires the package, aggregate, and built-binary gates named by the plan.
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/db/run.go`, and `internal/cli/daemon.go` exceed 1,000 lines. The ownership-journal failure in `internal/daemon/manager.go` is a concrete lifecycle defect rather than a size-only concern.
- dependency or lockfile changes: The new Go module and `go.sum` are part of the planned tool. The latest fix adds no dependency or lockfile change.

## Tests Reviewed First

- behavior claimed by tests: Package and end-to-end tests cover authenticated admission, durable coordination, direct publication, recovery, operator commands, installation, identity, and release contracts. `TestPublicBinarySmoke` claims the built command reaches completed publication and matching upstream and gate refs.
- missing or misleading coverage: `make e2e` builds with `-tags safety_dance_e2e`; that tag marks completion directly, skips production cleanup, tolerates a source lookup failure, and substitutes an SCM host. `npm test` runs untagged `go test -race ./...`, where `TestPublicBinarySmoke` skips because `SD_E2E_BINARY` is absent. No manager test forces `CommitOwnership` to fail after the run becomes `running`.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3912` in / `73` out; security returned `unclear` and was decided from the pinned scope

### Correctness

- assessment and evidence: The tagged end-to-end target reaches publication, but it does not execute the shipped completion and cleanup lifecycle and the aggregate omits the target (`tools/safety-dance/Makefile:15-16`, `package.json:20-21`). Separately, `replaceValidated` persists `running` before `CommitOwnership`; an error then returns before a handle or executor exists (`tools/safety-dance/internal/daemon/manager.go:128-157`).
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: CR-348 is fixed because the two unreferenced structured-output fixtures were deleted. The latest fix adds paired build-tag files for completion, cleanup, and SCM behavior, so the test target now has a lifecycle distinct from the production command (`tools/safety-dance/internal/cli/complete_run_e2e.go:1-12`, `run_cleanup_e2e.go:1-5`, `test_scm_e2e.go:1-34`).
- helper coverage: covered, level 2, confidence 0.82

### Architecture

- assessment and evidence: Durable run state, ownership journaling, and the in-memory executor registry meet in `Manager.replaceValidated`. The current order can expose a `running` row without registering the corresponding `RunHandle`, breaking the invariant that active durable state has an owner until startup recovery (`tools/safety-dance/internal/daemon/manager.go:128-157,197-281`).
- helper coverage: covered, level 2, confidence 0.79

### Security

- assessment and evidence: Authentication, one-use admission receipts, nested-run controls, reviewed-head continuity, explicit force-with-lease publication, and identity scanning retain focused checks. No new critical or major security defect was confirmed in this round; the publication concern is about proof of the shipped lifecycle, not evidence that the underlying head checks were removed.
- helper coverage: unavailable

### Performance

- assessment and evidence: The latest fix adds no production hot-path work because its alternate implementations compile only under `safety_dance_e2e`. No critical or major performance regression was found in the pinned scope.
- helper coverage: covered, level 3, confidence 0.79

## Verification Story

- command or inspection: `npm test`; `cd tools/safety-dance && make e2e`; `npm run check-commits -- origin/main..HEAD`; `git diff --check origin/main...HEAD -- . ':(exclude).agents/tasks'`; latest product diff; public-binary lifecycle variants; manager replacement and ownership-journal ordering; reference search for the removed fixtures.
- result: `npm test` passed with 137 Node tests and the untagged Safety Dance package checks. `make e2e` passed separately against the `safety_dance_e2e` binary. All 186 commit subjects and product whitespace checks passed. The removed fixtures have no tracked product files or references.
- manual, screenshot, or before-and-after evidence: No interface change was introduced by the latest fix. Hosted release, authorized provider, Windows service, and induced crash evidence remain unavailable.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-349 The publication target still does not prove the shipped aggregate path

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/Makefile:15-16`
- failure mode: A production completion, cleanup, or built-command composition regression can ship while `npm test` and the dedicated end-to-end target remain green. CI never runs the publication test, and the dedicated target changes the lifecycle it claims to prove.
- evidence or reproduction: `npm test` invokes `test:safety-dance`, which runs untagged `go test -race ./...` and an untagged build but never `make e2e` (`package.json:20-21`). `TestPublicBinarySmoke` skips without `SD_E2E_BINARY` (`tools/safety-dance/internal/e2e/public_binary_test.go:22-25`). The separate target builds with `-tags safety_dance_e2e`; tagged code directly transitions the run to completed, skips cleanup journaling and removal, and tolerates a source lookup error that production rejects (`tools/safety-dance/internal/cli/daemon.go:247-267,778-784,987-990`; `complete_run_e2e.go:10-12`; `run_cleanup_e2e.go:5`). It can also skip rather than fail when admission ancestry is unavailable (`public_binary_test.go:95-103`).
- fix direction: Run the built-command publication proof from `test:safety-dance`; build the same command lifecycle that releases ship; inject only deterministic external agent and SCM dependencies; keep production completion, cleanup, and source resolution intact; and make a supported-platform admission failure fail the dedicated target rather than skip it.

### CR-350 Ownership-journal failure strands a running run without an executor

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/manager.go:128-157`
- failure mode: If deleting the pending ownership journal fails after durable run creation, the row remains `running`, no `RunHandle` is registered, and no executor starts. The live daemon can leave that run stuck indefinitely and accept another run for the same branch because its in-memory key has no owner.
- evidence or reproduction: `replaceValidated` creates the run and transitions it from `pending` to `running` at lines 128-135, then returns on `worktrees.CommitOwnership` error at lines 137-139. Handle registration and goroutine startup occur only at lines 142-157. `CommitOwnership` propagates any journal deletion error other than not-exist (`tools/safety-dance/internal/worktrees/ownership.go:101-106`). Recovery re-registers durable running rows only when `manager.Recover` runs during daemon startup (`tools/safety-dance/internal/cli/daemon.go:505-520`); subsequent replacements consult only `m.keys` (`manager.go:99-127`).
- fix direction: Do not expose `running` before ownership commit and executor registration can succeed. On a journal-commit failure, durably move the new run to a terminal failure or roll back its run record and worktree ownership before returning. Add a forced-failure test that proves the live manager has no stranded active row and cannot start overlapping work for the same branch.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: None. The two fixtures from CR-348 were deleted and no product references remain.
- dependency findings: The planned Go module and lockfile remain bounded to the tool. Package, race, vet, identity, binary-build, and release-contract checks passed; hosted release execution remains unproved.

## Verdict

- decision: request_changes
- overall code-health change: The latest fix restores publication assertions and removes the dead fixtures, but it proves them through a test-only lifecycle outside the aggregate. The run manager also has an unhandled ownership-journal failure between durable state and executor registration.
- rationale: CR-349 leaves the plan's shipped init-to-publication and aggregate acceptance criterion unproved. CR-350 violates durable same-branch ownership on a concrete filesystem error. Both are major findings.

## Review Limits

- blocked or unavailable checks: Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence were not available. The helper returned `unclear` for security, so that axis was decided directly from the pinned scope and its judgment was skipped.
- residual manual verification: After CR-349 is fixed, repeat the aggregate on supported local platforms and retain hosted release, provider, and platform evidence as deferred proof where credentials or hosted runners are required.
