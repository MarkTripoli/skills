---
type: code-review
date: 2026-09-21
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 5b32a124f18e56d6af588b20a1324d706618e9e9
status: findings
summary: "The complete Safety Dance change through 5b32a12 was reviewed against origin/main, including the latest publication and session changes. CR-431 and CR-432 are fixed, but five major findings remain: the operator-session check neither establishes exclusive operator authority nor supports independently launched clients, receive-hook authorization remains replayable, repository validation retains operator authority, and the promised full-path failure and native Windows proof are absent. The next fix phase must replace the same-user process heuristics with enforceable trust boundaries and add the missing end-to-end coverage."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `5b32a124f18e56d6af588b20a1324d706618e9e9`
- commits: 233 commits after the merge base; the latest product commit is `590f577 fix(safety-dance): close publication and session races`, followed by the code-review-fixes artifact commit.
- staged and unstaged changes: None.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: `.agents/tasks/**`, root `progress.md`, and the two base-only `origin/main` commits are outside the product review.

## Previous Round

- previous artifact: `.agents/tasks/i-want-to-take-4cf09814/136-code-review-safety-dance.md`
- CR-428 Detached validation descendants can still mutate daemon state: still open
- CR-429 Managed-hook authorization remains replayable after detachment: still open
- CR-430 Repository validation executes inside the operator trust domain: still open
- CR-431 An initially absent upstream ref can change before publication: fixed
- CR-432 Replaced authorization code remains orphaned: fixed
- CR-433 Planned failure scenarios do not cross the complete gate path: still open
- CR-434 Windows admission and publication have no end-to-end proof: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate as independently branded Safety Dance behavior without ordinary references to the source identity.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; the latest verification artifact is `16-verification-safety-dance.md`, and the latest fix receipt is `137-code-review-fixes-safety-dance.md`.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, the Go module conventions, and the changed workflow, installer, and release checks.

## Change Profile

- intent and expected behavior: Add a branded local bare-Git gate, authenticated daemon, durable branch-scoped validation, guarded upstream publication, operator CLI and TUI, canonical skill distribution, identity checks, and native release packaging.
- change description quality: No pull request exists. Commit subjects pass `npm run check-commits`; the task artifacts explain behavior, trust decisions, checks, and deferred hosted evidence.
- implementation model and review model: The implementation model is not recorded in the selected implementation receipt. This review used GPT-5.6 Sol.
- changed-line size and logical cohesion: 241 product files add 41,560 lines and remove 4. The change is one product, but its size prevents line-by-line review in one ordinary pull request and makes the end-to-end tests the main integration evidence.
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines, `internal/scm/github/github.go` is 1,584 lines, and several agent, database, gate, CLI, and Git files exceed 800 lines. No separate major finding is raised without a concrete ownership failure.
- dependency or lockfile changes: The new Go module pins 11 direct and 28 indirect dependencies in `go.mod` and `go.sum`; `THIRD_PARTY_NOTICES.md` and the release preflight dependency scan are present. No npm dependency or lockfile changed.

## Tests Reviewed First

