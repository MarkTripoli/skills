---
type: code-review
date: 2026-09-21
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 36e483afdf3f458fdfcb1ae3810edcefdf8c8006
status: findings
summary: "The complete Safety Dance product change through 36e483a was reviewed against origin/main, including the f786ccc authorization repair and its tests. CR-416 and CR-417 remain open at the underlying same-user trust boundary, and eight additional critical- or major-severity defects affect validation isolation, accepted-head custody, publication recovery and replay, terminal status, documented operator commands, and newly orphaned authorization code. The next fix phase must close these boundaries and rerun the affected adversarial, lifecycle, and operator checks before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `36e483afdf3f458fdfcb1ae3810edcefdf8c8006`
- commits: 227 commits after the merge base, including 77 non-artifact commits
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: `.agents/tasks/i-want-to-take-4cf09814/**` except the selected task inputs; unrelated untracked `progress.md`

## Previous Round

- previous artifact: `.agents/tasks/i-want-to-take-4cf09814/132-code-review-safety-dance.md`
- CR-416 Operator capability remains recoverable by validation descendants: still open
- CR-417 Hook capability bypasses the nested-run fence and preserves the old fallback: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; independently branded, autonomous import of the referenced local Git gate
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; all six phases, trust boundaries, acceptance commands, and known limits were reviewed
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and changed-file conventions

## Change Profile

- intent and expected behavior: add the Safety Dance Go binary, authenticated local Git gate, durable branch-scoped validation and guarded publication, operator CLI/TUI, canonical skill distribution, identity enforcement, CI, and native release packaging
- change description quality: no pull request exists; task and plan explain motivation and decisions, while repair commit subjects identify the affected boundary but generally carry no explanatory body
- implementation model and review model: implementation model was not recorded in the selected receipts; review model `GPT-5.6 Sol`
- changed-line size and logical cohesion: 241 reviewed product files, 41,459 additions, and 4 deletions; the phased commits are logically grouped, but the combined trust-sensitive surface requires another fix round
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines; `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/db/run.go`, and `internal/cli/daemon.go` each exceed 1,100 lines. The findings below target concrete ownership failures rather than size alone.
- dependency or lockfile changes: new Go module and sums add Cobra, Bubble Tea/Lip Gloss, SQLite, YAML, terminal, and support dependencies; release archives regenerate third-party notices. No concrete dependency maintenance, license, or vulnerability defect was established locally.

## Tests Reviewed First

