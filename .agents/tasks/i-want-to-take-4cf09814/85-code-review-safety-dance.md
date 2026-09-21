---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: bc3ac2c12065799af31fd90e296d9561db833bc1
status: findings
summary: "The complete Safety Dance change was reviewed against origin/main at bc3ac2c. Step completion is still not crash-atomic with its resulting HEAD, and the final-candidate rewrite fix mutates a request copy too late to select an explicit lease. The next phase must fix both durability and rewritten-publication paths before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `bc3ac2c12065799af31fd90e296d9561db833bc1`
- commits: 153 commits in `origin/main..HEAD`; latest product fix is `ca8c30cb347cd062336a1ca55d3cb405360cd761`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked task evidence paths

## Previous Round

- previous artifact: `83-code-review-safety-dance.md`
- CR-292 Release workflow is invalid YAML: fixed
- CR-293 Receipt lock admits multiple owners: fixed
- CR-294 Custom gates still survive failed setup and eject: fixed
- CR-295 A completed manager handle can block the next accepted push: fixed
- CR-296 Step completion and resulting HEAD are not crash-atomic: still open
- CR-297 Push mode is computed before the final reviewed candidate exists: still open
- CR-298 Cancelled Git pushes can outlive publication custody: fixed
- CR-299 Managed agent-server descendants leak on Windows: fixed
- CR-300 Accepted runs do not pin one policy generation: fixed
- CR-301 TUI queries a short branch while durable runs use full refs: fixed
- CR-302 Service activation failure can leave an installed definition: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced local Git gate under an independent Safety Dance identity with no source-product references outside the required license
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; latest implementation receipt `26-implementation-safety-dance.md`; verification `16-verification-safety-dance.md`; latest fix receipt `84-code-review-fixes-safety-dance.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed skill contracts

## Change Profile

- intent and expected behavior: add a branded Go gate and daemon with authenticated local admission, durable branch-scoped runs, fixed validation, guarded publication, operator interfaces, canonical skill distribution, identity checks, and native release packaging
- change description quality: the plan and task artifacts describe behavior and safety boundaries; no pull request exists, and the latest broad fix commit has no explanatory body
- implementation model and review model: implementation model not recorded; review model `GPT-5.6 Sol`
- changed-line size and logical cohesion: 231 non-task files, 39,477 additions, and 4 deletions; the product is one cohesive import but exceeds the repository's normal review-size signal
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines, `internal/scm/github/github.go` is 1,490 lines, `internal/agent/agent.go` is 1,353 lines, and `internal/db/run.go` is 1,148 lines; no new split finding is raised because the remaining defects have narrower responsible owners
- dependency or lockfile changes: the new Go module and `go.sum` add the imported tool dependencies; the aggregate race, vet, build, license, and release checks pass

## Tests Reviewed First

- behavior claimed by tests: the suite covers authenticated hook admission, receipt custody, branch replacement, worktree recovery, step replay, validation ordering, publication leases and binding, service and wizard compensation, TUI semantics, identity scanning, installation, packaging, and release metadata
- missing or misleading coverage: no crash-point test covers a process stop between `runs.head_sha` update and step completion; no production-path test proves that the daemon's final-candidate rewrite decision reaches `git push --force-with-lease`

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3593` in / `73` out

### Correctness

- assessment and evidence: `executeRun` updates `runs.head_sha` inside the step callback before `Runner.Run` separately completes the step, so restart can rerun a modifying step from its already-modified HEAD. The final-candidate callback also changes the outer `request.Rewrite` after `Push` has copied the request and built its Git arguments, so rewritten candidates use an ordinary push.
- helper coverage: covered, level 3, confidence 0.97

### Readability and Simplicity

- assessment and evidence: package ownership is explicit across `daemon`, `pipeline`, `db`, `worktrees`, and `gate`, but the split completion protocol hides one durability invariant across `internal/cli/daemon.go` and `internal/pipeline/runner.go`. The publication callback's mutation of a copied value is likewise non-local and hard to reason about.
- helper coverage: covered, level 2, confidence 0.71

### Architecture

- assessment and evidence: SQLite is the intended durability boundary, yet the generic runner cannot commit a step result with the run checkpoint it produced. Publication mode selection is divided between the CLI closure and the pipeline push owner instead of being resolved by the owner that builds the Git command.
- helper coverage: covered, level 3, confidence 0.66