- behavior claimed by tests: Unit and race tests cover gate setup, IPC, durable runs, publication, CLI, installer, identity, and packaging. `internal/e2e/public_binary_test.go` drives one built-binary success path through hooks, daemon, database, gate mirror, and upstream publication.
- missing or misleading coverage: The public-binary suite does not drive validation failure, same-branch supersession, stale review, lease rejection, cancellation, or post-write recovery. It skips Windows because generated hooks use `/bin/sh`; the repository Tests workflow runs only on Ubuntu. Session tests mock one accepted session and do not prove either legitimate cross-session operator use or rejection of a same-session orphan after the marked ancestor exits.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4591` in / `73` out

### Correctness

- assessment and evidence: The explicit absent-ref state now flows from `queryPublicationHead` into `PushRequest`, is checked before and after `BeforePush`, and has a concurrent-creation regression test, so CR-431 is fixed. The new daemon-session equality check rejects mutation requests from independently launched operator sessions, including service-managed and later-terminal clients; a temporary daemon started in a separate kernel session returned `IPC peer is outside the operator session` for `abort` while health remained available. The complete public-binary failure matrix and native Windows behavior remain unproved.
- helper coverage: covered, level 3, confidence 0.91

### Readability and Simplicity

- assessment and evidence: `VerifiedHeadKnown` and `VerifiedHeadExists` make absent-ref state explicit at the publication boundary. Removing the unused generic JSON-RPC capability fields closes CR-432. The new session-authority names claim operator provenance, but the stored value is only the daemon's inherited session identifier and does not encode who is authorized.
- helper coverage: covered, level 2, confidence 0.70

### Architecture

- assessment and evidence: Publication ownership remains in `internal/pipeline/steps`, while daemon recovery supplies durable state. The security boundary is still implemented through same-user process inspection and same-user files rather than a principal or broker unavailable to repository code. Validation commands and agents execute under the daemon user's authority, so the gate cannot enforce its own boundary against hostile repository code.
- helper coverage: covered, level 3, confidence 0.65

### Security

- assessment and evidence: Mutation admission accepts any unmarked `safety-dance` process in the daemon's session with a shell ancestor. A descendant can remain in that inherited session after its marked parent exits without calling `setsid`, so the new equality check does not close CR-428. Hook admission still combines replayable process text with a persistent per-gate capability readable by the same user, and validation retains that user's filesystem, process, credential, and network access. CR-435 through CR-437 remain major.
- helper coverage: covered, level 3, confidence 0.94

### Performance

- assessment and evidence: The latest changes add bounded process-session lookup and one extra remote-head query immediately before push. Reviewed run coordination remains keyed by repository and ref, and no new unbounded query, loop, blocking asynchronous operation, or hot-path allocation defect was found.
- helper coverage: covered, level 3, confidence 0.83

## Verification Story

- command or inspection: Read the task, plan, verification, latest fix receipt, prior finding headings, complete changed-file inventory, latest five-file product diff, relevant callers and tests; ran `npm test`, `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli ./internal/pipeline/steps && go vet ./...`, `make e2e`, the identity scan, and the product-only diff check. A temporary built binary also ran a daemon in a separate kernel session and invoked a mutation from the caller's session.
- result: `npm test` passed with 137 Node tests plus all Safety Dance race, vet, build, e2e, and release-contract checks. Focused race tests, vet, e2e, identity, and diff checks passed. The cross-session probe kept `daemon status` healthy but `abort nonexistent` exited 5 with `IPC peer is outside the operator session`.
- manual, screenshot, or before-and-after evidence: No visual interface changed in the latest fix. Hosted release, authorized live-provider behavior, and native Windows execution remain unavailable.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-435 Daemon session identity is not operator authority

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:370`
- failure mode: The check both fails open and fails closed. A validation descendant can remain in the daemon's inherited session after its marked ancestor exits, clear its marker, add a shell ancestor, and call mutation RPCs. A legitimate operator in a later terminal or through a service-managed daemon has a different session and cannot run `abort`, `respond`, `run`, restart, or stop.
- evidence or reproduction: `serveDaemon` captures its own session at `internal/cli/daemon.go:221-225`, and `AuthorizeMutationPeer` compares only the immediate peer's session to that value before trusting mutable ancestry at `internal/daemon/admission.go:370-413`. Unix descendants inherit a session unless they call `setsid`; orphaning alone does not change it. In a temporary home, a daemon launched in a separate kernel session answered health `ok`, while `safety-dance abort nonexistent` from the caller session exited 5 with `IPC peer is outside the operator session`. Existing tests replace `processSessionIDFunc` with a constant and do not exercise either case.
- fix direction: Replace session equality and process-text heuristics with an operator credential or broker unavailable to validation descendants but usable from independently launched CLI sessions. Add real-process tests for an authorized later-session operator and an orphaned same-session validation descendant across shutdown, run, respond, and abort.

