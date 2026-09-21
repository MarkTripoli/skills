---
type: code-review
date: 2026-09-21
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 0d5671c9bf2e324814412ded8d23cb07da386b9f
status: findings
summary: "The complete 41,264-line Safety Dance product diff was reviewed through 0d5671c against origin/main. Strict recovery and additive GitHub evidence publication are fixed, but daemonized validation descendants can still regain mutation authority, managed-hook admission still trusts a forgeable environment marker, and Windows evidence confinement still lacks native reparse-point proof. The next fix round must close CR-406 through CR-408 with adversarial and native-platform regressions."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` from `git merge-base origin/main HEAD`
- reviewed HEAD: `0d5671c9bf2e324814412ded8d23cb07da386b9f`
- commits: 215 commits after the merge base; the latest repair is `e2c5b5c` and the current artifact-only head is `0d5671c`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the unrelated untracked `progress.md`; neither is a product review subject

## Previous Round

- previous artifact: `.agents/tasks/i-want-to-take-4cf09814/124-code-review-safety-dance.md`
- CR-401 Daemonized validation descendants still regain mutation authority: still open
- CR-402 Strict recovery discards its complete inspection before the actual sweep: fixed
- CR-403 Windows evidence confinement still compares handles opened across a mutable-root race: still open
- CR-404 Managed-hook admission still trusts forgeable argv ancestry: still open
- CR-405 Existing GitHub pull requests can no longer receive evidence: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate as independently branded Safety Dance without source-product references outside the required legal notice
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`, with the current repair receipt at `.agents/tasks/i-want-to-take-4cf09814/125-code-review-fixes-safety-dance.md`
- repository instructions: root and worktree `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add an authenticated local Git gate, durable branch runs, isolated validation, guarded publication, operator interfaces, canonical skill distribution, and native releases under the Safety Dance identity
- change description quality: commit subjects pass `npm run check-commits -- origin/main..HEAD`; no pull request exists, so no PR title or body is available to review
- implementation model and review model: implementation model not recorded; review model GPT-5.6 Sol
- changed-line size and logical cohesion: 236 product files, 41,260 additions, and 4 deletions; the latest repair changes 180 lines across seven product files and stays within recovery, evidence confinement, authorization, and PR publication boundaries
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines, `internal/scm/github/github.go` is 1,563 lines, `internal/agent/agent.go` is 1,353 lines, and two test files exceed 1,000 lines; no new critical or major defect was tied to file size
- dependency or lockfile changes: the new Go module and pinned `go.sum` are part of the reviewed product import; the latest repair adds no dependency or lockfile change

## Tests Reviewed First

- behavior claimed by tests: the verification artifact records all locally decidable plan checks passing at `49c6c2d`; current `npm test`, focused Go race tests and vet, commit checks, and Windows cross-compilation all pass at `0d5671c`
- missing or misleading coverage: `admission_test.go` does not exercise a daemonized descendant that clears `SD_PARENT_RUN_ID`, and its marker test places `SD_MANAGED_HOOK` in argv rather than the process environment now trusted by production. The only evidence-path attack tests use host symlinks; no native Windows reparse-point replacement test executes `evidence_open_windows.go`.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4065` in / `73` out

### Correctness

- assessment and evidence: strict recovery now passes the exact completeness-checked process and CWD snapshot into `sweepSnapshot` at `tools/safety-dance/internal/procreap/procreap.go:248-273`, and existing GitHub PRs now receive additive evidence through `PRCommenter` at `tools/safety-dance/internal/pipeline/steps/pr.go:81-106`. The remaining authorization and Windows proof failures are recorded below.
- helper coverage: covered, level 3, confidence 0.89

### Readability and Simplicity

- assessment and evidence: the latest recovery change consolidates matching and termination in `sweepSnapshot` rather than duplicating a second enumeration. The PR path selects one explicit provider capability and retains the conditional-update fallback for other providers at `tools/safety-dance/internal/pipeline/steps/pr.go:81-106`; no blocking readability defect was found.
- helper coverage: covered, level 2, confidence 0.72

### Architecture

- assessment and evidence: recovery remains owned by `internal/procreap`, provider-specific comment transport remains in `internal/scm/github`, and the pipeline depends on the narrow `scm.PRCommenter` capability. Mutation and hook authorization remain incorrectly derived from caller-controlled process metadata in `internal/daemon`, which is the trust-boundary failure in CR-406 and CR-407.
- helper coverage: covered, level 3, confidence 0.86

### Security

- assessment and evidence: same-user validation code can still escape both authorization checks by reparenting and forging process metadata. Windows evidence reads now hold the root and candidate handles together, but the platform-specific security boundary has only compile proof and no native adversarial execution.
- helper coverage: covered, level 3, confidence 0.94

### Performance

- assessment and evidence: the latest changes add one process-environment lookup per inspected hook ancestor, reuse one process/CWD snapshot during strict recovery, bound evidence reads to 16 MiB, and make one `gh pr comment` call per existing-PR evidence publication. No unbounded loop, N+1 path, blocking async regression, or material hot-path allocation was found.
- helper coverage: covered, level 3, confidence 0.96