- behavior claimed by tests: the selected verification artifact records all nine repository checks and 28 locally decidable acceptance items passing at `49c6c2d`; the latest fix receipt records the focused daemon, Git, and IPC race suite plus the full Go suite, vet, and `npm test` passing at `f786ccc`
- missing or misleading coverage: no test detaches a validation descendant after its marked ancestors exit; no fault injection covers mirror or binding failure after a confirmed remote write; no test creates an accepted commit absent from the registered checkout; no test covers a second gate push while the upstream branch remains absent; no replay test changes the publication target; no cancellation race checks terminal compare-and-set behavior; and the documented response and root `--plain` commands are not exercised as written

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `6233` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 6233 in / 73 out`

### Correctness

- assessment and evidence: accepted commits can fail before durable run construction because `recordPush` checks custody in the gate but creates the worktree from the mutable registered checkout (`internal/cli/daemon.go:611-665`). Publication loses recovery state after a confirmed remote write (`internal/pipeline/steps/push.go:132-180`), absent upstream branches can be assigned a false prior head (`internal/cli/daemon.go:969-982`), replay ignores the current target (`internal/pipeline/steps/push.go:83-92`), and unconditional terminal writes can regress durable status (`internal/db/run.go:803-809`).
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: command and skill documentation omit required response coordinates and advertise a root flag that Cobra does not register (`tools/safety-dance/docs/cli.md:6-12`, `skills/delivery/safety-dance/references/commands.md:27-35`, `internal/cli/respond.go:11-31`, `internal/cli/root.go:62-67`). The old session-authority mechanism and general JSON-RPC capability fields remain after the replacement authorization removed their production use.
- helper coverage: covered, level 3, confidence 0.66

### Architecture

- assessment and evidence: validation code, the daemon, managed gates, credentials, operator checkouts, and linked Git worktrees all run under one OS principal. `Validate` executes repository code through a shell (`internal/pipeline/steps/validation.go:206-228`), keeps user-home and application-data paths (`internal/agent/env.go:79-92`), and uses linked worktrees (`internal/worktrees/ownership.go:50-87`), so process-text authorization cannot establish a boundary against that code.
- helper coverage: covered, level 3, confidence 0.81

### Security

- assessment and evidence: `AuthorizeMutationPeer` accepts mutable argv and environment ancestry (`internal/daemon/admission.go:361-417`); a detached validation descendant can clear its marker, supply a shell-looking parent, and call mutating RPCs. Managed-hook authorization combines the same forgeable ancestry with a reusable same-user file (`internal/daemon/admission.go:245-286`, `internal/git/hook.go:502-513`), so a detached child can issue a real local push or replay the hook path after marked ancestors exit.
- helper coverage: covered, level 3, confidence 0.87

### Performance

- assessment and evidence: the reviewed hot paths use keyed manager locks, bounded IPC frames, finite ancestry walks, and targeted run/head queries. No concrete N+1, unbounded work, blocking-async, pagination, or hot-allocation regression was established.
- helper coverage: unavailable

## Verification Story

- command or inspection: selected verification table; latest fix receipt; `go test -race ./internal/daemon ./internal/git ./internal/ipc`; `go vet ./...`; Windows `go build ./...` plus `go test -c` for daemon, IPC, CLI, and pipeline steps; `git diff --check`; direct execution of the two documented CLI forms
- result: focused race tests, vet, Windows compilation, and diff check passed. The documented response command failed because `--step-id` and `--generation` were absent, and `safety-dance --plain` failed as an unknown flag.
- manual, screenshot, or before-and-after evidence: no native Windows execution, hosted release, or live-provider evidence was available; the existing verification artifact records the local binary and SQLite observations at its pinned revision

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-418 Detached validation descendants can still mutate daemon state

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:361`
- failure mode: repository validation code can clear its marker, detach until the marked ancestor exits, create a shell-looking parent, and invoke the real `safety-dance` binary. The daemon then authorizes shutdown, fresh-run creation, response, and cancellation even though the caller descends from a validation run.
- evidence or reproduction: `AuthorizeMutationPeer` accepts a leaf named `safety-dance`, any shell-named ancestor, and the absence of `SD_PARENT_RUN_ID` in the surviving ancestry at lines 365-404. It no longer checks the kernel-session helper, and `session_authority.go` has no production caller. The new test at `internal/daemon/admission_test.go:310-338` keeps the marked ancestor alive, so it does not exercise the detached replay described by CR-416.
- fix direction: replace argv, environment, and same-user file authority with an operator credential or separately privileged broker unavailable to validation descendants; add a real detached-process test that attempts every mutating RPC after the marked parent exits

### CR-419 Managed-hook authorization remains replayable after detachment

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:245`
- failure mode: a validation descendant can read the reusable gate capability, detach and clear its marker, then perform a real `git push safety-dance` or construct hook and `git-receive-pack` argv ancestry. Token issuance and admission then accept an update initiated by nested validation code.
- evidence or reproduction: `hookAuthorized` now requires both `managedHookPeer` and the file value, but `managedHookPeer` proves origin only from process command text and mutable environment at lines 253-286. The capability is a same-user file created at `internal/git/hook.go:502-513`. The f786ccc test proves only that the capability alone is insufficient; it does not attempt a detached real push. CR-417's early return and empty-capability fallback are fixed, but its required non-replayable binding is not.
- fix direction: originate admission through a kernel-authenticated channel unavailable to repository code, make receive-operation handles single-use and bound to the actual gate update, and add detached nested-push plus forged-ancestry tests for issue, admit, revoke, and notify

### CR-420 Repository validation executes inside the operator trust domain

- type: Refactor suggestion
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:206`
- failure mode: code from an incoming commit runs with the operator's filesystem and network authority. It can read home-directory credentials, alter Safety Dance state and hook capabilities, modify the registered checkout through shared Git metadata, or exfiltrate data before any review gate blocks publication.
- evidence or reproduction: `Validate` runs the configured command through `sh -c` or `cmd.exe` at lines 219-228. `SafeEnvironment` preserves `HOME`, `USERPROFILE`, application-data paths, and `PATH` at `internal/agent/env.go:83-92`; the disposable checkout is a linked `git worktree` at `internal/worktrees/ownership.go:50-87`. Environment filtering removes variables but supplies no filesystem, process, or network isolation.
- fix direction: execute repository code and repository-reading agents under a separate unprivileged principal or sandbox with an allowlisted filesystem, independent disposable clone/object store, and denied network by default; keep daemon state and publication credentials behind narrow broker operations

