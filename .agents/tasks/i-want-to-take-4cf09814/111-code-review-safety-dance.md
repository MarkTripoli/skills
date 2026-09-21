---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 0e858167d0ae37acd50252ac99531c84a5657f4d
status: findings
summary: "Review of the 40,355-line Safety Dance product diff found six major defects in nested-run authorization, SSH-alias provider routing, restart custody, interrupted publication recovery, Windows service ownership, and release gating. CR-351 is fixed, and the local aggregate passes, but the next phase must close CR-352 through CR-357 before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` from `origin/main`
- reviewed HEAD: `0e858167d0ae37acd50252ac99531c84a5657f4d`
- commits: 192 commits after the merge base; `npm run check-commits -- origin/main..HEAD` accepted all 192 subjects
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: committed `.agents/tasks/i-want-to-take-4cf09814/` history, the two task-owned untracked paths, and unrelated untracked `progress.md`

## Previous Round

- previous artifact: `.agents/tasks/i-want-to-take-4cf09814/109-code-review-safety-dance.md`
- CR-351 The release binary ships an environment-controlled fake SCM: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate as independently branded Safety Dance behavior without references to the source repository outside required legal attribution
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; `.agents/tasks/i-want-to-take-4cf09814/16-verification-safety-dance.md` records 28 locally decidable acceptance items as passed and hosted release/provider evidence as untested
- repository instructions: root `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed-file build, install, validation, release, and Go package contracts

## Change Profile

- intent and expected behavior: add a branded local bare-Git admission gate, durable branch-scoped validation, guarded publication, operator CLI/TUI/service flows, portable skill distribution, identity enforcement, and native releases
- change description quality: no pull request exists; the 192 conventional commit subjects identify phase and repair intent, while task artifacts record behavior and verification limits
- implementation model and review model: implementation model not recorded; review model `GPT-5.6 Sol`
- changed-line size and logical cohesion: 232 product files, 40,355 insertions, and 4 deletions; the change is one product import but exceeds a normal review-sized slice
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines, `internal/scm/github/github.go` is 1,490 lines, `internal/agent/agent.go` is 1,353 lines, and `internal/db/run.go` is 1,148 lines; the fixed pipeline is also exposed as mutable package state
- dependency or lockfile changes: the new Go module pins 12 direct and 28 indirect dependencies in `go.mod`/`go.sum`; release archives include the imported license and generated dependency notice manifest

## Tests Reviewed First

- behavior claimed by tests: package and end-to-end tests cover gate admission, durable coordination, validation, publication, recovery, service definitions, operator commands, installer behavior, identity scanning, and release packaging; `TestPublicBinarySmoke` now drives the release-shaped binary through the real GitHub adapter using fake `gh` and Git transports
- missing or misleading coverage: no test covers detached validation descendants, SSH Host aliases, dirty existing-worktree recovery, a candidate differing from the accepted gate head during interrupted publication recovery, Windows foreign-task install/restart ownership, tag publication from an untested commit, or the planned complete compact/wide/plain TUI state matrix

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5064` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 5064 in / 73 out`

### Correctness

- assessment and evidence: SSH aliases are resolved for provider detection but not for `gh` host/repository arguments (`internal/cli/daemon.go:709-724`); existing worktrees retain uncheckpointed changes on restart (`internal/worktrees/ownership.go:278-298`); interrupted publication recovery compares the gate ref against checkpointed `run.HeadSHA`, which normally equals the candidate rather than the accepted gate head (`internal/cli/daemon.go:727-748`, `internal/db/step.go:409-438`).
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: package ownership is explicit, but several files exceed 1,000 lines and `pipeline.CoreSteps` is an exported mutable slice even though the plan defines an invariant fixed order (`internal/pipeline/runner.go:19-31`). These concerns increase audit cost but are not the gate findings below.
- helper coverage: covered, level 2, confidence 0.73

### Architecture

- assessment and evidence: gate, IPC, database, worktree, pipeline, provider, and service owners are separate, but authorization relies on current process ancestry rather than durable validation-child identity (`internal/daemon/admission.go:241-268,349-380`), and release publication does not depend on the repository test workflow (`.github/workflows/tests.yml:3-7`, `.github/workflows/safety-dance-release.yml:2-62`).
- helper coverage: covered, level 3, confidence 0.73

### Security

- assessment and evidence: a validation command can unset `SD_PARENT_RUN_ID`, detach, and invoke the CLI or push through the managed gate after its marked ancestor disappears; daemon mutation and hook-token authorization then see an unmarked Safety Dance or Git/hook ancestry and accept it (`internal/daemon/admission.go:241-268,349-380`). Windows restart also checks only the local definition marker and can run a foreign scheduled task at the predictable label (`internal/daemon/service.go:339-359`).
- helper coverage: covered, level 3, confidence 0.79

### Performance

- assessment and evidence: no critical- or major-severity performance regression was found. Process ancestry walks are capped at 64 entries, IPC and validation work are branch-scoped, and the reviewed tests did not expose unbounded hot-path growth.
- helper coverage: unavailable

## Verification Story

- command or inspection: `npm test`; `cd tools/safety-dance && make e2e`; `npm run check-commits -- origin/main..HEAD`; `git diff --check origin/main...HEAD -- . ':(exclude).agents/tasks/**'`; complete diff and changed tests inspected against the plan and prior fix
- result: all commands exited 0; `npm test` reported 137 Node tests, the Go race suite, vet, built-binary end-to-end flow, identity scan, and three release tests passing; product diff whitespace check passed
- manual, screenshot, or before-and-after evidence: no pull request, hosted release, live-provider run, hosted Windows service run, or induced process-crash recording exists; these limits do not disprove the source-level failures below

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-352 Detached validation children bypass nested-run controls

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:241-268,349-380`
- failure mode: repository-controlled validation code can unset `SD_PARENT_RUN_ID`, detach from its marked parent, and then invoke Safety Dance mutations or push to the managed gate. The CLI sees no marker, mutation authorization accepts the child’s own `safety-dance` executable, and hook authorization accepts the later hook plus `git-receive-pack` ancestry, allowing a nested run to start, respond, abort, shut down, or publish around its parent.
- evidence or reproduction: both authorization functions inspect only current ancestry and marker-bearing environments. Once reparented, the detached process has neither the validation ancestor nor its marker; `AuthorizeMutationPeer` sets `cliPeer` from the child CLI itself, while `managedHookPeer` accepts managed-hook and receive-pack ancestry. Existing tests cover direct markers and synthetic attached ancestry, not reparenting.
- fix direction: bind mutation and token issuance to durable run/process identity that survives marker removal and reparenting, or execute validation in an enforceable containment boundary whose descendants cannot reconnect as top-level operators. Add a real detached-child regression for both IPC mutation and gate push.