## Verification Story

- command or inspection: `npm test`; `cd tools/safety-dance && go test -race ./internal/daemon ./internal/procreap ./internal/scm/... ./internal/pipeline/steps && go vet ./...`; Windows test-binary cross-compilation for `internal/pipeline/steps` and `internal/daemon`; `npm run check-commits -- origin/main..HEAD`; complete latest product diff inspection
- result: all commands passed; `npm test` reported 137 Node tests plus the Safety Dance race, vet, build, e2e, identity, and release-contract checks. Cross-compilation produced both Windows test binaries without executing them.
- manual, screenshot, or before-and-after evidence: none; hosted release, authorized live-provider concurrency, and native Windows adversarial execution remain unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-406 Daemonized validation descendants can regain mutation authority

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:350-395`
- failure mode: validation code can clear `SD_PARENT_RUN_ID`, daemonize until the marked ancestor exits, then launch `safety-dance` under a shell and call start, respond, cancel, or shutdown IPC methods. The daemon sees a complete unmarked ancestry containing a shell and authorizes the mutation.
- evidence or reproduction: `AuthorizeMutationPeer` accepts identity solely from the peer executable name, readable environment strings, command strings, and the presence of any shell ancestor. Reparenting removes the only marked process from the inspected chain, while `isInteractiveShell` checks only the executable basename and does not prove an interactive operator or daemon-issued authority. `admission_test.go:286-309` covers a marked ancestor that remains alive, not the daemonized/reparented case.
- fix direction: require an unforgeable daemon-issued mutation capability or OS containment identity bound to the top-level operator session, propagate it only to authorized CLI invocations, and add a built-binary regression where a validation descendant clears its environment, daemonizes, reparents, and is rejected.

### CR-407 Managed-hook admission trusts a forgeable environment marker

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:241-275`
- failure mode: same-user code can run a descendant beneath `git-receive-pack`, set `SD_MANAGED_HOOK` to any path below the requested gate's `hooks` directory, and satisfy `managedHookPeer` without executing a managed hook. It can then issue admission tokens and call admit, revoke, or notify methods reserved for the gate.
- evidence or reproduction: lines 264-268 treat the caller-controlled environment value as proof of a managed hook, while lines 270-275 require only a `git-receive-pack` command somewhere in ancestry. The generated hook sets the same ordinary environment variable at `tools/safety-dance/internal/git/hook.go:105-107`; no secret, file-handle identity, inode, or daemon-issued capability distinguishes a real hook. `admission_test.go:250-283` tests a marker embedded in argv and never supplies the forged environment value production now accepts.
- fix direction: replace the environment marker with a single-use daemon capability bound to gate, ref, process identity, and receive transaction, or verify the actual hook executable through OS-backed provenance. Add an adversarial test that supplies the forged environment under a receive-pack ancestor and proves every hook-only method rejects it.

### CR-408 Windows evidence confinement lacks native reparse-point proof

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/evidence_open_windows.go:17-74`
- failure mode: the Windows release can publish bytes selected through a junction or reparse-point replacement at the evidence trust boundary without any executed Windows regression proving that the held root handle and candidate handle comparison rejects the race.
- evidence or reproduction: the repair now opens and holds the root handle before the candidate and compares final handle paths, but the recorded and rerun Windows check only cross-compiles a test binary. `tools/safety-dance/internal/pipeline/steps/pr_security_test.go:10-39` uses `os.Symlink` and runs only on the host platform; there is no Windows-specific test that replaces a root or intermediate directory with a junction between root validation and candidate open. This leaves the plan's native Windows distribution and evidence-confinement criterion unproven.
- fix direction: add and execute a native Windows adversarial test that opens the managed root, replaces the root or intermediate component with a reparse point to an outside file, races the candidate open, and asserts refusal while handles remain pinned. Retain cross-compilation as a separate build check.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found; the dead GitHub conditional PATCH block was removed, and `PRContentConditionalUpdater` remains used by non-commenting providers
- dependency findings: no dependency changed in the latest repair; the pinned Go module passes race tests, vet, build, and the repository's existing release and legal-notice checks

## Verdict

- decision: request_changes
- overall code-health change: strict recovery and existing-GitHub-PR evidence publication improve, but the change remains unsafe at two local authorization boundaries and lacks execution proof for the Windows evidence boundary
- rationale: CR-406 and CR-407 let untrusted same-user validation code reach privileged daemon operations, and CR-408 leaves a supported platform's evidence confinement criterion unproven. Passing aggregate and compile checks do not exercise these adversarial paths.

## Review Limits

- blocked or unavailable checks: no live provider credentials, hosted product release, or native Windows runner were available; Windows checks were compile-only
- residual manual verification: run the new daemonized-descendant, forged-hook, and Windows reparse-point regressions after the fixes; retain hosted release and authorized live-provider evidence as documented deferred checks
