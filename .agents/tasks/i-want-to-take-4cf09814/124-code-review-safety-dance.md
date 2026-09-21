---
type: code-review
date: 2026-09-21
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: c8f177314cb1ffebbc67c4141c416c7086accdff
status: findings
summary: "The complete 41,174-line Safety Dance product diff was reviewed through c8f1773 against origin/main. Four prior authorization, recovery, and Windows confinement defects remain open, and the latest GitHub repair introduces a fifth major failure that blocks evidence publication to every existing GitHub pull request. The next fix round must close CR-401 through CR-405 with adversarial, provider, and native-platform regressions before review repeats."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `c8f177314cb1ffebbc67c4141c416c7086accdff`
- commits: 212 commits after the merge base, including the latest product repair at `740019f` and its fix receipt at HEAD.
- staged and unstaged changes: none.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: all `.agents/tasks/` history and unrelated untracked `progress.md`; the reviewed product scope is 236 files with 41,174 additions and 4 deletions.

## Previous Round

- previous artifact: `122-code-review-safety-dance.md`
- CR-392 Reparenting still removes the validation marker from mutation authorization: still open
- CR-393 Strict recovery treats failed CWD discovery as exclusive ownership: still open
- CR-394 Windows evidence reads still race reparse-point replacement: still open
- CR-395 GitHub pull-request PATCH does not supply the promised compare-and-swap: fixed
- CR-396 Managed-hook authorization accepts forgeable command arguments: still open
- CR-397 Evidence ingestion can exhaust the shared daemon's memory: fixed
- CR-398 Windows TUI width detection disables compact rendering: fixed
- CR-399 Nested-policy refusals use the failed-run exit code: fixed
- CR-400 Conditional PR updates lose GitHub Enterprise host routing: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; acceptance contract in `05-plan-safety-dance.md`.
- implementation source: `05-plan-safety-dance.md`; latest implementation summary is `26-implementation-safety-dance.md`; latest fix receipt is `123-code-review-fixes-safety-dance.md`.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`.

## Change Profile

- intent and expected behavior: ship an independently branded local Git gate with authenticated admission, durable branch-scoped execution, fixed validation, guarded publication, operator interfaces, skill distribution, and native releases.
- change description quality: commit subjects identify the phased feature and review repairs; no pull request exists, so no title or body was available to review.
- implementation model and review model: the implementation model was not recorded in the selected fix receipt; review used GPT-5.6 Sol at medium reasoning with four focused child analyses.
- changed-line size and logical cohesion: 41,174 product lines across 236 files form one six-phase product addition. The change remains far beyond the review guide's split signal, so package ownership and trust-boundary tests carry the review burden.
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/cli/daemon.go`, and `internal/db/run.go` exceed 1,000 lines. No separate blocking structural defect was established beyond the findings below.
- dependency or lockfile changes: the complete branch adds the Go module and its pinned dependencies. Commit `740019f` adds no dependency or lockfile change and reuses the existing `charmbracelet/x/term` dependency.

## Tests Reviewed First