### CR-353 GitHub SSH aliases are passed to gh as repository hosts

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:709-724`
- failure mode: a valid remote such as `git@work:owner/repo.git`, where SSH config maps `work` to `github.com`, is detected as GitHub but the pipeline calls `gh auth status --hostname work` and uses `--repo work/owner/repo`; PR and CI stages fail despite valid GitHub credentials.
- evidence or reproduction: `scm.DetectProvider` resolves SSH `HostName` aliases (`internal/scm/scm.go:87-105`), but `newSCMHost` reconstructs the host with unresolved `ExtractHost` and calls `HostPrefixedSlug` instead of the existing alias-aware `HostPrefixedSlugForHost` helper (`internal/scm/github/github.go:79-98`). No caller test covers an SSH alias.
- fix direction: resolve the canonical SSH hostname once, use it for both provider detection and GitHub host/repository construction, and add an alias fixture asserting the exact `gh --hostname` and `--repo` arguments.

### CR-354 Restart recovery trusts uncheckpointed worktree state

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/worktrees/ownership.go:278-298`
- failure mode: a crash during a mutating validation step leaves tracked edits, untracked files, and ignored artifacts in the owned worktree. Restart preserves them when HEAD still equals the durable checkpoint, then loads `.safety-dance.yaml` and resumes validation from that contaminated tree, so policy or test behavior can come from work that was never durably checkpointed.
- evidence or reproduction: `RecoverDetached` returns without cleaning when `rev-parse HEAD` matches `head`; when it differs, it runs only `git reset --hard`, which still preserves untracked and ignored files. `executeRun` immediately calls `config.LoadRepo(worktree)` after this recovery (`internal/cli/daemon.go:782-794`). The recovery test covers only a missing directory.
- fix direction: restore the worktree exactly to the durable checkpoint before reading policy or resuming a step, including tracked, untracked, and ignored state under the owned worktree. Add crash tests for dirty tracked policy, untracked files, and ignored build output.

