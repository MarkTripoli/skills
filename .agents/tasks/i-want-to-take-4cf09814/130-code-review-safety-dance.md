---
type: code-review
date: 2026-09-21
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 925205016931a21175d779ea5ef4b6a6b7fa6de4
status: findings
summary: "The complete 240-file product diff at 9252050 has four major findings: mutation authorization remains bypassable, hook provenance remains forgeable, the new session gate disables supported Windows and service-managed operation, and full Git refs are passed to GitHub's branch-only pull-request interface. The next fix round must replace both authorization heuristics, preserve operator control across supported daemon launch modes, and normalize branch refs only at the provider boundary."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `925205016931a21175d779ea5ef4b6a6b7fa6de4`
- commits: 221 commits on `safety-dance` after the merge base; the latest product commit is `44c4f52` (`fix(safety-dance): bind mutations to trusted sessions`).
- staged and unstaged changes: none.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: tracked task artifacts, the two task-owned untracked directories, and untracked `progress.md`. The reviewed product scope is 240 files with 41,372 additions and 4 deletions. `origin/main` is two commits ahead, and `git merge-tree --write-tree origin/main HEAD` completed without a conflict.

## Previous Round

- previous artifact: `.agents/tasks/i-want-to-take-4cf09814/128-code-review-safety-dance.md`
- CR-409 Process-session equality does not prove operator authority: still open
- CR-410 Managed-hook admission still trusts forgeable argv: still open
- CR-411 Windows evidence test does not exercise the replacement race: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced local Git gate under the independent Safety Dance identity with no product references to the source repository.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; the plan requires authenticated admission, durable branch-scoped runs, guarded publication, service-managed operation, provider pull requests, Windows support, and repository-native skill distribution.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md` apply. The task artifacts remain committed history, product code uses existing install/build owners, and offline checks must not require provider credentials.

## Change Profile

- intent and expected behavior: add the Safety Dance Go tool, daemon, authenticated local gate, durable pipeline, guarded publication, operator CLI/TUI, canonical skill, installer integration, identity enforcement, CI, and native release packaging.
- change description quality: commit subjects identify each implementation and repair slice; no pull request exists, so no title or body could be reviewed. The latest fix receipt accurately records that managed-hook provenance and native Windows execution remain blocked.
- implementation model and review model: implementation model is not recorded; review model is GPT-5.6 Sol with focused implementation-review workers on authorization, Windows path confinement, and complete-scope plan deviations.
- changed-line size and logical cohesion: 240 product files and 41,372 added lines form one new subsystem plus its distribution surface. The six plan phases provide logical slices, but the total scope requires package-level and trust-boundary review rather than one local diff pass.
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/cli/daemon.go`, and `internal/db/run.go` exceed 1,000 lines. No additional critical or major defect was attributed only to file size.
- dependency or lockfile changes: the new Go module and pinned `go.sum` are task-owned. Current Go tests and vet pass; no dependency-specific critical or major finding was confirmed.

## Tests Reviewed First

- behavior claimed by tests: the saved verification artifact records all local repository checks and 28 locally decidable acceptance items as passing at `49c6c2d`. The latest fix receipt records passing daemon and pipeline race tests, the full Go suite, vet, local end-to-end execution, and Windows cross-compilation.
- missing or misleading coverage: no test authorizes a mutation from a different Unix session against a service-started daemon; no native Windows test starts the daemon; managed-hook tests accept mocked ancestry command strings without proving Git launched the hook; provider tests do not assert conversion from `refs/heads/<name>` to GitHub's branch-name input.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4411` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 4411 in / 73 out`

### Correctness

- assessment and evidence: current focused Go tests pass, and the Windows evidence replacement test now changes an intermediate directory after the root handle is pinned. CR-414 prevents supported daemon launch modes from accepting mutations, and CR-415 sends the wrong branch representation to pull-request operations.
- helper coverage: covered, level 3, confidence 0.88

### Readability and Simplicity

- assessment and evidence: full refs are named and retained consistently as internal coordination identities at `tools/safety-dance/internal/cli/daemon.go:631-634`. The missing provider-boundary conversion at `tools/safety-dance/internal/pipeline/steps/pr.go:52-68` makes that otherwise explicit invariant leak into a branch-only interface. No separate major readability finding was confirmed.
- helper coverage: covered, level 2, confidence 0.85

### Architecture

- assessment and evidence: daemon admission owns mutation and receive-hook authorization, which is the responsible layer. Its current session and argv heuristics cannot represent either operator authority or durable service ownership, producing CR-412 through CR-414. Publication ordering and branch-scoped coordination remain in their planned owners.
- helper coverage: covered, level 2, confidence 0.60

### Security

- assessment and evidence: CR-412 permits a validation descendant to retain the daemon's session while shedding marked ancestry, and CR-413 treats caller-controlled command text as managed-hook provenance. Both cross explicit control boundaries without an unforgeable capability.
- helper coverage: covered, level 3, confidence 0.87

### Performance

- assessment and evidence: the changed daemon reconciliation loop snapshots pending receipts before external work, branch coordination uses keyed ownership, evidence reads are bounded to 16 MiB, and no unbounded hot-path or critical/major performance regression was confirmed in the reviewed scope.
- helper coverage: covered, level 3, confidence 0.77

## Verification Story

