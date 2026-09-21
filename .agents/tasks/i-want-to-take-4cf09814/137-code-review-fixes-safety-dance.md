---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/136-code-review-safety-dance.md
reviewed_head_sha: e4e0ac3f9ef441849c4511abdb04603cfe7b411e
fixed_head_sha: 590f57793986050c4763f10a84c5d08e7a1d851d
status: complete
summary: "CR-428, CR-431, and CR-432 are fixed: Unix mutation RPCs now require the daemon-captured operator session, publication preserves explicit absent-ref state and rechecks it after callbacks, and unused generic RPC capability fields were removed. CR-429, CR-430, CR-433, and CR-434 remain blocked because this checkout has no separately privileged receive broker, portable validation sandbox, complete built-binary failure matrix, or native Windows execution environment. Focused Go tests, race tests, vet, the Safety Dance aggregate, the root npm aggregate, identity scan, and product diff checks passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` advanced from review base `4458fbf21e199dad45376b8164f78c2165ac1d20` to `1837afdde1ce8d17e892c379d39ef5e585e9dfc3`; the review head `e4e0ac3` advanced to `590f577` without merge or rebase. The product fixes remain limited to the reviewed Safety Dance paths.
- unrelated changes preserved: task-owned `.atomic-delivery/`, `evidence/`, and `progress.md` remain untracked and untouched.

## Finding Dispositions

### CR-428

- disposition: fixed
- evidence: `serveDaemon` captures the daemon's kernel-owned Unix session before serving. `AuthorizeMutationPeer` now rejects mutation RPCs unless the immediate peer resolves to that captured session, in addition to existing executable, ancestry, shell, and nested-run checks. This prevents a detached descendant that creates a new session from using the mutation endpoints.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli` passed; `make e2e` passed through the built binary.

### CR-429

- disposition: blocked
- evidence: The managed receive path still authenticates through process ancestry plus a persisted per-gate capability readable by same-user repository code. Closing replay after detachment requires a separately privileged receive broker or kernel-bound single-use handle, neither of which exists in this checkout.
- files changed: None.
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git ./internal/ipc` passed; detached nested-push rejection remains unproven.

### CR-430

- disposition: blocked
- evidence: Repository commands and validation agents still execute under the daemon user's OS principal. The current environment filter and project-settings controls do not provide filesystem, process, credential, or network isolation. A supported unprivileged worker principal or sandbox is required and was not available for this phase.
- files changed: None.
- regression check: Existing validation, race, vet, and end-to-end suites passed; trust-domain isolation remains an explicit deployment limitation.

### CR-431

- disposition: fixed
- evidence: `PushRequest` now carries `VerifiedHeadKnown` and `VerifiedHeadExists`. Production publication sets both from `queryPublicationHead`; `Push` rejects a target that was absent when verified but exists before publication and performs the check again after `BeforePush`. Recovery uses the same explicit state. `TestPushRejectsConcurrentCreationOfAbsentRef` creates the ref in the callback and proves publication is rejected.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`, `tools/safety-dance/internal/pipeline/steps/push_test.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/steps` passed; the new absent-ref race test passed.

### CR-432

- disposition: fixed
- evidence: The trusted operator session is now production-wired from daemon startup into mutation authorization rather than remaining an unused seam. The unused generic JSON-RPC `Capability` fields were removed from `ipc.Request` and `ipc.Response`; method-specific hook capabilities remain on their owning parameter types.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/ipc/protocol.go`
- regression check: `cd tools/safety-dance && go test ./... && go vet ./...` passed.

### CR-433

- disposition: blocked
- evidence: The current full-path public-binary test proves the happy path only. The promised validation-failure, supersession, stale-review, lease-rejection, cancellation, and post-write recovery scenarios remain component-driven in `internal/e2e/e2e_test.go`; this phase did not add the larger fixture matrix.
- files changed: None.
- regression check: `make e2e` and the full Go race suite passed, but they do not establish the requested complete failure matrix.

### CR-434

- disposition: blocked
- evidence: Windows binaries remain release targets, while this checkout cannot execute native Windows Git hooks, named-pipe authentication, service lifecycle, and publication. Existing Windows skips remain honest rather than relabeled as proof. A hosted Windows job or supported Windows runner is required to close this finding.
- files changed: None.
- regression check: Linux `make e2e`, Go race tests, and vet passed; native Windows behavior remains untested.

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && make e2e`
- result: passed; the built public binary completed the existing isolated gate flow.
- command: `cd tools/safety-dance && go test -race ./internal/pipeline/steps ./internal/daemon && go vet ./...`
- result: passed; the absent-ref race test and daemon authorization tests passed under the race detector, and vet reported no diagnostics.
- command: `npm test`
- result: passed; validation, plugin synchronization, 137 Node tests, identity scanning, Go race/vet/build checks, public-binary e2e, and release-contract tests passed.
- command: `node scripts/check-safety-dance-identity.mjs && git diff --check origin/main...HEAD -- . ':(exclude).agents/tasks/**'`
- result: passed; no identity findings or product diff whitespace errors.

## Remaining Blocks

- CR-429 requires a separately privileged receive broker or kernel-bound single-use receive handle.
- CR-430 requires a supported unprivileged sandbox or worker principal for repository validation.
- CR-433 requires a built-binary failure and recovery matrix through hooks, daemon, durable state, worktrees, mirror, and upstream.
- CR-434 requires native Windows execution proof or removal of Windows release targets.
- Hosted release execution and live-provider behavior remain unavailable, as recorded by verification.
