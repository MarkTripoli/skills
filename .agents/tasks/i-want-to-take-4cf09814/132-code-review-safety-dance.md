---
type: code-review
date: 2026-09-21
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 5407863f44608c7ec41a5004759b77bad5cdda87
status: findings
summary: "The complete Safety Dance change through 5407863 was reviewed against origin/main, including the edd68a1 authorization repair; the aggregate suite passes, and the Windows startup and GitHub branch-ref findings are fixed. Two trust-boundary findings remain: same-user validation descendants can recover operator mutation authority, and managed-hook authorization both bypasses the nested-run ancestry fence and retains its forgeable empty-capability fallback. The next fix phase must replace these bearer-file and process-text checks with authorization validation descendants cannot read, inherit, omit, or reconstruct, then add adversarial tests."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` against `origin/main`
- reviewed HEAD: `5407863f44608c7ec41a5004759b77bad5cdda87`; product repair commit `edd68a188ec301260b59867df1cd68fe1d2519b6`
- commits: 224 commits after the merge base; `edd68a1` and its task artifacts are the only commits after the product HEAD reviewed in the previous round
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts under `.agents/tasks/`; unrelated untracked `progress.md`

## Previous Round

- previous artifact: `.agents/tasks/i-want-to-take-4cf09814/130-code-review-safety-dance.md`
- CR-412 Session membership still does not prove operator authority: still open
- CR-413 Managed-hook admission still trusts forgeable argv: still open
- CR-414 Trusted-session capture disables supported daemon launch modes: fixed
- CR-415 Pull-request operations receive a full Git ref instead of a branch name: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently branded local Git gate with no ordinary source-project identity references
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; nested validation children must not initialize, rerun, respond to, abort, or bypass their parent run, and hook admission must be OS-authenticated
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed-file conventions enforced by `scripts/validate.mjs`

## Change Profile

- intent and expected behavior: add the Safety Dance Go gate, durable daemon and pipeline, operator interfaces, canonical non-worker skill, repository checks, and native release contract while preserving admission, custody, concurrency, recovery, and publication boundaries
- change description quality: no pull request exists, so there is no PR title or body to assess; commit subjects pass the repository check, and task artifacts record behavior, evidence, and deferred hosted limits
- implementation model and review model: implementation model not recorded; review model `GPT-5.6 Sol` with three independent `agent-implementation-reviewer` passes
- changed-line size and logical cohesion: 241 non-task files and about 41,482 changed lines; the code is organized by gate, IPC, daemon, database, pipeline, SCM, CLI, and distribution owners, but the scope requires continued boundary-focused review
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/cli/daemon.go`, and `internal/db/run.go` exceed 1,000 lines; no additional major defect was established from size alone
- dependency or lockfile changes: a new Go module and pinned `go.sum` are present with generated third-party notices; no new dependency defect was established in this round

## Tests Reviewed First

