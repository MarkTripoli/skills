---
type: code-review
date: 2026-09-21
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: e4e0ac3f9ef441849c4511abdb04603cfe7b411e
status: findings
summary: "The complete Safety Dance product change through e4e0ac3 was reviewed against origin/main, including the 4fbb85a boundary repairs. CR-421, CR-422, CR-424, CR-425, and CR-426 are fixed, but seven major findings remain: three same-user trust failures, an absent-ref publication race, orphaned authorization code, and missing full-path failure and Windows proof. The next fix phase must close these findings and add adversarial end-to-end coverage before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `e4e0ac3f9ef441849c4511abdb04603cfe7b411e`
- commits: 230 commits after the merge base, ending with `4fbb85a fix(safety-dance): close review boundary gaps` and `e4e0ac3 docs(task): code-review-fixes artifact`
- staged and unstaged changes: None.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: `.agents/tasks/**`, root `progress.md`, and the two base-only `origin/main` commits are outside the product review.

## Previous Round

- previous artifact: `.agents/tasks/i-want-to-take-4cf09814/134-code-review-safety-dance.md`
- CR-418 Detached validation descendants can still mutate daemon state: still open
- CR-419 Managed-hook authorization remains replayable after detachment: still open
- CR-420 Repository validation executes inside the operator trust domain: still open
- CR-421 Accepted-head custody is not used to create the run worktree: fixed
- CR-422 Post-push bookkeeping failure destroys publication recovery state: fixed
- CR-423 A failed first push prevents later publication to an absent upstream branch: still open
- CR-424 Publication replay ignores the bound target: fixed
- CR-425 Error finalization can overwrite durable terminal truth: fixed
- CR-426 Installed operator instructions contain commands that cannot run: fixed
- CR-427 The replaced authorization mechanism remains as task-created dead code: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently brand and fully fold the referenced local Git gate into this repository.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: Add the Safety Dance Go tool, authenticated local Git gate, durable branch runs, fixed validation pipeline, guarded publication, operator CLI and TUI, canonical agent skill, repository checks, and native release packaging.
- change description quality: No pull request exists. The task title is not a reviewable change description, but the plan, implementation receipts, and conventional commit subjects record behavior and motivation.
- implementation model and review model: The implementation model is not recorded. Review used GPT-5.6 Sol with focused implementation-review and code-path delegates on their configured models.
- changed-line size and logical cohesion: Excluding task history, 241 files add 41,501 lines and delete 4. The product is one cohesive imported Go module plus its distribution and release integration, but the scope is too large for a single ordinary review pass without component and end-to-end proofs.
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines; several agent, SCM, database, gate, Git, and daemon files exceed 1,000 lines. CR-432 records newly orphaned authorization code; no other major size-driven defect was established.
- dependency or lockfile changes: `tools/safety-dance/go.mod` and `go.sum` add the pinned Go dependency set. `THIRD_PARTY_NOTICES.md` now includes the direct `toon-go` dependency. No concrete license, maintenance, or lockfile defect was found.

## Tests Reviewed First

- behavior claimed by tests: The saved verification artifact records the Node aggregate, Go race suite, vet, build, identity scan, release contract, built-binary happy path, publication unit scenarios, and three aggregate reliability runs as passing. This review reran focused daemon, Git, IPC, publication, database, end-to-end race tests and `go vet ./...`; all passed.
- missing or misleading coverage: Failure scenarios in `internal/e2e/e2e_test.go` call isolated managers, runners, and push helpers rather than driving the generated hook, daemon, durable state, and upstream together. Both executable-hook and public-binary tests skip Windows, and CI runs only Ubuntu. The 4fbb85a gate-source fallback, replay mismatch, terminal-state predicate, identity-path scan, and absent-ref race have no focused regression tests.

## Five-Axis Assessment

- helper axis-coverage: unavailable
- helper provenance: `judge: unavailable: no answer within 20s`

### Correctness

- assessment and evidence: `queryPublicationHead` distinguishes an absent ref, but `executeRun` reduces that state to an empty `VerifiedHead`; `Push` then skips live-head comparison when the value is empty. CR-431 describes the resulting concurrent-ref creation race. CR-433 and CR-434 record required failure-path and Windows behavior that no full-path check proves.
- helper coverage: unavailable

### Readability and Simplicity

- assessment and evidence: The public flow is traceable from CLI and generated hooks through daemon admission, durable execution, and `steps.Publish`. The 4fbb85a repairs are localized, but the unused session-authority and generic capability paths leave two authorization models in the tree with only one active.
- helper coverage: unavailable