- behavior claimed by tests: authenticated admission, durable execution and recovery, guarded publication, bounded evidence reads, CLI exit classes, GitHub parsing, TUI rendering, identity checks, runtime installation, and native release contracts.
- missing or misleading coverage: commit `740019f` changes twelve product files but adds no focused regression test. Current tests do not exercise daemonized validation descendants, forged absolute or relative hook argv, the strict preflight-to-sweep race, Windows managed-root replacement, an existing GitHub pull request with evidence, or native Windows handle behavior.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4460` in / `73` out.
- helper provenance: `judge: model jev-1.13.0, tokens 4460 in / 73 out`

### Correctness

- assessment and evidence: `npm test` passes, but an existing GitHub pull request with recorded evidence always reaches `UpdatePRIfUnchanged`, which now returns an error after its read even when the body is unchanged. Strict recovery also validates one process snapshot and then sweeps with a second best-effort snapshot, so it still cannot establish exclusive worktree ownership.
- helper coverage: covered, level 3, confidence 0.96

### Readability and Simplicity

- assessment and evidence: package boundaries remain visible, but the GitHub repair leaves an unreachable PATCH implementation in a block comment at `internal/scm/github/github.go:397-404` and retains an ETag parser for an operation that now refuses every write. These are symptoms of the blocking incomplete repair recorded below rather than a separate finding.
- helper coverage: covered, level 2, confidence 0.60

### Architecture

- assessment and evidence: daemon admission, process reaping, evidence confinement, provider integration, and CLI policy have distinct owners. The remaining defects sit inside those owners: authorization relies on mutable process metadata, strict recovery discards its authoritative inspection, and GitHub exposes a conditional-update interface it cannot implement.
- helper coverage: `unavailable`

### Security

- assessment and evidence: a validation descendant can daemonize past the marked ancestor, managed-hook authorization still trusts forgeable argv fields, and Windows evidence confinement opens the candidate before independently reopening the mutable root path. These preserve the prior mutation and external-file disclosure paths.
- helper coverage: covered, level 3, confidence 0.87

### Performance

- assessment and evidence: Unix and Windows evidence readers now cap retained content at 16 MiB with `io.LimitReader`, closing the prior shared-daemon allocation issue. No new critical or major hot-path, query, loop, render, or allocation defect was established in the complete diff.
- helper coverage: covered, level 3, confidence 0.67

## Verification Story

- command or inspection: `npm test`; `git diff --check 4458fbf...HEAD -- ':!.agents/tasks/**'`; complete diff inspection; focused caller and test tracing for the nine prior findings and latest repair.
- result: `npm test` passed with 137 Node tests, Go race tests, vet, temporary binary build, local end-to-end tests, identity scanning, and three release tests. Diff checking passed. The green suite does not exercise the five failure paths below.
- manual, screenshot, or before-and-after evidence: no native Windows adversarial run, hosted release, authorized live-provider run, or pull request exists. The GitHub existing-PR failure and authorization defects were established from unconditional control flow and caller tracing.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-401 Daemonized validation descendants still regain mutation authority

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:346`
- failure mode: a validation child clears `SD_PARENT_RUN_ID`, daemonizes until the marked ancestor is no longer visible, and invokes the real `safety-dance` binary. The daemon authorizes that direct child after its remaining ancestry reaches PID 1, permitting parent-run mutation.
- evidence or reproduction: `AuthorizeMutationPeer` rejects only markers found in the currently visible ancestry at lines 350-378 and returns success when that truncated ancestry reaches PID 1 at lines 379-382. The repair adds fail-closed traversal exhaustion but does not add a capability or containment identity that survives reparenting; `123-code-review-fixes-safety-dance.md` records this case as blocked.
- fix direction: bind top-level mutation authority to a daemon-issued capability or OS containment identity that a validation descendant cannot shed, and add a daemonized-descendant built-binary regression.

### CR-402 Strict recovery discards its complete inspection before the actual sweep

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/procreap/procreap.go:251`
- failure mode: strict recovery can resume a persisted run while a stale executor still owns the worktree because the completeness-checked snapshot is discarded and `Sweep` repeats process and CWD discovery through the best-effort API.
- evidence or reproduction: `SweepRunWorktreeStrict` ignores the map returned by `processCWDsStrictFunc` at lines 241-253, then calls `Sweep` at lines 254-259. `Sweep` lists processes again and uses `processCWDsFunc`, whose missing entries are accepted as no match. On non-Linux Unix, `processCWDsStrict` also calls `lsofCWDs` twice and never requires a result for every candidate at `cwd_other_unix.go:19-29`.
- fix direction: perform matching and termination from one completeness-checked process/CWD snapshot, then verify every selected victim is dead. Return an error for incomplete lookup and add regressions for missing entries, lookup failure, and a process change between preflight and sweep.

### CR-403 Windows evidence confinement still compares handles opened across a mutable-root race

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/evidence_open_windows.go:25`
- failure mode: a same-user validation process replaces the managed root or an ancestor between the candidate open and the root open. Both handles can then resolve under the attacker's replacement, allowing an outside regular file to pass the relative-path check and enter published evidence.
- evidence or reproduction: the code opens `candidate` first at lines 25-30, then independently opens `root` at line 36, and compares only the two final path strings at lines 35-50. It never pins the approved root before traversing the candidate. Cross-compilation proves syntax only, and no native Windows root-replacement test exists.
- fix direction: open and validate the managed root handle first, traverse components relative to that pinned handle with reparse-safe flags, verify the final handle remains below the same root identity, and add a native Windows replacement regression.