- command or inspection: `git diff --name-status 4458fbf...HEAD`, `git diff --numstat 4458fbf...HEAD`, `git merge-tree --write-tree origin/main HEAD`, `cd tools/safety-dance && go test -race ./internal/daemon ./internal/pipeline/steps`, `go test ./...`, `go vet ./...`, and Windows cross-compilation of `./internal/pipeline/steps`.
- result: the current base merges without textual conflict; focused race tests, the full Go suite, vet, and Windows cross-compilation passed. Static tracing confirmed the four findings below.
- manual, screenshot, or before-and-after evidence: the saved verification artifact proves the built-binary local gate flow and aggregate checks. Native Windows daemon execution, hosted releases, live provider behavior, and a pull-request title remain unavailable.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-412 Session membership still does not prove operator authority

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:352`
- failure mode: a validation descendant can retain the daemon's Unix session, reparent after its marked ancestors exit, clear its own marker, and invoke `safety-dance` through a shell. The peer then shares the captured session and its visible ancestry contains neither `SD_PARENT_RUN_ID` nor the original validation process, so a nested run can mutate daemon state.
- evidence or reproduction: `CaptureTrustedOperatorSession` records the daemon's inherited session at `tools/safety-dance/internal/daemon/session_authority.go:28-37`. `AuthorizeMutationPeer` accepts session equality plus unmarked process-table ancestry and any shell ancestor at `tools/safety-dance/internal/daemon/admission.go:352-399`; session membership is inherited and remains intact across reparenting. The regression test at `tools/safety-dance/internal/daemon/admission_test.go:293-321` covers only a still-visible marked ancestor.
- fix direction: replace session membership with an unforgeable, operator-scoped capability or equivalent OS-backed authorization that validation descendants cannot inherit, reconstruct, read, or request. Add an adversarial test whose marked parent exits before the descendant invokes a mutation.

### CR-413 Managed-hook admission still trusts forgeable argv

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:241`
- failure mode: a same-user process can construct ancestry whose command text contains the expected managed-hook path and `git-receive-pack`, obtain a push token, and present it to admission without Git launching the installed hook.
- evidence or reproduction: `managedHookPeer` accepts path and executable-name matches from `processInfoFunc` at `tools/safety-dance/internal/daemon/admission.go:241-268`; Unix `processInfo` supplies `ps -o command=` text at `tools/safety-dance/internal/daemon/processinfo_unix.go:12-25`. `issue` relies only on that predicate before minting the token at `tools/safety-dance/internal/daemon/admission.go:413-429`, while the test at `tools/safety-dance/internal/daemon/admission_test.go:250-290` supplies matching strings rather than an OS-backed receive transaction.
- fix direction: bind issuance to a daemon-issued capability or equivalent OS-backed proof created for the actual receive transaction. Add an adversarial descendant test that supplies the exact managed paths in argv and must be rejected.

### CR-414 Trusted-session capture disables supported daemon launch modes

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/session_windows.go:5`
- failure mode: every Windows daemon exits during startup because the Windows session lookup always reports unavailable. On Unix, a daemon launched by launchd or systemd records the service's session, so interactive `run`, `respond`, `abort`, and authenticated shutdown calls from another terminal session are rejected.
- evidence or reproduction: Windows `processSessionID` always returns `(0, false)` at `tools/safety-dance/internal/daemon/session_windows.go:5-8`, and `serveDaemon` treats failed capture as fatal at `tools/safety-dance/internal/cli/daemon.go:216-222`. The service definitions launch `daemon serve` independently at `tools/safety-dance/internal/daemon/service.go:80-89`, while every mutation requires equality with that daemon session at `tools/safety-dance/internal/daemon/admission.go:352-359`. Existing service tests inspect definitions and mocked lifecycle commands but never mutate a service-started daemon.
- fix direction: implement platform-specific operator authorization that works for scheduled Windows tasks and Unix user services without equating authorization to one terminal session. Add native Windows startup/mutation coverage and a Unix integration test that mutates a daemon from a different session than its service process.

### CR-415 Pull-request operations receive a full Git ref instead of a branch name

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/pr.go:52`
- failure mode: an ordinary accepted push stores `refs/heads/main` as the run branch, then passes that full ref to `gh pr list --head` and `gh pr create --head`. GitHub's pull-request interface expects a branch name, so lookup can miss an existing pull request and creation can fail or target an invalid head.
- evidence or reproduction: `recordPush` deliberately stores `n.Ref` unchanged at `tools/safety-dance/internal/cli/daemon.go:631-634`. `PR` passes `run.Branch` unchanged to `FindPR` and `CreatePR` at `tools/safety-dance/internal/pipeline/steps/pr.go:52-68`; the GitHub adapter forwards it at `tools/safety-dance/internal/scm/github/github.go:239-250,328-336`. The built-binary fake accepts `gh pr` invocations without checking `--head`, so the local end-to-end pass does not cover the provider contract.
- fix direction: retain the canonical full ref for internal coordination, but require a `refs/heads/` ref and strip that prefix at the SCM boundary. Reject tags and other ref namespaces for pull-request creation, and assert exact `gh --head` arguments in provider tests.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none confirmed.
- dependency findings: the new Go dependency set is pinned in `go.sum`; current tests and vet passed, and no concrete maintenance, license, or security defect was confirmed from the diff.

## Verdict

- decision: request_changes
- overall code-health change: the branch adds the requested subsystem and extensive local proof, but four major trust-boundary and provider-integration defects keep supported flows from being safe and complete.
- rationale: the review gate remains open because session and argv heuristics are forgeable, session capture breaks Windows and service-managed operation, and pull-request creation receives an incompatible ref representation.

## Review Limits

- blocked or unavailable checks: native Windows execution, hosted `safety-dance-v*` release execution, authorized live-provider behavior, and pull-request title review were unavailable.
- residual manual verification: after repair, run the Windows daemon and replacement-race tests natively, exercise a service-started daemon from a separate terminal session, and inspect a real or contract-accurate GitHub pull-request request.
