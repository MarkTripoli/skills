---
type: code-review
date: 2026-09-21
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 83b537b91eb8a86f9c8fd8ec87f287599e298546
status: findings
summary: "The complete 41,104-line Safety Dance product diff was reviewed through 83b537b against origin/main. All four prior trust, recovery, evidence-confinement, and pull-request preservation findings remain open, and five additional major defects affect hook authorization, evidence memory use, GitHub Enterprise updates, Windows TUI sizing, and blocked-operation exit codes. The next fix round must close CR-392 through CR-400 and add focused platform and adversarial regressions before review repeats."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `83b537b91eb8a86f9c8fd8ec87f287599e298546`
- commits: 209 commits after the merge base, including product code through `f3ee0f7` and the latest fix receipt at HEAD.
- staged and unstaged changes: none.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: all `.agents/tasks/` history and unrelated untracked `progress.md`; the reviewed product scope is 236 files with 41,104 additions and 4 deletions.

## Previous Round

- previous artifact: `120-code-review-safety-dance.md`
- CR-388 Nested validation can relaunch the mutation CLI through an unmarked shell: still open
- CR-389 Restart recovery resumes after cleanup failures: still open
- CR-390 Evidence reads still permit ancestor replacement and Windows reparse traversal: still open
- CR-391 Pull-request body preservation has a lost-update window: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; acceptance contract in `05-plan-safety-dance.md`.
- implementation source: `05-plan-safety-dance.md`; latest implementation summary is `26-implementation-safety-dance.md`; latest fix receipt is `121-code-review-fixes-safety-dance.md`.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`.

## Change Profile

- intent and expected behavior: ship an independently branded local Git gate with authenticated admission, durable branch-scoped execution, fixed validation, guarded publication, operator interfaces, skill distribution, and native releases.
- change description quality: commit subjects identify the phased feature and review repairs; no pull request exists, so no title or body was available to review.
- implementation model and review model: implementation model was not recorded in the selected fix receipt; review used GPT-5.6 Sol at medium reasoning with focused child analyses.
- changed-line size and logical cohesion: 41,104 product lines across 236 files form one six-phase product addition, but this is far beyond the review guide's split signal and requires package-level ownership and tests to remain independently reviewable.
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines, `internal/scm/github/github.go` is 1,550 lines, `internal/agent/agent.go` is 1,353 lines, and `internal/cli/daemon.go` is 1,146 lines. No separate blocking structural defect was established beyond the findings below.
- dependency or lockfile changes: the new Go module and sums add the TUI, Cobra, YAML, SQLite, ULID, and platform dependencies. The release preflight runs pinned `govulncheck`; no called vulnerability was reported by the independent dependency pass.

## Tests Reviewed First

- behavior claimed by tests: admission, durable receipts, replacement, recovery, publication ordering, built-binary operation, installer distribution, identity scanning, releases, TUI rendering, and latest Unix confinement, signal-failure, and conditional-update parsing repairs.
- missing or misleading coverage: no test covers daemonized validation descendants, forged hook command arguments, failed CWD discovery, stale GitHub PATCH behavior, Windows reparse replacement, native Windows width detection, evidence size limits, GitHub Enterprise conditional-update routing, or blocked exit-code mapping.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5040` in / `73` out.
- helper provenance: `judge: model jev-1.13.0, tokens 5040 in / 73 out`

### Correctness

- assessment and evidence: the aggregate passes, but Windows terminal width always falls back to zero, nested-policy refusals map to the failed-run exit class, and GitHub Enterprise conditional updates omit host selection. These paths contradict the Phase 4 platform and stable-exit contracts.
- helper coverage: covered, level 3, confidence 0.94

### Readability and Simplicity

- assessment and evidence: package ownership is visible and the latest repairs reuse the admission, reaper, pipeline, and SCM owners. Several files exceed 1,000 lines, but the complete diff did not establish a separate major readability defect.
- helper coverage: covered, level 2, confidence 0.80

### Architecture

- assessment and evidence: durable state, pipeline execution, worktree ownership, and provider code have distinct packages. The blocking ownership defect is that strict recovery depends on a CWD lookup API that cannot report failure, so the recovery owner cannot enforce its fail-closed contract.
- helper coverage: covered, level 3, confidence 0.52

### Security

- assessment and evidence: process-ancestry authorization loses the validation marker after reparenting, hook authorization accepts forgeable argument basenames, Windows evidence opening retains a check/open race, and GitHub's PR PATCH does not provide the assumed compare-and-swap behavior.
- helper coverage: covered, level 3, confidence 0.89