- behavior claimed by tests: gate transaction and hooks, authenticated admission and replay rejection, durable branch replacement and recovery, guarded publication, operator CLI and TUI behavior, installer/runtime distribution, identity scanning, and release packaging
- missing or misleading coverage: no test names or assertions cover `.operator-capability`, `.safety-dance-hook-capability`, detached same-user capability replay, capability omission, or a nested `git push safety-dance`; existing ancestry tests exercise the pre-repair session and argv heuristics only

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4052` in / `73` out

### Correctness

- assessment and evidence: `npm test` and focused race tests pass. The edd68a1 hook change is nevertheless internally inconsistent: pre-receive supplies the new capability at `tools/safety-dance/internal/git/hook.go:108-111`, while the ordinary post-receive path omits it at `tools/safety-dance/internal/git/hook.go:190-205`; authorization therefore still depends on the empty-capability ancestry fallback for normal notification. CR-416 and CR-417 describe the resulting requirement failures.
- helper coverage: covered, level 3, confidence 0.94

### Readability and Simplicity

- assessment and evidence: package ownership remains recognizable across the 241-file product diff, but `hookAuthorized` combines new-capability and legacy process-text policies in one branch at `tools/safety-dance/internal/daemon/admission.go:253-262`. The comment above `AuthorizeMutationPeer` still claims a kernel-authenticated daemon session at `tools/safety-dance/internal/daemon/admission.go:364-368` after edd68a1 removed that comparison, obscuring the live authority model.
- helper coverage: covered, level 2, confidence 0.51

### Architecture

- assessment and evidence: gate admission remains owned by `internal/daemon`, mutation handlers remain server-side, and GitHub ref normalization now occurs at the provider boundary. The remaining defect is architectural rather than cosmetic: both operator and hook authority are represented by same-user-readable bearer files, while validation agents execute under that same OS user and retain `HOME` at `tools/safety-dance/internal/agent/env.go:83-92`.
- helper coverage: covered, level 3, confidence 0.61

### Security

- assessment and evidence: CR-416 and CR-417 remain gate findings. The operator capability is stored below shared `SD_HOME` and automatically loaded by every client, and a valid hook capability returns before the ancestry scan that rejects `SD_PARENT_RUN_ID`.
- helper coverage: covered, level 3, confidence 0.89

### Performance

- assessment and evidence: no critical or major performance regression was established. Race tests cover daemon, IPC, Git, and SCM paths; branch managers retain keyed coordination and the reviewed authorization repair adds constant-size file reads rather than unbounded work.
- helper coverage: covered, level 3, confidence 0.50

## Verification Story

- command or inspection: `npm test`; `cd tools/safety-dance && go test -race ./internal/daemon ./internal/ipc ./internal/scm/github ./internal/git`; `git diff 9252050..edd68a1 --check`; direct inspection of edd68a1 and the complete diff against `origin/main`
- result: all commands exited 0; `npm test` reported 137 passing Node tests, the complete Go race suite, `go vet`, temporary binary build, local end-to-end checks, and 3 release tests. Passing checks do not exercise the two adversarial authorization paths.
- manual, screenshot, or before-and-after evidence: no screenshot was required for this trust-boundary repair; the current local end-to-end binary test passed, while native Windows, hosted release, and authorized live-provider execution remain unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-416 Operator capability remains recoverable by validation descendants

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/daemon.go:225`
- failure mode: a validation descendant can read the daemon bearer from the same user's runtime home, detach until its marker-bearing ancestors exit, clear its own marker, and invoke an authentic `safety-dance` mutation through a shell. The server then sees the expected bearer and an unmarked shell ancestry, so the child can start, respond to, abort, or stop daemon work despite the parent-run fence.
- evidence or reproduction: `serveDaemon` writes the bearer to `socket.operator-capability` at `tools/safety-dance/internal/cli/daemon.go:225-232`, and every IPC client automatically reads and submits it at `tools/safety-dance/internal/ipc/client.go:122-132,172-177`. Validation commands keep `HOME` at `tools/safety-dance/internal/agent/env.go:83-92`. After edd68a1, `AuthorizeMutationPeer` checks only currently visible environment ancestry, executable basename, and the presence of a process named like a shell at `tools/safety-dance/internal/daemon/admission.go:369-408`; no test covers detached capability replay.
- fix direction: use an operator authorization mechanism validation descendants cannot read, inherit, or reconstruct, and validate it at the mutation boundary. Add an adversarial integration test in which a marked validation parent exits before a detached descendant attempts every mutating RPC.

### CR-417 Hook capability bypasses the nested-run fence and preserves the old fallback

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:253`
- failure mode: a validation command can push to the local `safety-dance` remote even though its ancestry carries `SD_PARENT_RUN_ID`. The real pre-receive hook presents the per-gate capability, `hookAuthorized` returns before scanning ancestry, and the gate ref is accepted instead of rejecting the nested update. A direct same-user caller can also read both bearer files and invoke issue, admit, and notify, while a caller that omits the hook capability still reaches the original forgeable process-text fallback.
- evidence or reproduction: validation commands receive the parent marker at `tools/safety-dance/internal/cli/daemon.go:1019-1027`. The hook reads and forwards its gate file at `tools/safety-dance/internal/git/hook.go:44-47,108-111`, and `hookAuthorized` accepts a matching value without calling `managedHookPeer` at `tools/safety-dance/internal/daemon/admission.go:253-257`; that skipped scan is where `SD_PARENT_RUN_ID` is rejected at `tools/safety-dance/internal/daemon/admission.go:265-289`. The fallback at lines 258-260 still accepts an empty capability plus the old argv-based predicate, and the ordinary post-receive path omits `--hook-capability` at `tools/safety-dance/internal/git/hook.go:190-205`. No test attempts a nested gate push, direct bearer replay, or empty-capability spoof.
- fix direction: make nested-run rejection mandatory and independent of hook credential success, remove the empty-capability process-text fallback after an explicit repair/migration decision, and bind admission to proof a validation child cannot read or replay. Add adversarial tests for a marked process executing the real hook, direct issue/admit/notify calls with copied bearers, omitted capabilities, and repaired versus pre-capability gates.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: `CaptureTrustedOperatorSession`, `SetTrustedOperatorSession`, and the session helper files appear unused by production after edd68a1 removed daemon session capture and mutation comparison; confirm removal with the authorization redesign rather than deleting them independently
- dependency findings: no new dependency, lockfile, maintenance, license, or security finding was established in this round

## Verdict

- decision: request_changes
- overall code-health change: edd68a1 restores Windows/service startup and normalizes GitHub branch refs, but weakens the nested hook ancestry fence and does not establish operator authority inaccessible to validation descendants
- rationale: one critical and one major trust-boundary finding remain in behavior the plan explicitly requires; green aggregate tests do not cover either adversarial path

## Review Limits

- blocked or unavailable checks: native Windows startup and mutation, hosted `safety-dance-v*` release execution, and authorized live-provider behavior were not available; no pull request exists, so no PR title, body, or hosted CI result was reviewed
- residual manual verification: after fixes, exercise nested gate pushes and detached mutation attempts under the actual service manager on Unix and Windows
