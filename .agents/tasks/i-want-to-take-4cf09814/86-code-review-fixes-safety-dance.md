---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 85-code-review-safety-dance.md
reviewed_head_sha: bc3ac2c12065799af31fd90e296d9561db833bc1
fixed_head_sha: 40340205d4360b93a5a84d6e08431387d5367b73
status: complete
summary: "Fixed CR-303 by committing successful step completion, resulting run HEAD, findings, and review approval in one SQLite transaction, with runner checkpoint callbacks and regression coverage. Fixed CR-304 by allowing the pre-push callback to mutate the request before Git arguments are built, with a lease-selection regression. Focused Go race tests, the full Go race suite, vet, e2e target, and npm test passed; hosted release, provider, and hosted Windows lifecycle evidence remain unavailable."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review examined `bc3ac2c`; fixes are committed at `4034020`; the merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`. The reviewed head was the current product state before this fix commit.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not staged.

## Finding Dispositions

### CR-303

- disposition: fixed
- evidence: `pipeline.Runner` now obtains each successful step's resulting checkpoint and calls `DB.CompleteStepWithRunHead`, which updates the step result, run `head_sha`, findings, and review-approved head in one SQLite transaction. The daemon no longer updates `runs.head_sha` or review authority inside the step callback before completion. `TestDurableRunnerCommitsStepAndHeadCheckpointTogether` proves the durable result and checkpoint are recorded together.
- files changed: `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/pipeline/runner_test.go`, `tools/safety-dance/internal/db/step.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline ./internal/db ./internal/cli`; passed.

### CR-304

- disposition: fixed
- evidence: `Push` invokes `BeforePush` with its local request after live-head verification and before constructing Git arguments. The daemon's final-candidate callback now sets `req.Rewrite` on that request, so rewritten candidates select `--force-with-lease` in the actual push command. `TestPushUsesRewriteSelectedByPrePushCallback` proves callback-selected rewrite mode returns a lease.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`, `tools/safety-dance/internal/pipeline/steps/push_test.go`, `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/e2e/e2e_test.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/steps ./internal/e2e`; passed.

## Advisory Decisions

None.

## Verification

- command: `git diff --check`
- result: Passed.
- command: `cd tools/safety-dance && go test -race ./... && go vet ./... && make e2e`
- result: Passed; all Go packages passed under race detection, vet reported no diagnostics, and the temporary-binary e2e target passed.
- command: `npm test`
- result: Passed; validation and plugin synchronization passed, 137 Node tests passed, the Safety Dance aggregate passed, Go race tests and vet passed, the temporary binary build passed, and three release-contract tests passed.

## Remaining Blocks

- Hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service and descendant lifecycle, and induced OS/process crash evidence remain unavailable. These are deferred evidence limits from the review, not unresolved CR findings.