### Performance

- assessment and evidence: evidence ingestion uses unbounded `io.ReadAll` on an agent-selected regular file in the shared daemon. One run can exhaust daemon memory and terminate unrelated runs.
- helper coverage: covered, level 2, confidence 0.62

## Verification Story

- command or inspection: `npm test`; `git diff --check 4458fbf...HEAD -- ':!.agents/tasks/**'`; complete diff and focused caller/test inspection.
- result: `npm test` passed with 137 Node tests, Go race tests, vet, a temporary binary build, local end-to-end tests, identity checks, and three release tests. Diff checking passed. Green checks do not exercise the nine failure paths below.
- manual, screenshot, or before-and-after evidence: no native Windows, hosted release, or authorized live-provider run exists; no pull request exists to exercise concurrent body updates.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-392 Reparenting still removes the validation marker from mutation authorization

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:352`
- failure mode: a validation child clears `SD_PARENT_RUN_ID`, daemonizes or double-forks until it is reparented to PID 1, then invokes the real `safety-dance` binary. `AuthorizeMutationPeer` sees a direct CLI with no marked ancestor and authorizes shutdown, run creation, response, or cancellation.
- evidence or reproduction: the authorization loop returns success when the current visible ancestry reaches PID 1 or its 256-hop limit at `admission.go:356-384`. The implementation itself documents that `setsid` descendants reparent to init and disappear from lineage at `internal/procreap/procreap.go:7-13`; the regression at `admission_test.go:286-309` covers only an intact three-process ancestry.
- fix direction: bind mutation authority to a daemon-issued top-level capability or an OS containment identity that validation descendants cannot shed. Fail closed on traversal exhaustion and add a daemonized-descendant regression.

### CR-393 Strict recovery treats failed CWD discovery as exclusive ownership

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/procreap/procreap.go:183`
- failure mode: daemon restart resumes a persisted run while a stale executor still owns the worktree because CWD inspection failed and the strict sweep reported success.
- evidence or reproduction: Linux drops every failed `/proc/<pid>/cwd` read at `internal/procreap/cwd_linux.go:12-20`; macOS returns an empty map when `lsof` is absent, times out, or fails at `internal/procreap/proc_unix.go:196-212`. `Sweep` interprets an empty match as success at `procreap.go:183-207`, `SweepRunWorktreeStrict` propagates only `Sweep` errors at `procreap.go:233-249`, and the new test covers signal failure only.
- fix direction: make CWD discovery return results plus errors or an explicit completeness verdict. Strict recovery must abort when any candidate cannot be inspected or the platform lookup fails, with regressions for missing, timed-out, and partially unreadable CWD data.

### CR-394 Windows evidence reads still race reparse-point replacement

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/evidence_open_windows.go:21`
- failure mode: a process controlling the worktree replaces an approved ancestor with a directory junction between validation and open, causing Safety Dance to read and publish a regular file outside both managed roots.
- evidence or reproduction: Windows calls `EvalSymlinks`, checks the resolved string, then separately calls `os.Open` at `evidence_open_windows.go:21-46`. The Unix implementation now pins every ancestor with descriptor-relative `openat` and `O_NOFOLLOW`; `pr_security_test.go` exercises only the platform-selected Unix path in this checkout. The latest fix receipt also records Windows proof as blocked.
- fix direction: walk Windows directory handles with reparse-point-safe flags, verify each opened component and final handle remains below the pinned root, and add a native Windows ancestor-replacement test before shipping the Windows archive.

### CR-395 GitHub pull-request PATCH does not supply the promised compare-and-swap

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/scm/github/github.go:369`
- failure mode: a concurrent authored PR-body edit can still be overwritten even though Safety Dance sends a stale `If-Match` value; the command may return 412 only after GitHub has applied the PATCH.
- evidence or reproduction: `PRContentConditionalUpdater` promises comparison and update in one operation at `internal/scm/host.go:344-349`, but the implementation performs GET, local comparison, and PATCH at `github.go:372-397`. GitHub CLI issue `cli/cli#7167` reproduces this endpoint updating the body with an outdated ETag, while GitHub documents conditional requests for GETs rather than this PATCH. `pr_conditional_test.go` checks only header parsing.
- fix direction: use a provider operation with a documented atomic version precondition. If GitHub exposes none, preserve authored content through a non-destructive evidence channel or serialize updates with a durable lease and post-write conflict reconciliation; add a provider fixture that proves a concurrent edit survives.