### CR-421 Accepted-head custody is not used to create the run worktree

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:663`
- failure mode: a push from another clone can be accepted into the bare gate while its commit is absent from the checkout registered during setup. Deferred notification then fails to create the run worktree, so an authenticated accepted head never becomes a durable run despite remaining safely stored in the gate.
- evidence or reproduction: `recordPush` resolves and verifies `n.New` in `gatePath` at lines 611-637, but calls `CreateDetached` with `r.WorkingPath` at lines 659-665. `CreateDetached` runs `git -C <source> worktree add ... <head>` at `internal/worktrees/ownership.go:53-87`, so it cannot use an object that exists only in the gate.
- fix direction: create the detached worktree from the canonical gate that owns accepted-head custody, and test a push whose commit exists in the gate and pushing clone but not in the registered checkout

### CR-422 Post-push bookkeeping failure destroys publication recovery state

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/push.go:132`
- failure mode: after the remote is confirmed at the reviewed candidate, a transient gate-mirror or SQLite binding failure clears `push_active`; the executor then marks the run failed and schedules worktree cleanup. Restart recovery cannot distinguish the completed external write or resume reconciliation.
- evidence or reproduction: the unconditional defer clears publication ownership at lines 132-139, while mirror and binding can still fail at lines 167-180. The executor terminalizes failures at `internal/cli/daemon.go:246-263`, and `Manager.Recover` includes cancelled runs only while `push_active` remains true at `internal/daemon/manager.go:248-291`.
- fix direction: retain publication ownership and a recoverable status after the remote contains the candidate until mirror and binding both commit; add fault-injection tests for mirror and database failure through daemon restart and cleanup

### CR-423 A failed first push prevents later publication to an absent upstream branch

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:973`
- failure mode: if gate push A creates a branch but fails validation before publication, then push B advances that gate branch while the upstream branch is still absent, B is rejected during publication because the code pretends A is the verified upstream head.
- evidence or reproduction: `livePublicationHead` returns empty for an absent ref, but `executeRun` replaces that absence with `run.BaseSHA` at lines 973-976. `Push` then re-reads the still-empty upstream and rejects it against the nonempty expected SHA at `internal/pipeline/steps/push.go:37-44`.
- fix direction: preserve an absent upstream ref as an explicit verified state distinct from lookup failure and from the prior gate head; cover two successive accepted gate pushes before the first upstream publication

### CR-424 Publication replay ignores the bound target

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/push.go:83`
- failure mode: after a binding is recorded, changing the repository push URL before restart lets replay report publication success without proving the candidate exists at the newly selected target. Later pull-request and CI steps can operate against a branch that was never published there.
- evidence or reproduction: the replay shortcut checks only ref, candidate, and `verified_upstream` at lines 85-91. The final transaction stores `RepoID` and a target fingerprint at lines 177-180 and `internal/db/publications.go:41-61`, but replay compares neither with the current run and `req.Remote`.
- fix direction: require the publication's repository, target fingerprint, ref, candidate, and mirror identity to match the current request before accepting the receipt; test replay after changing the push URL

