---
type: code-review
date: 2026-09-21
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: cf0eb586d6fd3b02e45b09c3919d894a9b1cb2a3
status: findings
summary: "The complete Safety Dance product diff was reviewed through cf0eb58 against origin/main. CR-406 through CR-408 remain open: process-session matching does not establish operator authority, managed-hook authorization still trusts caller-controlled argv, and the Windows test neither exercises nor runs the required reparse-point replacement race. The next fix round must replace the two forgeable authorization proofs and add executed native Windows race coverage."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` from `git merge-base origin/main HEAD`
- reviewed HEAD: `cf0eb586d6fd3b02e45b09c3919d894a9b1cb2a3`; latest product commit `fca4597`
- commits: 218 commits after the merge base; `origin/main` is two commits ahead, and `git merge-tree --write-tree HEAD origin/main` completed without conflicts
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the unrelated untracked `progress.md`; none is a product review subject

## Previous Round

- previous artifact: `.agents/tasks/i-want-to-take-4cf09814/126-code-review-safety-dance.md`
- CR-406 Daemonized validation descendants can regain mutation authority: still open
- CR-407 Managed-hook admission trusts a forgeable environment marker: still open
- CR-408 Windows evidence confinement lacks native reparse-point proof: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate as independently branded Safety Dance without source-product references outside the required legal notice
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`, with current repair receipt `.agents/tasks/i-want-to-take-4cf09814/127-code-review-fixes-safety-dance.md`
- repository instructions: root and worktree `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add an authenticated local Git gate, durable branch runs, isolated validation, guarded publication, operator interfaces, canonical skill distribution, and native releases under the Safety Dance identity
- change description quality: all 218 commit subjects pass `npm run check-commits -- origin/main..HEAD`; no pull request exists, so no title or body is available to review
- implementation model and review model: implementation model not recorded; review model GPT-5.6 Sol
- changed-line size and logical cohesion: 239 product files, 41,317 additions, and 4 deletions; repair commit `fca4597` changes 98 lines across seven product files within mutation authorization, hook authorization, and Windows evidence testing
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines, `internal/scm/github/github.go` is 1,563 lines, and `internal/agent/agent.go` is 1,353 lines; no new critical or major defect was tied to size
- dependency or lockfile changes: the imported Go module and pinned `go.sum` remain part of the reviewed product; repair commit `fca4597` changes no dependency or lockfile

## Tests Reviewed First

- behavior claimed by tests: verification records every locally decidable plan item passing at `49c6c2d`; the current repair receipt records the aggregate, focused race packages, vet, end-to-end target, and Windows cross-compilation passing at `fca4597`
- missing or misleading coverage: `admission_test.go` has no daemonized descendant test and treats a hook path in an ancestry command string as sufficient provenance. `evidence_open_windows_test.go` creates a junction before the read, may skip, does not replace a root or intermediate path during the open sequence, and has not run on Windows.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3900` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 3900 in / 73 out`

### Correctness

- assessment and evidence: the repair compiles and focused host tests pass, but its tests do not reproduce the three prior failure modes. The Windows regression is a static pre-existing junction case rather than the required root or intermediate replacement race.
- helper coverage: covered, level 3, confidence 0.87

### Readability and Simplicity

- assessment and evidence: the repair removes the obsolete environment-marker helper and keeps platform session lookup in build-tagged files. The comments claim an operator session and fail-closed Windows behavior that the control flow does not implement, which obscures the authorization weakness at `internal/daemon/admission.go:392-397` and `internal/daemon/session_windows.go:5-8`.
- helper coverage: covered, level 2, confidence 0.56

### Architecture

- assessment and evidence: admission remains owned by `internal/daemon`, hooks by `internal/git`, and evidence confinement by `internal/pipeline/steps`. Both authorization boundaries still derive authority from metadata the untrusted same-user process chooses, rather than a daemon-issued capability or trusted kernel identity captured before validation starts.
- helper coverage: covered, level 3, confidence 0.50

### Security

- assessment and evidence: a validation descendant can create its own process session, spawn a shell and the CLI in that same session, and satisfy the new equality check because it is not compared with a trusted operator session. A process below `git-receive-pack` can still put the expected hook path in its argv and satisfy hook-only authorization. Native Windows evidence confinement remains unproved against the stated replacement race.
- helper coverage: covered, level 3, confidence 0.96

### Performance

- assessment and evidence: the repair adds two bounded process-session lookups per mutation request, removes process-environment reads from the hook-provenance decision, and adds no loop, query, network request, or hot-path allocation. No critical or major performance regression was found.
- helper coverage: covered, level 3, confidence 0.89

## Verification Story

- command or inspection: `npm run check-commits -- origin/main..HEAD`; `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git ./internal/pipeline/steps && go vet ./...`; Windows pipeline-step test cross-compilation; Darwin daemon test cross-compilation; `git merge-tree --write-tree HEAD origin/main`; repair and complete product-diff inspection
- result: commit checks passed all 218 subjects; focused race tests and vet passed after one concurrent-run socket collision cleared; Windows and Darwin test binaries cross-compiled; the current branch and moved merge target merge without conflicts
- manual, screenshot, or before-and-after evidence: no native Windows execution, hosted product release, authorized live-provider run, pull request, or screenshot was available

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-409 Process-session equality does not prove operator authority

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:343-398`
- failure mode: validation code can clear `SD_PARENT_RUN_ID`, create or retain any process session, spawn a shell and `safety-dance` inside that session, and regain start, respond, cancel, or shutdown authority. The peer and attacker-created shell necessarily have the same session, so the added check accepts them without tying either process to the original operator.
- evidence or reproduction: lines 350 and 393 read only the peer and discovered shell session IDs, and lines 392-397 compare those two untrusted descendants with each other. No trusted operator session is captured before validation begins. The check is skipped whenever peer lookup fails; `session_unix.go:1,19-21` uses Linux `/proc` for every non-Windows build, so macOS always takes that bypass, and `session_windows.go:5-8` returns unavailable by design. No repair test creates a reparented or attacker-session descendant.
- fix direction: authorize mutations with a daemon-issued capability or kernel containment identity captured from the trusted operator before validation starts, fail closed when that proof is unavailable, and add built-binary Linux, macOS, and Windows regressions for a marked child that clears its environment, creates its own session or process container, reparents, spawns a shell, and is rejected.