### CR-396 Managed-hook authorization accepts forgeable command arguments

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:241`
- failure mode: a same-user process can obtain a gate-bound token without running the requested gate's managed hook, then admit and notify a fabricated accepted receipt that starts validation work.
- evidence or reproduction: `commandHasExecutable` accepts any argument whose basename is `pre-receive` or `post-receive` at `admission.go:276-285`, and `isGitReceiveCommand` accepts `git-receive-pack` in any argument position at `admission.go:322-329`. `managedHookPeer` requires only those strings somewhere in the first 64 ancestors; it does not require the exact requested gate hook executable or authenticated receive process.
- fix direction: bind token issuance to an unforgeable hook capability installed for that gate, or verify executable identities and gate ownership from OS handles rather than argv. Remove basename fallbacks and add adversarial argv and reparenting tests.

### CR-397 Evidence ingestion can exhaust the shared daemon's memory

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/pipeline/steps/evidence_open_unix.go:35`
- failure mode: one validation run selects a very large or sparse regular file as evidence, and the shared daemon allocates the entire file, potentially terminating every active run.
- evidence or reproduction: both Unix and Windows readers call unbounded `io.ReadAll` at `evidence_open_unix.go:35` and `evidence_open_windows.go:46`. The path comes from persisted agent step activity parsed at `internal/pipeline/steps/pr.go:135-169`; regular-file validation does not impose a size limit.
- fix direction: define and enforce a maximum evidence size before allocation, use a limited reader or streaming copy, reject oversized files with a typed failure, and test the boundary on both platform implementations.

### CR-398 Windows TUI width detection disables compact rendering

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/tui/app.go:27`
- failure mode: the shipped Windows TUI cannot detect terminal width, returns width zero, and emits unwrapped content instead of the required compact view that keeps status, prompts, and controls visible.
- evidence or reproduction: `terminalWidth` always invokes `stty` at `app.go:27-48`; command failure returns zero. Width zero disables truncation and wrapping at `internal/tui/view.go:9-21`. Tests inject a width and CI runs only Ubuntu, while the release matrix publishes Windows.
- fix direction: use the native Windows console API or the existing terminal dependency for width on every platform, keep zero as a noninteractive fallback only, and add a native Windows compact-view test.

### CR-399 Nested-policy refusals use the failed-run exit code

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/root.go:46`
- failure mode: automation cannot distinguish a blocked nested mutation from a failed run because `SD_PARENT_RUN_ID=parent safety-dance init` exits 5 instead of the promised blocked class 6.
- evidence or reproduction: `nestedMutation` returns `nested Safety Dance run cannot mutate the parent run` at `root.go:71-74`; exit mapping assigns 6 only when the error contains `blocked` and otherwise falls through to 5 at `root.go:46-57`. Phase 4 requires stable distinct failed-run and blocked-run exit classes.
- fix direction: return a typed blocked error or explicit `ExitCodeError{Code: 6}` from policy fences and cover every nested mutation command with built-binary exit-code tests.

### CR-400 Conditional PR updates lose GitHub Enterprise host routing

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/scm/github/github.go:377`
- failure mode: evidence publication for an existing GitHub Enterprise pull request sends its API GET and PATCH to the default github.com host or fails against the wrong repository.
- evidence or reproduction: construction deliberately creates a host-prefixed repository slug for Enterprise at `internal/cli/daemon.go:744-752`. `UpdatePRIfUnchanged` strips that host from the endpoint and runs `gh api` without `--hostname` at `github.go:377-395`; unlike the other PR commands, this API path has neither `--repo` host routing nor an injected `GH_HOST`.
- fix direction: pass the resolved host explicitly to both `gh api` calls, preserve github.com behavior, and assert command arguments for GitHub Enterprise and SSH-host aliases.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none established.
- dependency findings: no blocking license, lockfile, or called-vulnerability finding; hosted release preflight remains the only `govulncheck` gate.

## Verdict

- decision: request_changes
- overall code-health change: the product adds coherent package ownership and broad tests, but unresolved authorization, restart, evidence, provider, and Windows contracts still cross trust and data-preservation boundaries.
- rationale: one critical and eight major findings remain. Passing aggregate checks do not cover these adversarial, provider, or platform paths.

## Review Limits

- blocked or unavailable checks: native Windows handle, service, and terminal behavior; authorized live-provider concurrency; hosted `safety-dance-v*` release execution; pull-request title and hosted Tests workflow.
- residual manual verification: run the Windows reparse and terminal-width regressions on a Windows runner, then exercise the provider fixture with a concurrent authored edit and GitHub Enterprise host before the next review.