### CR-425 Error finalization can overwrite durable terminal truth

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/db/run.go:803`
- failure mode: a cancellation or another terminal transition can commit first, then a late executor error overwrites that terminal status because finalization updates by run ID alone. The durable record can report `failed` for a user-cancelled run or replace another terminal outcome.
- evidence or reproduction: `UpdateRunErrorStatus` has no expected-status predicate at lines 803-809. The cancel handler writes `cancelled` before cancelling and joining the live context at `internal/cli/daemon.go:445-467`, while the executor callback chooses a status from `ctx.Err()` and calls the unconditional update at lines 246-263.
- fix direction: compare-and-set error finalization only from legal nonterminal states and preserve any terminal state already committed; add a barrier-driven cancellation/finalization race test

### CR-426 Installed operator instructions contain commands that cannot run

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/safety-dance/references/commands.md:27`
- failure mode: an operator following the installed skill cannot submit a response because the documented command omits two required coordinates. The tool-local guide also tells scripts to use a root `--plain` flag that does not exist.
- evidence or reproduction: both command references show only `--step` and `--action` (`references/commands.md:27-35`, `tools/safety-dance/docs/cli.md:6`), while `newRespond` requires `--step-id` and `--generation` at `internal/cli/respond.go:11-31`. `NewRoot` registers no root `--plain` flag at `internal/cli/root.go:62-67`; direct execution returned `--step, --step-id, --generation, and --action are required` and `unknown flag: --plain`.
- fix direction: document every required response coordinate and where users obtain it, and either add the root flag to default dispatch or document `safety-dance tui --plain`; execute the published command examples in tests

### CR-427 The replaced authorization mechanism remains as task-created dead code

- type: Refactor suggestion
- severity: major
- category: Maintainability and code quality
- location: `tools/safety-dance/internal/daemon/session_authority.go:8`
- failure mode: the source tree presents a kernel-session authority and general JSON-RPC capability contract that production no longer captures, checks, sends, or validates. Future fixes can mistakenly rely on controls that are test-only or inert.
- evidence or reproduction: `CaptureTrustedOperatorSession`, `SetTrustedOperatorSession`, and `operatorSession` have no production caller; only `admission_test.go` calls the setter. `ipc.Request.Capability` and `ipc.Response.Capability` remain at `internal/ipc/protocol.go:44-60`, but the f786ccc client and server changes removed every use.
- fix direction: resolve CR-418 and CR-419 around one real authorization owner, then remove the unused session and general-capability paths or wire the chosen mechanism through production with adversarial tests

## Advisories

### ADV-001 Identity regression check ignores shipped path names

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `scripts/check-safety-dance-identity.mjs:43`
- evidence: the scanner applies retired-identity patterns only to file contents at lines 45-61. The current shipped paths are clean, but a future retired directory or filename passes when its contents contain no retired token.
- suggestion: scan normalized relative paths and add retired filename and directory fixtures

### ADV-002 Committed third-party notice omits a direct module

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `tools/safety-dance/THIRD_PARTY_NOTICES.md:5`
- evidence: the committed notice does not list direct dependency `github.com/toon-format/toon-go` from `go.mod`; release packaging regenerates a fresh notice, so archives are not proven affected.
- suggestion: regenerate the committed notice or state that it is a non-authoritative example

### ADV-003 Makefile declares the end-to-end target twice

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `tools/safety-dance/Makefile:15`
- evidence: consecutive `e2e:` declarations create one empty rule and one recipe-bearing rule.
- suggestion: remove the duplicate declaration

## Dead Code and Dependency Review

- newly orphaned code: `internal/daemon/session_authority.go`, its platform session helpers, and the general `ipc.Request` and `ipc.Response` capability fields became unused in production after the latest authorization replacement; CR-427 records the required cleanup or ownership decision
- dependency findings: no critical- or major-severity dependency, lockfile, maintenance, license, or vulnerability defect was established; ADV-002 covers the committed notice mismatch

## Verdict

- decision: request_changes
- overall code-health change: the change adds the requested product surface and broad automated coverage, but the current implementation weakens trust-domain isolation and leaves durable custody and publication invariants false on common failure paths
- rationale: three critical security boundaries and seven major correctness, data-integrity, operator-contract, or dead-code findings remain in the pinned scope

## Review Limits

- blocked or unavailable checks: native Windows behavior, hosted `safety-dance-v*` release execution, authorized live-provider behavior, and a pull-request title were unavailable. The axis helper returned `unclear` for performance, so that judgment was skipped and the axis was decided from the pinned diff.
- residual manual verification: after fixes, run adversarial detached-process and nested-push tests, cross-check native Windows IPC/service/hook behavior, inject post-push mirror and database failures across restart, exercise the external-clone custody case and absent-upstream two-push sequence, and execute every documented operator command
