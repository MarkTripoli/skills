---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 1cbde470fe0343eaf92aaf75de551581e8657a73
status: findings
summary: "The complete Safety Dance change was reviewed through 1cbde47 against origin/main. The root aggregate and the narrowed built-binary target pass, but the prior shipped-flow finding remains open because the test now stops at run creation and the aggregate still skips built-binary publication. Two newly added structured-output fixtures are also unreferenced dead files and must be removed or covered."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `1cbde470fe0343eaf92aaf75de551581e8657a73`
- commits: 183 commits in `origin/main..HEAD`; the latest product commit is `94b22ee fix(safety-dance): prove built binary run admission`.
- staged and unstaged changes: None.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: Task artifacts and the two task-owned untracked evidence directories were excluded from product review.

## Previous Round

- previous artifact: `103-code-review-safety-dance.md`
- CR-346 The shipped-binary gate flow still creates no durable run: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently branded Safety Dance behavior based on the named source repository, with no product references to that source.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; Phase 4 requires a built binary to finish initialization, authenticated push admission, durable execution, and publication, while Phase 6 requires local end-to-end coverage in the aggregate.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `skills/review-code/SKILL.md`.

## Change Profile

- intent and expected behavior: Add a local Git gate, durable daemon, fixed validation pipeline, guarded publication, operator interfaces, portable skill distribution, identity checks, and native releases under the Safety Dance identity.
- change description quality: No pull request exists. `npm run check-commits -- origin/main..HEAD` accepted all 183 commit subjects. The latest product subject says it proves built-binary run admission, but its test comment still claims guarded publication that the assertions no longer check.
- implementation model and review model: The implementation model was not recorded; the review model is GPT-5.6 Sol.
- changed-line size and logical cohesion: 40,230 inserted and 4 deleted product lines across 232 files. The six planned phases are related, but the size requires the package, aggregate, and built-binary gates named by the plan.
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/db/run.go`, and `internal/cli/daemon.go` exceed 1,000 lines. No separate blocking defect was attributed only to file size.
- dependency or lockfile changes: The new Go module and `go.sum` are part of the planned tool. The latest fix adds no dependency or lockfile change.

## Tests Reviewed First

- behavior claimed by tests: Package tests cover authenticated admission, durable coordination, direct pipeline ordering, direct publication, recovery, operator commands, installation, identity, and release contracts. `TestPublicBinarySmoke` claims gate admission, durable run creation, and guarded publication in its comment.
- missing or misleading coverage: `TestPublicBinarySmoke` now exits its wait when any run appears and no longer checks terminal completion, a publication row, or the upstream ref (`tools/safety-dance/internal/e2e/public_binary_test.go:97-132`). `npm test` runs `go test -race ./...` without `SD_E2E_BINARY`, so that test skips at lines 22-25; the aggregate never invokes `make e2e` (`package.json:20-21`). The two structured-output fixtures under `internal/agent/testdata` have no callers or tests.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3624` in / `73` out; performance returned `unclear` and was decided from the diff

### Correctness

- assessment and evidence: The latest fixture change fixes trusted policy loading and `make e2e` now creates a run. It weakens the required end state from completed publication to mere run visibility at `tools/safety-dance/internal/e2e/public_binary_test.go:97-132`, so a broken validation or publication path still passes. The root aggregate omits the only command that supplies the built binary (`package.json:20-21`; `tools/safety-dance/Makefile:15-16`).
- helper coverage: covered, level 3, confidence 0.91

### Readability and Simplicity

- assessment and evidence: The gate, daemon, pipeline, operator, and installer owners remain separated. Two new files under `tools/safety-dance/internal/agent/testdata` are not referenced anywhere and contain source-specific review output rather than executable regression coverage, which adds dead concepts to an already large import.
- helper coverage: covered, level 3, confidence 0.59

### Architecture

- assessment and evidence: Direct package tests prove publication helpers, while the built-binary test proves only admission and run insertion. Those tests do not prove that `cmd/safety-dance`, daemon reconciliation, durable pipeline execution, and publication are composed correctly, which is the boundary required by `05-plan-safety-dance.md:492,673`.
- helper coverage: covered, level 2, confidence 0.53

### Security

