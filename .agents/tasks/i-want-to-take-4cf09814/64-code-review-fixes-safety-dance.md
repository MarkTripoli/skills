---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 63-code-review-safety-dance.md
reviewed_head_sha: cb9a30bcbe847cd758c76011c29d2499f746bd71
fixed_head_sha: 8d6482c
status: complete
summary: "CR-189, CR-191, CR-192, CR-193, CR-194, CR-195, CR-196, CR-197, CR-198, CR-199, CR-201, and CR-202 were repaired in the Safety Dance runtime and regression contracts. CR-190 remains blocked because advertised non-GitHub SCM providers still lack production hosts, and CR-200 remains blocked because repaired existing-gate snapshots need a dedicated rollback handle. Root npm tests and the Safety Dance aggregate pass."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review covered `4cc33ce`; the repair started at `cb9a30b` and produced `8d6482c`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` directories were not staged or changed.

## Finding Dispositions

### CR-189

- disposition: fixed
- evidence: After the remote candidate is observed, mirror and publication-binding work now use a bounded context independent of caller cancellation. The cancelled caller cannot strand a confirmed remote write before reconciliation completes.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/...`

### CR-190

- disposition: blocked
- evidence: `newSCMHost` still fails closed for GitLab, Bitbucket, Azure DevOps, Forgejo, and Gitea. Implementing and testing five provider hosts is outside this repair's bounded change set.
- files changed: None.
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/scm`

### CR-191

- disposition: fixed
- evidence: Typed validation results now pass through a durable sink. The runner persists findings JSON and evidence in the step record's activity before completion.
- files changed: `tools/safety-dance/internal/db/evidence.go`, `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/pipeline/steps/validation.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/... ./internal/db/...`

### CR-192

- disposition: fixed
- evidence: Cobra argument, required-argument, unknown-flag, and invalid-argument errors now map to exit class 2 instead of relying only on `usage` text.
- files changed: `tools/safety-dance/internal/cli/root.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli`

### CR-193

- disposition: fixed
- evidence: Setup no longer asks for gate and provider values that it cannot persist. TUI output now derives publication state, key hints, and both approval and fix-review prompts from durable run state.
- files changed: `tools/safety-dance/internal/cli/wizard.go`, `tools/safety-dance/internal/cli/tui.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/tui ./internal/wizard`

### CR-194

- disposition: fixed
- evidence: A preserved pre-receive hook rejection removes the receive transaction's receipt entries before returning failure, preventing a later matching ref from replaying the rejected receive.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/git ./internal/daemon`

### CR-195

- disposition: fixed
- evidence: Accepted-head worktrees are created and recovered from the registered bare Safety Dance gate, which is the durable object source rather than the mutable working checkout.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/worktrees ./internal/e2e`

### CR-196

- disposition: fixed
- evidence: Admission rejects an all-zero new revision before storing a receipt or allowing a branch-deletion update to reach worktree creation.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git`

### CR-197

- disposition: fixed
- evidence: Replacement now acquires a coordinator mutex per repository/ref key and holds it through cancellation, join, persistence, and assignment. Different branch keys retain independent locks.
- files changed: `tools/safety-dance/internal/daemon/manager.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`

### CR-198

- disposition: fixed
- evidence: Operator cancellation records cancellation even while `push_active` is set, then signals the exact active run. Publication checks status before the irreversible push and completes uncertain post-push reconciliation independently.
- files changed: `tools/safety-dance/internal/db/runs.go`, `tools/safety-dance/internal/pipeline/steps/push.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/db ./internal/pipeline/steps ./internal/cli`

### CR-199

- disposition: fixed
- evidence: Each production run now creates `$SD_HOME/logs/<run-id>/run.log` and writes start and finish records, so `safety-dance logs <run-id>` reads a path production owns.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/daemon`

### CR-200

- disposition: blocked
- evidence: Wizard compensation still distinguishes newly-created gates from repaired existing gates; a repair-specific snapshot handle is required to restore existing hooks, config, and remote state without deleting pre-existing data.
- files changed: None.
- regression check: `cd tools/safety-dance && go test -race ./internal/gate ./internal/cli ./internal/wizard`

### CR-201

- disposition: fixed
- evidence: TUI interactivity now requires both terminal stdin and terminal output. Redirected output produces one ANSI-free plain snapshot even when stdin remains attached to a terminal.
- files changed: `tools/safety-dance/internal/cli/tui.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/tui`

### CR-202

- disposition: fixed
- evidence: The identity scanner now checks command, environment, module, path, token, and daemon variants in shipped roots. Release tests cover the Windows matrix, `.exe` packaging, and executable handoff; `docs/testing.md` records local, provider, hosted-service, and hosted-release evidence boundaries.
- files changed: `scripts/check-safety-dance-identity.mjs`, `tests/safety-dance-release.test.mjs`, `docs/testing.md`
- regression check: `npm test`

## Advisory Decisions

### ADV-001

- disposition: accepted
- reason: The scanner is now scoped to shipped roots at repository runtime, while temporary fixtures retain recursive behavior for focused unit tests.

### ADV-002

- disposition: fixed
- reason: The release test and workflow contract now include the Windows target and `.exe` executable packaging.

## Verification

- command: `npm test`
- result: Passed. Validation, plugin sync, 136 Node tests, identity scan, Go race suite, vet, temporary build, and two release-contract tests completed successfully.
- command: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli ./internal/pipeline/... ./internal/git ./internal/db/... ./internal/tui ./internal/wizard && go vet ./...`
- result: Passed.
- command: `node --test tests/safety-dance-release.test.mjs && node scripts/check-safety-dance-identity.mjs && git diff --check`
- result: Passed.

## Remaining Blocks

- CR-190: advertised non-GitHub providers still need concrete production implementations and provider-backed tests.
- CR-200: repaired existing-gate setup needs a rollback handle that restores its pre-repair snapshot after later service failure.
- Hosted Windows service execution, live provider behavior, and hosted `safety-dance-v*` release execution remain unavailable in this environment.