### CR-436 Managed-hook authorization remains replayable

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:249`
- failure mode: Same-user repository code can read the persistent gate capability and initiate a receive path whose hook and `git-receive-pack` command text satisfy admission after marked ancestors exit.
- evidence or reproduction: `hookCapabilityValid` reads a stable bearer value from the gate, and `managedHookPeer` accepts OS-reported command strings plus absence of a surviving marker at `internal/daemon/admission.go:245-287`. The latest five-file fix does not change this path, and the hook test covers a copied capability without a real detached nested push.
- fix direction: Put receive admission behind a principal or broker unavailable to validation code and bind a single-use kernel-backed handle to the exact gate, ref, revisions, and receive operation. Add a real detached nested-push rejection test.

### CR-437 Repository validation retains operator authority

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:223`
- failure mode: Repository-defined checks and tool-using validation agents execute as the daemon user with access to operator files, credentials, process state, daemon storage, Git state, and network. Hostile repository code can attack the authority enforcing the gate instead of remaining inside the run worktree boundary.
- evidence or reproduction: `Validate` starts the configured shell directly with only an environment overlay and parent-run marker at `internal/pipeline/steps/validation.go:206-229`. The fix receipt records no sandbox or separate worker principal, and the latest product diff does not change validation execution.
- fix direction: Run repository-controlled commands and agents under a supported unprivileged principal or sandbox that denies daemon state, operator credentials, unrelated files, process control, and network by default. Test attempted access to each denied boundary.

### CR-438 Planned failures do not cross the public binary path

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/e2e/public_binary_test.go:17`
- failure mode: Component tests can pass while hook execution, daemon dispatch, durable state, worktree custody, mirror reconciliation, or the built CLI fails during validation failure, supersession, stale review, lease rejection, cancellation, or restart recovery.
- evidence or reproduction: `TestPublicBinarySmoke` contains one successful run and publication through the built binary. The required failure cases exist only in component-driven `internal/e2e/e2e_test.go`; the latest fix adds only a focused absent-ref unit test.
- fix direction: Drive every planned failure and recovery case through the generated hooks and built public binary, then assert database state, owned worktrees, gate mirror, and upstream ref for each case.

### CR-439 Windows admission and publication remain unproved

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/e2e/public_binary_test.go:20`
- failure mode: The release workflow publishes a Windows binary without executing its named-pipe authentication, process inspection, hook execution, service lifecycle, or guarded publication path on Windows.
- evidence or reproduction: The built-binary test skips Windows because hooks use `/bin/sh` at `internal/e2e/public_binary_test.go:20-22`; executable hook admission has the same skip. `.github/workflows/tests.yml:14` runs only Ubuntu, while `.github/workflows/safety-dance-release.yml:34` packages `windows/amd64` without a native Windows test job.
- fix direction: Add a native Windows CI job that builds the product and drives admission, durable execution, mutation authorization, service lifecycle, and publication through the public binary. If that behavior cannot be supported, remove Windows from the release matrix and documented platform contract.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: None found. The unused generic JSON-RPC capability fields were removed, and method-specific hook capabilities remain with their owning request parameters.
- dependency findings: Go dependencies are pinned in `go.sum`, notices are present, and release preflight runs a pinned `govulncheck`. No lockfile drift or new npm dependency was found.

## Verdict

- decision: request_changes
- overall code-health change: The explicit absent-ref publication state and removal of unused protocol fields improve the latest diff, but the replacement session check creates an operator compatibility failure without establishing the intended security boundary.
- rationale: Five major findings remain. Three affect the trust boundary that protects daemon mutations and publication; two leave required end-to-end platform and failure behavior unproved.

## Review Limits

- blocked or unavailable checks: No hosted `safety-dance-v*` release, authorized live-provider run, native Windows runner, or pull-request title was available. The axis-coverage helper result is recorded above.
- residual manual verification: Re-run the separate-session operator probe after replacing session equality, execute the complete public-binary failure matrix, and run the native Windows gate and service flow.