- assessment and evidence: Authentication, one-use receipt custody, nested-run controls, explicit force-with-lease publication, and identity scanning have focused tests in their owning packages. The latest change does not weaken those checks directly, but the shipped trust path remains unproved after durable run creation because the built process is stopped before validation and publication complete.
- helper coverage: covered, level 2, confidence 0.65

### Performance

- assessment and evidence: The latest production change adds one formatted log write only when admission reconciliation fails (`tools/safety-dance/internal/cli/daemon.go:513-517`). No critical or major performance regression was found in the pinned scope.
- helper coverage: unavailable

## Verification Story

- command or inspection: `npm test`; `cd tools/safety-dance && make e2e`; `npm run check-commits -- origin/main..HEAD`; `git diff --check origin/main...HEAD`; complete changed-file inventory; latest product diff; public-binary and direct publication tests; reference search for both structured-output fixtures.
- result: `npm test` passed with 137 Node tests and all Go package checks. `make e2e` passed in about three seconds after observing a durable run. All 183 commit subjects passed. `git diff --check` reported only three pre-existing trailing-space lines in a task artifact, outside product review. Neither structured-output fixture has a repository reference.
- manual, screenshot, or before-and-after evidence: No interface change was introduced by the latest fix. Hosted release, authorized provider, Windows service, and induced crash evidence remain unavailable.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-347 The built-binary gate no longer proves completion or publication

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/e2e/public_binary_test.go:97-132`
- failure mode: The shipped command can accept a push and insert a run while validation, reviewed-head enforcement, publication, or completion is broken, yet both `make e2e` and `npm test` pass. This leaves the plan's primary init-to-publication path and aggregate acceptance criterion unproved.
- evidence or reproduction: Commit `94b22ee` changed the wait from `status=completed` to the presence of `run: ` and deleted the publication-row and upstream-head assertions. The current `make e2e` passes after those weaker checks. `package.json:20-21` never calls `make e2e`, and `TestPublicBinarySmoke` skips when `SD_E2E_BINARY` is unset at lines 22-25. The direct tests in `internal/e2e/e2e_test.go:116-200` invoke pipeline and publication packages without driving the built daemon composition.
- fix direction: Supply deterministic local agent and provider fixtures to the built process, wait for a terminal completed run, restore the publication binding and upstream-ref assertions, fail rather than skip when the dedicated target cannot establish admission on a supported platform, and invoke that target from `test:safety-dance`.

### CR-348 Imported structured-output fixtures are orphaned

- type: Refactor suggestion
- severity: major
- category: Maintainability and code quality
- location: `tools/safety-dance/internal/agent/testdata/structured_output_split_objects.txt:1-2`
- failure mode: The change adds two task-caused dead fixtures. They carry unrelated review text and protocol residue but no test reads either file, so they increase imported code and source-specific noise without proving structured-output behavior.
- evidence or reproduction: A repository-wide reference search for `structured_output_split_objects` and `structured_output_trailing_residue` returns only the tracked fixture paths themselves. `tools/safety-dance/internal/agent/runner_test.go:1-23` covers command execution only and does not consume testdata.
- fix direction: Delete both fixtures if they are not part of the product contract. If they are intended regression cases, add focused parser tests that read them and assert split-object handling and trailing-residue rejection.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: `tools/safety-dance/internal/agent/testdata/structured_output_split_objects.txt` and `tools/safety-dance/internal/agent/testdata/structured_output_trailing_residue.txt`; recorded as CR-348.
- dependency findings: The planned Go module and lockfile remain bounded to the tool. Local package, race, vet, notice-generation, and release packaging checks passed; hosted release execution remains unproved.

## Verdict

- decision: request_changes
- overall code-health change: The latest fix restores authenticated built-binary run admission, but it obtains a green target by removing the completion and publication proof. The complete change also retains two unreferenced fixtures.
- rationale: CR-347 leaves the product's primary shipped flow and aggregate regression gate incomplete. CR-348 is task-caused dead content. Both require a fix round before approval.

## Review Limits

- blocked or unavailable checks: Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced OS/process crash evidence were not available. The helper returned `unclear` for performance, so that axis was decided directly from the pinned diff.
- residual manual verification: After CR-347 is fixed, repeat the built-binary target on supported local platforms and retain hosted release, provider, and platform evidence as deferred proof where credentials or hosted runners are required.