### CR-404 Managed-hook admission still trusts forgeable argv ancestry

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:247`
- failure mode: a same-user process can construct an ancestry whose command lines contain the requested gate hook path and whose ancestor argv starts with `git-receive-pack`, then obtain a gate-bound token and fabricate an accepted receipt without executing the managed hook or authenticated receive process.
- evidence or reproduction: `managedHookPeer` sets its two booleans solely from parsed command strings at lines 247-268. `commandHasExecutable` accepts the expected path in any argv field at lines 276-283, the expected set still includes relative `hooks/pre-receive` and `hooks/post-receive`, and `isGitReceiveCommand` checks only the first parsed basename at lines 318-325. The new `SD_MANAGED_HOOK` environment value is set by generated hooks but is not authenticated or consumed by this authorization path.
- fix direction: bind token issuance to a per-gate unforgeable capability or verify executable and gate identities through OS handles and receive-process provenance. Remove relative argv fallbacks and add adversarial ancestry tests that use the exact expected strings without executing the managed hook.

### CR-405 Existing GitHub pull requests can no longer receive evidence

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/scm/github/github.go:371`
- failure mode: any run that finds an existing GitHub pull request and has evidence fails its PR step, even when nobody changed the body, so retries and subsequent branch pushes cannot complete evidence publication.
- evidence or reproduction: `pr.go:52-99` routes every existing PR with non-empty rendered evidence through `UpdatePRIfUnchanged`. The GitHub implementation reads and compares the body, then unconditionally returns `github pull-request update cannot guarantee atomic conditional write` at `github.go:393-396`; no write path remains. Current tests cover only response parsing and never call this method through the existing-PR path.
- fix direction: publish Safety Dance evidence through a non-destructive GitHub surface, or implement a documented atomic provider operation. Preserve authored content, remove the dead PATCH block, and add an existing-PR provider fixture that proves the step succeeds while a concurrent authored edit survives.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: the commented PATCH block at `internal/scm/github/github.go:397-404` and its now-unused conditional-write ETag semantics are task-caused remnants of the incomplete CR-395 repair; CR-405 requires their removal or replacement.
- dependency findings: no new dependency or lockfile change appears in `740019f`; the complete branch's pinned module passed the aggregate race, vet, build, identity, and release-contract checks.

## Verdict

- decision: request_changes
- overall code-health change: the latest repair bounds evidence memory, restores native terminal sizing, maps blocked exits, and routes GitHub Enterprise reads, but it leaves four trust-boundary defects and disables an existing-PR publication path.
- rationale: one critical and four major findings remain. Passing aggregate checks do not cover daemonized authorization, forged process metadata, strict recovery races, native Windows root replacement, or existing GitHub pull requests with evidence.

## Review Limits

- blocked or unavailable checks: native Windows reparse and service behavior; authorized live-provider concurrency; hosted `safety-dance-v*` release execution; pull-request title and hosted Tests workflow.
- helper judgment limit: architecture returned `unclear`, so its helper coverage is recorded as unavailable and the architecture assessment was decided from the pinned diff.
- residual manual verification: run native Windows root-replacement coverage, exercise daemonized and forged-argv callers against the built binary, and execute an existing GitHub pull-request evidence update fixture before the next review.