### Architecture

- assessment and evidence: Go runtime ownership, canonical skill distribution, and release integration follow the plan. Validation still shares the daemon operator principal, so the process-ancestry and hook-capability guards cannot form a trust boundary against repository code. CR-430 is the root architecture finding, while CR-428 and CR-429 name the exposed mutation paths.
- helper coverage: unavailable

### Security

- assessment and evidence: The socket authenticates the immediate same-user PID, but mutation and hook authorization then trust removable environment markers, command text, and a same-user capability file. Validation agents and configured commands retain operator filesystem and network authority. CR-428 through CR-430 remain open.
- helper coverage: unavailable

### Performance

- assessment and evidence: Branch locks are scoped by repository and ref, publication uses bounded recovery contexts, and reviewed paths contain no new unbounded query, loop, blocking-async, or hot-path allocation defect. The review found no performance-severity finding.
- helper coverage: unavailable

## Verification Story

- command or inspection: Read the complete task, selected artifacts, changed-file inventory, prior finding headings, 4fbb85a diff, current callers and tests; ran `go test -race ./internal/daemon ./internal/git ./internal/ipc ./internal/pipeline/steps ./internal/db ./internal/e2e && go vet ./...`, `node scripts/check-safety-dance-identity.mjs`, and product-only `git diff --check origin/main...HEAD -- . ':(exclude).agents/tasks/**'`.
- result: Focused Go tests, race checks, vet, identity scan, and product diff check passed. Passing checks do not exercise the detached same-user attacks, the absent-ref creation race, the planned full-path failure matrix, or Windows admission and publication.
- manual, screenshot, or before-and-after evidence: No interface change required screenshot evidence. Hosted release and live-provider evidence remain unavailable, as recorded by verification.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-428 Detached validation descendants can still mutate daemon state

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:366`
- failure mode: A validation child can clear `SD_PARENT_RUN_ID`, detach until marked ancestors exit, spawn a shell, and invoke a binary named `safety-dance`. `AuthorizeMutationPeer` then accepts mutable process text and permits shutdown, fresh-run, response, or cancellation RPCs.
- evidence or reproduction: Authorization requires only a matching leaf basename, any shell ancestor, and no marker in surviving ancestry at `admission.go:370-405`. The protected endpoints are at `internal/cli/daemon.go:333-473`. The immediate PID is kernel-authenticated, but ancestry command and environment state do not prove operator provenance.
- fix direction: Put mutating RPCs behind an operator authority unavailable to validation descendants, then add a real detached-process test covering shutdown, fresh-run, response, and cancellation.

### CR-429 Managed-hook authorization remains replayable after detachment

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:245`
- failure mode: Same-user validation code can read the persistent gate capability, remove its marker, and initiate a real local receive path whose hook and `git-receive-pack` command text satisfies `managedHookPeer`.
- evidence or reproduction: `hookAuthorized` combines process-text ancestry with `.safety-dance-hook-capability` at `admission.go:245-287`; the stable capability is stored mode `0600` under the same-user gate and reused by generated hooks at `internal/git/hook.go:45-48,82-111,135-155,502-513`. Existing tests keep marked ancestors alive or test only a copied capability without a real detached push.
- fix direction: Move receive admission behind a broker or principal unavailable to validation code and issue a single-use kernel-bound handle for the exact gate, ref, revisions, and receive operation. Prove rejection with a detached nested push.

### CR-430 Repository validation executes inside the operator trust domain

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:206`
- failure mode: Repository commands and tool-using agents run as the daemon user with access to operator files, process state, daemon storage, Git metadata, and the network. A malicious repository can bypass environmental fences or alter the state the gate is meant to protect.
- evidence or reproduction: Configured commands execute through `sh -c` or `cmd.exe` at `validation.go:215-228`. The environment filter retains `HOME`, application-data paths, and executable search paths at `internal/agent/env.go:82-91`; no filesystem, process, credential, or network isolation is applied. Agent subprocesses use the same worktree and principal.
- fix direction: Run repository code under a separate unprivileged principal or supported sandbox with an independent disposable clone, no daemon or publication credentials, and denied network by default. Use that boundary to close CR-428 and CR-429.

### CR-431 An initially absent upstream ref can change before publication

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/push.go:37`
- failure mode: If the upstream ref is absent during initial verification and another actor creates it before push, Safety Dance does not reject the changed remote. A fast-forward candidate can advance the newly created ref and publish against a state the run never verified.
- evidence or reproduction: `queryPublicationHead` returns a distinct absent state at `internal/cli/daemon.go:726-737`, but `executeRun` stores only `VerifiedHead == ""` at `daemon.go:994-1006`. `Push` compares the live head only when `VerifiedHead != ""` at `push.go:37-44`, then uses an ordinary unleased push at `push.go:50-58`. No test creates the ref between absent verification and push.
- fix direction: Preserve an explicit `VerifiedHeadExists` or equivalent state in `PushRequest`. Require the live ref to remain absent before a new-ref push, and add a race test where a competing actor creates the ref after verification.

