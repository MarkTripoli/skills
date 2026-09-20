---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 338e90a868bd20d9c534a39d6e4e72f3022bab54
status: findings
summary: "The 39,964-line product diff was reviewed at 338e90a against origin/main, including the 2ccd695 repair round. Two major findings remain: deferred post-receive reconciliation drops the accepted push options and validation generation, and the shipped binary still lacks the required init-to-publication end-to-end regression. The next fix round must persist and replay the complete accepted notification and add a built-binary lifecycle test."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `338e90a868bd20d9c534a39d6e4e72f3022bab54`
- commits: 168 commits after the merge base; 232 product files changed with 39,964 insertions and 4 deletions
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked task-evidence trees

## Previous Round

- previous artifact: `93-code-review-safety-dance.md`
- CR-327 Prompt identity still does not reach response clients: fixed
- CR-328 Disallowed responses mutate durable state before rejection: fixed
- CR-329 Live response completion samples and writes the checkpoint twice: fixed
- CR-330 Existing databases fail before prompt-generation migrations run: fixed
- CR-331 Accepted receipt retries wedge on the first leftover worktree: fixed
- CR-332 Manual run gate verification races with newer accepted heads: fixed
- CR-333 Enterprise fork pull requests use the hostname as head owner: fixed
- CR-334 Accepted pushes block on complete run construction: fixed
- CR-335 The shipped workflow still has no binary end-to-end regression: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced local Git gate as the independently branded Safety Dance system
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; latest receipt `.agents/tasks/i-want-to-take-4cf09814/26-implementation-safety-dance.md`; verification `.agents/tasks/i-want-to-take-4cf09814/16-verification-safety-dance.md`; latest fixes `.agents/tasks/i-want-to-take-4cf09814/94-code-review-fixes-safety-dance.md`
- repository instructions: root and worktree `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and the review-code skill

## Change Profile

- intent and expected behavior: add an authenticated local Git gate, durable branch-scoped daemon runs, fixed validation and guarded publication, operator CLI/TUI/service flows, canonical skill distribution, identity enforcement, and checksummed native releases under the Safety Dance identity
- change description quality: task artifacts describe the behavior and repair history; no pull request exists, and the latest product commit has a compliant standalone subject but no explanatory body
- implementation model and review model: implementation model unrecorded; review model GPT-5.6 Sol with GPT-5.6 Sol specialist passes
- changed-line size and logical cohesion: 39,964 product insertions across 232 files form one product import but exceed the normal review-size split signal; the repeated review/fix history supplied narrower checkpoints
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines, `internal/scm/github/github.go` is 1,490, `internal/agent/agent.go` is 1,353, `internal/db/run.go` is 1,148, and `internal/cli/daemon.go` is 1,007; no new critical or major defect was attributed solely to file size
- dependency or lockfile changes: the new Go module and `go.sum` add pinned runtime dependencies; verification passed Go race, vet, build, identity, and aggregate checks, with no package-lock change

## Tests Reviewed First

- behavior claimed by tests: package, race, temporary-repository, publication, restart, CLI, daemon, installer, identity, release-contract, and aggregate tests cover the locally decidable acceptance items; the latest fix receipt records passing focused race tests and `npm test` with 137 Node tests
- missing or misleading coverage: `internal/e2e/public_binary_test.go` runs only isolated `status` and help commands; the deferred-notification path has no test proving push options and validation generation survive durable receipt reconciliation

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3881` in / `73` out; security judgment unavailable after an `unclear` result

### Correctness

- assessment and evidence: the latest repair closes the prior response identity, action policy, migration ordering, checkpoint, worktree retry, gate-head, and fork-owner defects. `Admission.notifyPush` accepts complete notification metadata at `internal/daemon/admission.go:386-439`, but the persisted receipt type stores none of that metadata and `ReconcileOnce` reconstructs a partial notification at `internal/daemon/admission.go:93-135`, causing CR-336. The built-binary acceptance path remains unproved by `internal/e2e/public_binary_test.go:10-32`, causing CR-337.
- helper coverage: covered, level 3, confidence 0.97

### Readability and Simplicity

- assessment and evidence: response authorization is consolidated in `types.ResponseAllowed`, branch replacement validation is explicit in `Manager.ReplaceValidated`, and the latest changes do not duplicate those policies. The partial conversion between `NotifyPushParams`, `AdmitPushParams`, and `PushNotification` obscures which post-receive fields are durable and is the narrow ownership defect behind CR-336.
- helper coverage: covered, level 2, confidence 0.64

### Architecture