### CR-410 Managed-hook admission still trusts forgeable argv

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:241-283`
- failure mode: same-user code running below a `git-receive-pack` process can invoke a shell with `<gate>/hooks/pre-receive` or `post-receive` in its argument vector and gain issue, admit, revoke, or notify authority without being the managed receive-hook invocation.
- evidence or reproduction: `managedHookPeer` sets `managedHook` solely when `commandHasExecutable` finds expected path text in an OS-reported command line, while `commandHasExecutable` only tokenizes and compares caller-selected argv. The positive test at `internal/daemon/admission_test.go:275-289` fabricates `/bin/sh <hook>` in the command string and declares it trusted; it does not distinguish an actual Git-launched hook from an adversarial descendant under the same receive process.
- fix direction: replace path text with a single-use daemon capability or OS-backed executable and receive-transaction provenance bound to the gate, ref, peer, and receive operation. Add an adversarial test that runs below `git-receive-pack`, supplies the exact managed path in argv without Git launching the hook, and proves every hook-only method rejects it.

### CR-411 Windows evidence test does not exercise the replacement race

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/evidence_open_windows_test.go:12-25`
- failure mode: the Windows release can regress at the root or intermediate reparse-point replacement boundary without a native test detecting that an outside file was selected during the open sequence.
- evidence or reproduction: the new test creates one static junction before calling `readConfinedEvidence`; it never replaces the root or an intermediate directory between the root-handle and candidate-handle operations required by CR-408. It also skips when `mklink /J` is unavailable, and this review could only cross-compile it. The plan ships Windows archives, so compile proof and a static traversal case do not prove the native race boundary.
- fix direction: add a deterministic native Windows test seam that pauses after the managed root handle is pinned, replace the root or an intermediate component with a junction to an outside file, continue the candidate open, and assert refusal. Run this test on Windows without an optional skip and retain cross-compilation as a separate build check.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: `internal/daemon/envmarker.go` now contains only the still-used `environmentHas` helper; no repair-caused orphan was found
- dependency findings: repair commit `fca4597` changes no dependency; the existing pinned Go module passes focused race tests, vet, host build paths, and cross-compilation

## Verdict

- decision: request_changes
- overall code-health change: removing the environment marker narrows one spoofing path, but process-session self-comparison and argv path matching do not establish either authorization boundary, and Windows race coverage remains absent
- rationale: CR-409 through CR-411 are major security findings at mutation, receive-hook, and evidence-publication trust boundaries

## Review Limits

- blocked or unavailable checks: native Windows adversarial execution, hosted `safety-dance-v*` release execution, authorized live-provider behavior, and pull-request metadata were unavailable
- residual manual verification: execute the Windows reparse-point replacement regression on a native Windows runner and retain the first hosted release and credentialed provider evidence as deferred checks