### CR-432 Replaced authorization code remains orphaned

- type: Refactor suggestion
- severity: major
- category: Maintainability and code quality
- location: `tools/safety-dance/internal/daemon/session_authority.go:8`
- failure mode: The tree presents trusted operator sessions and generic RPC capabilities as security mechanisms even though production authorization never reads them. Future fixes can mistakenly depend on dead seams, and the task-created code has no runtime owner.
- evidence or reproduction: Production references do not call `CaptureTrustedOperatorSession` or `operatorSession`; only `admission_test.go:311-317` sets the session value. `ipc.Request` and `ipc.Response` retain unused generic `Capability` fields at `internal/ipc/protocol.go:44-60`, while hook RPCs use separate method-specific fields.
- fix direction: Delete the session-authority files and test setup plus unused generic RPC capability fields. Keep only the method-specific capability contract until CR-429 replaces it.

### CR-433 Planned failure scenarios do not cross the complete gate path

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/e2e/e2e_test.go:34`
- failure mode: Hook, IPC, daemon, durable-run, worktree, and publication integration can regress under validation failure, supersession, stale review, lease rejection, cancellation, or post-write recovery while the isolated component tests stay green.
- evidence or reproduction: The plan requires each scenario to use a temporary working repository, bare gate, and bare upstream through authenticated hooks (`05-plan-safety-dance.md:367-389`). Current failure tests directly call `pipeline.NewDurable`, `daemon.Manager.Replace`, `steps.Push`, or `steps.Publish` at `e2e_test.go:34-200`. Only `public_binary_test.go:17-169` drives the full product path, and it covers the happy path.
- fix direction: Extend the built-binary fixture to drive every promised failure and recovery scenario through generated hooks, the daemon, SQLite, worktree ownership, gate mirror, and upstream refs.

### CR-434 Windows admission and publication have no end-to-end proof

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/e2e/public_binary_test.go:19`
- failure mode: Released Windows binaries can fail at hook execution, named-pipe peer authentication, daemon service integration, or publication without any hosted check catching the regression.
- evidence or reproduction: The public-binary test skips Windows because generated hooks require `/bin/sh` at `public_binary_test.go:19-25`; executable hook admission also skips Windows and cites Unix IPC at `internal/daemon/hook_e2e_test.go:21-24`. `.github/workflows/tests.yml:12-25` runs only Ubuntu, while the release contract publishes Windows binaries.
- fix direction: Add a Windows CI job that builds the released binary and drives real Git-for-Windows hooks, local transport, daemon lifecycle, durable run creation, and guarded publication. If Windows is unsupported, remove its release targets and document that boundary instead.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: CR-432 covers the unused trusted-session implementation and generic RPC capability fields.
- dependency findings: Direct and indirect Go dependencies are pinned in `go.mod` and `go.sum`; the direct dependency notice omission from the prior round is fixed. No additional dependency finding was established.

## Verdict

- decision: request_changes
- overall code-health change: Safety Dance adds the intended cohesive product and the latest patch repairs accepted-head custody, post-push recovery, replay binding, terminal-state preservation, and operator documentation. The unresolved same-user boundary, publication race, orphaned security seams, and missing full-path platform proof keep the change below mergeable health.
- rationale: Seven major findings remain. Four are concrete security, data-integrity, or dead-code defects, and three required integration guarantees lack proof at the complete product boundary.

## Review Limits

- blocked or unavailable checks: Hosted `safety-dance-v*` release execution, authorized live-provider behavior, native Windows execution, and typed axis judgments were unavailable in this checkout.
- residual manual verification: After fixes, rerun the complete detached-process and detached-push attacks, absent-ref race, built-binary failure matrix, Windows product path, root aggregate, full Go race suite, vet, identity scan, and product diff check.
