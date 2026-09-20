---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 87-code-review-safety-dance.md
reviewed_head_sha: e7acdd890fa4088f7254ba24f1ac53f59b07c35e
fixed_head_sha: 325a58ef3155c1c8a0b156b3752a7c16311b5db5
status: complete
summary: "Fixed CR-305 by making checkpoint capture part of registering every durable pipeline and custom-gate step. Fixed CR-306 by consuming operator responses and completing the parked step, checkpoint, and review authority in one SQLite transaction. Fixed CR-307 by fetching trusted policy through the persisted Safety Dance gate remote instead of mutable working-copy origin; focused and aggregate Go/Node checks passed, while hosted release, provider, Windows lifecycle, and induced crash evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review examined `e7acdd8`; the fixes are committed at `325a58e`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not staged or modified.

## Finding Dispositions

### CR-305

- disposition: fixed
- evidence: `pipeline.Runner.RegisterWithInputsAndCheckpoint` now binds checkpoint capture to step registration, and custom gates use it. A successful custom gate therefore records its resulting worktree HEAD through `CompleteStepWithRunHead`; restart recovery restores that checkpoint before reusing the completed gate.
- files changed: `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline ./internal/db ./internal/cli`; passed. Full `go test -race ./...` and `npm test`; passed.

### CR-306

- disposition: fixed
- evidence: `db.ApplyResponse` selects and deletes the parked response, completes or skips the step, records the worktree checkpoint, and records review approval only for an approved review inside one SQLite transaction. The daemon response handler now records intent only; it no longer exposes review authority before runner completion.
- files changed: `tools/safety-dance/internal/db/responses.go`, `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline ./internal/db ./internal/cli`; passed. Full `go test -race ./...` and `npm test`; passed.

### CR-307

- disposition: fixed
- evidence: Admission and execution now fetch, inspect, and remove trusted-policy refs from the persisted bare gate repository at `p.RepoDir(repo.ID)`, whose `origin` is established by gate initialization. Mutable working-copy `origin` no longer selects policy for a run that publishes through the persisted repository target.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./...`; passed. `npm test`; passed, including the Safety Dance identity, Go race, vet, build, and release-contract gates.

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: The production callback currently selects only rewrite mode after live-head verification. The three required major fixes were completed without broadening the callback contract; a future hardening pass can return a rewrite decision or revalidate every mutable publication field.

## Verification

- command: `git diff --check`
- result: Passed before the code commit.
- command: `cd tools/safety-dance && go test -race ./...`
- result: Passed for every package.
- command: `npm test`
- result: Passed with 137 Node tests, identity validation, plugin synchronization, Go race tests, vet, temporary binary build, and three release-contract tests.

## Remaining Blocks

- Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service and descendant lifecycle, and induced OS/process crash evidence remain unavailable.