- assessment and evidence: package ownership follows the plan: admission owns hook authentication and receipts, the manager owns branch replacement, the database owns durable transitions, and pipeline steps own publication. Deferred reconciliation crosses the admission durability boundary without preserving the full notification contract, while the binary end-to-end test does not exercise the composition root that connects those owners.
- helper coverage: covered, level 3, confidence 0.76

### Security

- assessment and evidence: response clients now carry step identity and generation, the database rechecks both transactionally, disallowed actions are rejected before mutation, manual runs revalidate the gate head under the branch lock, and managed-hook peer checks remain in admission. No additional critical or major authorization, secret-handling, or input-validation defect was found in the pinned scope.
- helper coverage: unavailable

### Performance

- assessment and evidence: deferred post-receive processing removes worktree creation, configuration loading, prior-run joining, and run persistence from the hook latency path. The one-second reconciliation worker processes a fixed receipt snapshot, and no unbounded hot-path loop, N+1 operation, or blocking regression with critical or major impact was found.
- helper coverage: covered, level 3, confidence 0.63

## Verification Story

- command or inspection: read verification item table; inspected commit `2ccd695`; ran `npm run check-commits -- origin/main..HEAD`, product-only `git diff --check`, and `cd tools/safety-dance && make e2e`
- result: 168 commit subjects passed; the product diff check emitted no diagnostics; `make e2e` built the shipped binary and passed `./internal/e2e/...` in 1.274 seconds, but the binary test executed only status and help
- manual, screenshot, or before-and-after evidence: no interface screenshots were required; hosted release, live provider, Windows service, and induced crash evidence remain unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-336 Deferred reconciliation drops accepted push metadata

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/admission.go:131`
- failure mode: production enables deferred notifications, but reconciliation rebuilds `PushNotification` with only gate, ref, SHAs, and token. Every accepted push loses its requested push options and post-receive validation generation before `recordPush` persists the accepted ref, so durable run records do not represent the accepted notification.
- evidence or reproduction: `NotifyPushParams` carries `PushOptions` and `ValidationGeneration` in `internal/ipc/protocol.go:248-255`; `notifyPush` parses both at `internal/daemon/admission.go:386-412` but persists only `receipt.Accepted` at lines 426-428; `AdmitPushParams` has no fields for either value at `internal/ipc/protocol.go:226-233`; `ReconcileOnce` invokes the callback without them at `internal/daemon/admission.go:131`; and `recordPush` persists `n.ValidationGeneration` and `n.Options` at `internal/cli/daemon.go:636-644`.
- fix direction: make the durable receipt store the complete accepted notification metadata, populate it before acknowledging post-receive, replay those fields through `ReconcileOnce`, and add a deferred/restart regression that asserts the resulting accepted ref retains the requested options and validation generation.

### CR-337 The shipped workflow still has no binary end-to-end regression

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/e2e/public_binary_test.go:10`
- failure mode: `make e2e` can pass while the public binary's init, daemon lifecycle, generated hooks, durable run, publication, response, or restart wiring is broken because the only built-binary test executes `status` and help. Package-level fixtures cannot detect composition-root or CLI wiring regressions across the required user journey.
- evidence or reproduction: `TestPublicBinarySmoke` runs only `status`, `--help`, `daemon --help`, and `status --help` at `internal/e2e/public_binary_test.go:12-32`; `make e2e` passed this session, yet Phase 4 requires the built binary to initialize a temporary repository, push through the generated remote, observe and control the durable run, and complete publication at `05-plan-safety-dance.md:484-492`. The latest fix artifact also records this gap as blocked.
- fix direction: extend the built-binary fixture to drive `init`, daemon start, an authenticated push through generated hooks, durable status or response, verified upstream publication, restart/recovery, and daemon stop against temporary repositories and `SD_HOME`.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found; the test-only hook helper remains referenced by executable-hook tests, and the new response, migration, admission, manager, and worktree paths have callers
- dependency findings: no new dependency was added by the latest repair; the full module lock and aggregate dependency checks passed in the verification artifact

## Verdict

- decision: request_changes
- overall code-health change: the latest repair improves authority, migration, concurrency, and hook-latency boundaries, but leaves one durability loss and one required regression gap
- rationale: CR-336 contradicts the durable accepted-ref metadata contract, and CR-337 leaves the shipped composition path unprotected; both are major-severity findings

## Review Limits

- blocked or unavailable checks: no pull request exists, so no title or hosted CI run was available; hosted release, authorized live-provider, hosted Windows service, and induced OS/process crash evidence remain unavailable. The security axis judgment returned `unclear`, so that helper judgment was skipped and the axis was decided from source inspection.
- residual manual verification: run the first hosted `safety-dance-v*` release, an authorized provider flow, Windows service lifecycle, and crash recovery when those environments are available