### Security

- assessment and evidence: current admission, receipt, IPC peer, nested-run, reviewed-head, live-upstream, and explicit-lease checks were traced through their production callers. The remaining rewrite defect fails closed as a rejected non-fast-forward push rather than publishing without a lease; no new critical or major security defect was confirmed.
- helper coverage: covered, level 2, confidence 0.52

### Performance

- assessment and evidence: branch coordination releases its key lock before long pipeline work, different branches can overlap, and reviewed paths do not add unbounded network or database loops. No critical or major performance regression was confirmed.
- helper coverage: unavailable

## Verification Story

- command or inspection: `actionlint .github/workflows/safety-dance-release.yml`; `git diff --check`; focused Go race tests for `git`, `daemon`, `cli`, `gate`, `pipeline`, `pipeline/steps`, `agent`, `worktrees`, and `wizard`; `go vet ./...`; `npm test`
- result: all commands passed; `npm test` reported 137 passing Node tests, the full Go race suite, vet, temporary binary build, identity scan, and 3 release-contract tests
- manual, screenshot, or before-and-after evidence: no pull request, hosted product release, authorized live-provider run, or hosted Windows lifecycle run exists

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-303 Step completion and resulting HEAD remain non-atomic

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:884`
- failure mode: after a modifying step updates `runs.head_sha` but before the runner marks that step complete, a crash leaves the durable worktree checkpoint at the step's output while the step remains runnable. Recovery resets the worktree to that output and executes the modifying step again, so a non-idempotent rebase, formatter, document command, or external owner can duplicate or diverge work.
- evidence or reproduction: `executeRun` writes the new HEAD at lines 884-890 inside the callback. `Runner.Run` does not call `CompleteStep` until `internal/pipeline/runner.go:186-203`, in a separate database write. `RecoverDetached` restores `run.HeadSHA`, while a non-completed step is rerun. The focused tests cover completed-step reuse but do not inject a stop between these writes.
- fix direction: add one database transaction that completes the step and updates its resulting run HEAD together. Pass the resulting checkpoint through the runner's completion boundary and add a crash-point regression proving recovery either reruns from the prior checkpoint or skips from the committed output.

### CR-304 Final rewrite selection cannot affect the copied push request

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:823`
- failure mode: a reviewed candidate that rewrites the verified upstream reaches Git as an ordinary push, which rejects the non-fast-forward update instead of using the required explicit `--force-with-lease`. Valid rewritten runs cannot publish.
- evidence or reproduction: the callback at lines 823-830 mutates the outer `request.Rewrite`. `steps.Publish` and `steps.Push` receive `PushRequest` by value, and `Push` builds `args` from its copied `req.Rewrite` at `internal/pipeline/steps/push.go:47-52` before invoking `BeforePush` at lines 53-57. The callback therefore changes neither the copied flag nor the already-built command. Existing lease tests set `Rewrite: true` directly and do not exercise this daemon path.
- fix direction: make the pipeline push owner derive rewrite mode from the final candidate and verified live head before it builds arguments, or let a pre-push callback update the local request before validation and command construction. Add a production-path regression that requires the daemon flow to emit and enforce the exact lease.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none confirmed; the latest fixes remain reachable from daemon, gate, service, TUI, and publication callers
- dependency findings: `go.sum`, generated third-party notices, archive contents, and the scoped legal allowlist are covered by passing aggregate checks; no critical or major dependency issue was confirmed

## Verdict

- decision: request_changes
- overall code-health change: the latest fix closes release parsing, receipt locking, custom-gate compensation, terminal-run replacement, process ownership, full-ref lookup, and service cleanup defects, but two required durability and publication paths remain incorrect
- rationale: both findings violate explicit plan invariants and affect restart or rewritten-publication behavior even though the current aggregate is green

## Review Limits

- blocked or unavailable checks: hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service and descendant lifecycle, and induced process-crash evidence remain unavailable. The helper returned `unclear` for performance, so that axis was decided from direct review and its judgment was skipped.
- residual manual verification: repeat review after the two production paths have focused crash and rewrite regressions; retain the hosted and provider limits as deferred evidence