### CR-355 Interrupted publication recovery compares the gate against the candidate

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:727-748`
- failure mode: after the remote accepts a reviewed candidate but before the gate mirror and binding complete, restart recovery verifies the remote and then attempts `update-ref` with `run.HeadSHA` as the expected old gate value. Successful step checkpoints advance `run.HeadSHA` to the candidate, while the gate still holds the originally accepted head, so reconciliation fails and leaves remote, gate, and durable publication state inconsistent.
- evidence or reproduction: `CompleteStepWithRunHead` updates `runs.head_sha` on each completed step (`internal/db/step.go:409-438`). Normal publication captures the original run value in its mirror callback (`internal/cli/daemon.go:978-981`), but recovery reloads the advanced run and uses that value as the compare-and-set old SHA. The existing recovery test uses one SHA for both accepted and candidate heads and a mirror callback with no ref comparison.
- fix direction: persist and use the accepted or last-reconciled gate head as the mirror compare value during recovery, then add a restart case where validation creates a different candidate and the daemon stops after remote write but before mirror update.

### CR-356 Windows service ownership is checked after mutation and omitted on restart

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/service.go:186-257,339-359`
- failure mode: installation writes an owned definition marker before detecting a foreign scheduled task and returns without restoring the prior file, leaving Safety Dance permanently convinced that a definition is installed. Separately, restart trusts only that marker and can execute a foreign task that replaced the predictable Task Scheduler label.
- evidence or reproduction: the Windows collision query occurs after `writeDefinition`, and the direct return at lines 227-230 bypasses recovery. `Restart` calls `DefinitionExists` but never `taskOwned`; it ignores `/End` failure and still runs `/Run`. `Stop` has the ownership check that restart lacks, confirming the intended boundary.
- fix direction: query and validate Task Scheduler ownership before writing or activating definitions, restore the definition on every collision/error exit, and require `taskOwned` before both restart commands. Add Windows-executor tests for foreign collision, rollback, and label replacement.

### CR-357 Product tags can publish without the repository test gate

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `.github/workflows/safety-dance-release.yml:2-62`
- failure mode: any `safety-dance-v*` tag on an untested commit builds and publishes native archives even when Go tests, the identity scanner, installer checks, or release-contract tests fail.
- evidence or reproduction: the Tests workflow runs only for `main`, pull requests, and merge groups (`.github/workflows/tests.yml:3-7`). The tag workflow validates SemVer and builds immediately; it neither runs `npm test` nor depends on a reusable test job or a verified successful commit status.
- fix direction: make release publication depend on the same aggregate checks for the tagged SHA, either by running them in the tag workflow or calling a reusable test workflow before the build and publish jobs.

## Advisories

### ADV-001 The legal identity test accepts a truncated license

- type: Potential issue
- severity: minor
- category: Data integrity and integration
- location: `scripts/check-safety-dance-identity.mjs:63-78`
- evidence: validation requires only `MIT License`, the copyright line, and one permission phrase. The positive test fixture contains only those fragments, so removal of the remaining grant conditions or warranty disclaimer still passes even though release archives copy this file.
- suggestion: compare the imported notice byte-for-byte with a committed canonical fixture or verify every required paragraph, and make the positive test use the full notice.

### ADV-002 The planned TUI state matrix is not covered

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `tools/safety-dance/internal/tui/view_test.go:11-46`
- evidence: tests assert failed and pending views, width bounds, prompts, and findings, but do not cover the planned compact and wide empty, running, waiting, failed, cancelled, and published matrix or ANSI-stripped semantic equivalence with plain output.
- suggestion: add the planned state-and-width table or golden fixtures and compare semantic fields across compact, wide, and plain renderers.

## Dead Code and Dependency Review

- newly orphaned code: none found; the previous round’s production fake SCM file is deleted and no `SD_E2E_SCM`, `newTestSCMHost`, or `e2eSCMHost` reference remains
- dependency findings: dependencies are pinned and release packaging generates a module notice manifest; no critical- or major-severity dependency defect was established locally

## Verdict

- decision: request_changes
- overall code-health change: the branch adds the requested product and local proof, but restart, authorization, provider routing, Windows lifecycle, and release boundaries still violate stated invariants
- rationale: six reproducible critical-path defects remain despite a passing aggregate; CR-351 is fixed, so the next repair should preserve its real-adapter built-binary coverage

## Review Limits

- blocked or unavailable checks: hosted tag release, live GitHub provider behavior, hosted Windows service execution, and induced OS/process crash execution were unavailable; source tracing established the recorded failures
- typed judgment limit: the performance row returned `unclear`; helper judgment was skipped for that axis and the assessment was decided from the pinned diff and tests
- residual manual verification: repeat detached-child mutation/push, SSH-alias provider, dirty-worktree restart, divergent-head publication recovery, Windows foreign-task, and tagged-SHA release scenarios after fixes
