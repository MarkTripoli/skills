---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 6b40fe26850cd0e6fc836ce6e12cffbc8b780a08
status: findings
summary: "The complete 232-file Safety Dance product diff was reviewed at 6b40fe2 against origin/main. All six findings from the previous round remain open, and four additional major security, dependency, feature-wiring, and dead-code defects were confirmed. The next fix round must close CR-358 through CR-367 before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` from `origin/main`
- reviewed HEAD: `6b40fe26850cd0e6fc836ce6e12cffbc8b780a08`; latest product commit `aee22667e15e1499686ccbdcac83490275f3704c`
- commits: 193 commits after the merge base
- staged and unstaged changes: none
- task-owned untracked files: 390 files under `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts under `.agents/tasks/`, the task-owned untracked paths above, and unrelated untracked `progress.md`

## Previous Round

- previous artifact: `.agents/tasks/i-want-to-take-4cf09814/111-code-review-safety-dance.md`
- CR-352 Detached validation children bypass nested-run controls: still open
- CR-353 GitHub SSH aliases are passed to gh as repository hosts: still open
- CR-354 Restart recovery trusts uncheckpointed worktree state: still open
- CR-355 Interrupted publication recovery compares the gate against the candidate: still open
- CR-356 Windows service ownership is checked after mutation and omitted on restart: still open
- CR-357 Product tags can publish without the repository test gate: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced local Git validation system under the independent Safety Dance identity without source-product references
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; `.agents/tasks/i-want-to-take-4cf09814/16-verification-safety-dance.md` records all locally decidable items as passing at `49c6c2d`, before the later fix and review rounds
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add the Safety Dance local bare-Git gate, durable branch-scoped daemon, guarded validation and publication pipeline, operator CLI and TUI, canonical skill distribution, identity checks, and checksummed native releases
- change description quality: the plan records invariants and checks, but no pull request exists and the product commits have subjects without explanatory bodies
- implementation model and review model: implementation model not recorded in the selected receipt; review used GPT-5.6 Sol with four read-only codebase analyzer passes
- changed-line size and logical cohesion: 232 product files, 40,355 additions, and 4 deletions; the change is one product import but far exceeds the review guide's split signal
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines, `internal/scm/github/github.go` is 1,490 lines, `internal/agent/agent.go` is 1,353 lines, `internal/db/run.go` is 1,148 lines, and `internal/cli/daemon.go` is 1,034 lines
- dependency or lockfile changes: new Go module and checksum file plus root `package.json` scripts; release builds derive an exact vulnerable Go 1.25.0 toolchain from `go.mod`

## Tests Reviewed First

- behavior claimed by tests: root validation, 137 Node tests, Go race tests, vet, temporary binary build, built-binary end-to-end flow, identity checks, installer coverage, and release-contract tests all pass through `npm test`
- missing or misleading coverage: tests do not cover detached nested mutation, Antigravity environment propagation, SSH alias arguments passed to `gh`, dirty existing worktree recovery, a real gate CAS after interrupted publication, Windows task ownership on install or restart, a release test dependency, agent environment isolation, reachable Go standard-library vulnerabilities, evidence publication or retention, or production use of `agent.Runner`

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5840` in / `73` out

### Correctness

- assessment and evidence: CR-358 through CR-363 remain reproducible in the current call paths. CR-366 confirms that documented evidence settings and their implementations have no production consumer. `npm test` passes but does not exercise these paths.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: core ownership is spread across several files exceeding 1,000 lines. CR-367 identifies a second agent execution abstraction referenced only by its own test, while CR-366 identifies a larger configured subsystem whose public contract is disconnected from runtime behavior.
- helper coverage: covered, level 3, confidence 0.76

### Architecture

- assessment and evidence: durable checkpoint ownership is sound at database step completion, but restart restoration does not restore the matching filesystem state. Publication recovery also uses mutable run head state where the gate update needs immutable submitted-head custody. Evidence publishing and the standalone runner have no runtime integration.
- helper coverage: covered, level 3, confidence 0.91

### Security

- assessment and evidence: nested-run authorization relies on a removable environment marker and live ancestry, with Antigravity dropping the marker outright. CR-364 shows repository-facing Claude runs with `--dangerously-skip-permissions` and inherits the daemon's complete environment. CR-365 records 25 reachable standard-library vulnerabilities in release binaries built with Go 1.25.0.
- helper coverage: covered, level 3, confidence 0.93

### Performance

- assessment and evidence: every distinct repository and branch starts a separate goroutine and permanently retains a branch mutex in `Manager.keyMu` (`internal/daemon/manager.go:33-57,144-159`). Agent stderr is also read without a byte limit (`internal/agent/claude.go:84-113`). ADV-001 records the cross-branch resource risk.
- helper coverage: covered, level 2, confidence 0.66

## Verification Story

- command or inspection: `npm test`; `git diff --check origin/main...HEAD -- ':!.agents/tasks/**'`; `npm run check-commits -- origin/main..HEAD`; `GOBIN=<temp> go install golang.org/x/vuln/cmd/govulncheck@v1.8.0 && GOTOOLCHAIN=go1.25.0 <temp>/govulncheck ./...`; production call-flow and test inspection for every finding
- result: `npm test` passed with 137 Node tests and the Safety Dance aggregate; product diff check passed; all 193 commit subjects passed; `govulncheck` reported 25 reachable Go standard-library vulnerabilities and exited 3
- manual, screenshot, or before-and-after evidence: no new UI screenshot or hosted evidence; the prior verification records built-binary operator observations, while hosted release, live-provider, and Windows service behavior remain unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-358 Detached validation children bypass nested-run controls

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/agent/antigravity.go:112`
- failure mode: Antigravity validation does not receive `SD_PARENT_RUN_ID`. Other agents can clear the mutable marker, detach from the marked ancestor, and invoke the CLI without either nested-run guard recognizing them.
- evidence or reproduction: typed validation supplies the marker at `internal/pipeline/steps/validation.go:167`, but Antigravity calls `gitSafeEnv(opts.CWD)` at lines 113-116 and drops `opts.Env`. `AuthorizeMutationPeer` at `internal/daemon/admission.go:349-380` trusts live ancestry and the same removable marker, while accepting any ancestry containing `safety-dance`.
- fix direction: propagate `opts.Env` in every adapter and add adapter-level tests. Replace environment-plus-ancestry authorization with an OS-enforced validation identity or containment boundary that detached descendants cannot remove.

### CR-359 GitHub SSH aliases are passed to gh as repository hosts

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:709`
- failure mode: an SSH remote such as `git@work:owner/repo.git`, where `work` resolves to `github.com`, is detected as GitHub but later invokes `gh --hostname work --repo work/owner/repo`; authentication, PR creation, and CI polling fail.
- evidence or reproduction: provider detection resolves aliases through `scm.ResolveHost`, but `newSCMHost` uses literal `scm.ExtractHost` and `github.HostPrefixedSlug` at lines 719-724. `HostPrefixedSlugForHost` already exists for the resolved-host case at `internal/scm/github/github.go:86-97`.
- fix direction: resolve the host once with the caller's context and pass it to both `github.New` and `HostPrefixedSlugForHost`, while preserving the original remote URL for Git.

### CR-360 Restart recovery trusts uncheckpointed worktree state

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/worktrees/ownership.go:278`
- failure mode: after a daemon crash during a step, tracked edits survive whenever `HEAD` still matches the last durable checkpoint, and untracked or ignored files survive even after a hard reset. Resumed steps consume filesystem state that the database never checkpointed.
- evidence or reproduction: `executeRun` resumes with persisted `run.HeadSHA` at `internal/cli/daemon.go:775-784`. `RecoverDetached` resets only when `HEAD` differs and never cleans files at lines 287-298. The only recovery test recreates a missing worktree and does not seed dirty state.
- fix direction: terminate surviving worktree processes, unconditionally reset the owned disposable worktree to the persisted SHA, clean untracked and ignored files, then verify both `HEAD` and an empty status before replay.

### CR-361 Publication recovery uses the mutable candidate as the gate CAS state

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:727`
- failure mode: after the remote accepts the reviewed candidate but before the gate mirror or binding completes, recovery tries to update the gate only if its old value equals mutable `run.HeadSHA`, which has advanced to the candidate. The gate still contains the submitted head, so recovery cannot finish the required mirror and durable binding. Replay after the mirror also lacks an explicit already-candidate success path.
- evidence or reproduction: successful steps advance `runs.head_sha` atomically at `internal/pipeline/runner.go:281-296`. Both recovery and normal mirror callbacks use `run.HeadSHA` as the old value at `internal/cli/daemon.go:745-747,978-981`, while immutable `SubmittedHeadSHA` records the accepted head. Existing interruption tests use a no-op or error-only mirror rather than a real ref CAS.
- fix direction: centralize an idempotent mirror helper that returns success when the gate already equals the candidate and otherwise performs the CAS from immutable submitted-head custody, with an explicit policy for legacy null rows.

### CR-362 Windows service ownership is checked after mutation and omitted on restart

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/service.go:186`
- failure mode: Windows install writes a managed local definition before discovering a foreign same-name scheduled task, then returns without restoring that file. A later restart trusts only the local definition and can issue `/End` and `/Run` against the foreign task.
- evidence or reproduction: `Install` writes at lines 212-219 and queries the task at lines 227-230. `DefinitionExists` checks only the local file at lines 119-137. `Restart` issues task mutations at lines 339-359 without `taskOwned`, although `Stop` performs that check at lines 315-324.
- fix direction: query and reject foreign Windows tasks before writing local state, restore any local mutation on every failure, and require `taskOwned` before restart commands.

### CR-363 Product tags bypass the repository test gate

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `.github/workflows/safety-dance-release.yml:7`
- failure mode: any syntactically valid `safety-dance-v*` tag builds and publishes release assets even when the tagged revision fails the repository's authoritative test suite.
- evidence or reproduction: the release matrix depends on no test job and `publish` depends only on `release` at lines 8-50. `.github/workflows/tests.yml:3-7` runs only for main pushes, pull requests, and merge groups, not tags.
- fix direction: add a pre-release job that performs the same Node and Go setup, `npm ci`, and `npm test`, and make the build matrix depend on it.

### CR-364 Validation agents inherit daemon secrets with unrestricted permissions

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/agent/claude.go:68`
- failure mode: repository-controlled instructions run Claude in the candidate checkout with `--dangerously-skip-permissions` and the daemon's full environment, exposing unrelated API keys and host credentials to the agent and any commands it executes.
- evidence or reproduction: `runOnce` assigns `gitSafeEnv` at line 81; `runenv.Overlay.Apply(nil)` expands to `os.Environ()` at `internal/runenv/overlay.go:31-36`; `buildArgs` adds unrestricted permission mode by default at `internal/agent/claude.go:167-203`. Project settings suppression is optional rather than the safe default.
- fix direction: start validation agents and configured repository commands in a containment boundary with an explicit environment allowlist and only the credentials required by that adapter and step. Make project settings and unrestricted host access opt-in where compatibility requires them.

### CR-365 Release binaries pin a vulnerable Go 1.25.0 standard library

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/go.mod:3`
- failure mode: every tagged archive is compiled with Go 1.25.0 and includes reachable standard-library vulnerabilities in TLS, X.509, HTTP, URL parsing, and resource handling.
- evidence or reproduction: the release workflow reads `go-version-file` from this module at `.github/workflows/safety-dance-release.yml:19-22`. A current `govulncheck` scan forced through Go 1.25.0 reported 25 reachable findings, including GO-2026-6218, GO-2026-6090, GO-2026-5972, and GO-2026-4870; fixes require patch releases up to Go 1.25.13.
- fix direction: pin Go 1.25.13 or a newer supported release, rerun race, vet, build, end-to-end, and vulnerability checks, and add `govulncheck` to the aggregate or release preflight.

### CR-366 Evidence configuration and implementations have no production path

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/config/config.go:833`
- failure mode: documented `store_in_repo`, default-enabled `attach_media`, `local_root`, retention, and maximum-run settings have no runtime effect. The pipeline neither publishes the evidence branch, uploads media, renders links into the PR, stores under the configured root, nor reaps retained evidence.
- evidence or reproduction: the public contract and defaults are at lines 833-895, 1226-1252, and 2703-2761. Repository-wide reference tracing finds no production read of the resolved evidence settings; `evidence.Publish`, `github.Host.UploadUserAsset`, and `paths.RunEvidenceDir` have no production callers. The PR step at `internal/pipeline/steps/pr.go:12-84` creates only the static body `Created by Safety Dance.`
- fix direction: wire evidence collection, storage, retention, optional orphan-branch publication, media upload, stable PR rendering, and cleanup through the pipeline with production-path tests. If this behavior is out of scope, remove its configuration, documentation, and unused implementations instead of shipping inert controls.

### CR-367 Standalone agent runner is dead production code

- type: Refactor suggestion
- severity: major
- category: Maintainability and code quality
- location: `tools/safety-dance/internal/agent/runner.go:9`
- failure mode: the change ships a second command-runner abstraction whose `ParentRunID` field is never applied and whose `Runner.Run` has no production caller. Its test passes while the real adapter path follows different retry, environment, lifecycle, and isolation rules.
- evidence or reproduction: repository-wide searches find `Runner{MaxAttempts: ...}` only in `internal/agent/runner_test.go:19` and find no use of `Request.ParentRunID` outside its declaration.
- fix direction: delete `runner.go` and its isolated test, or replace real adapter execution with this owner and make it enforce the production environment and lifecycle contract. Do not retain two divergent execution paths.

## Advisories

### ADV-001 Cross-branch runs have no resource bound

- type: Potential issue
- severity: minor
- category: Performance and scalability
- location: `tools/safety-dance/internal/daemon/manager.go:33`
- evidence: each distinct branch key creates a retained mutex and starts a goroutine at lines 33-57 and 144-159. There is no queue, semaphore, or cleanup of `keyMu`, so many branch pushes can multiply agent subprocesses, model cost, memory, and retained map entries.
- suggestion: preserve required cross-branch concurrency behind a configurable global worker limit and remove inactive key locks after ownership ends.

## Dead Code and Dependency Review

- newly orphaned code: the configured evidence publisher, GitHub attachment uploader, evidence path controls, and retention settings have no production consumer under CR-366; `internal/agent/runner.go` is referenced only by its own test under CR-367
- dependency findings: `go.mod` pins release builds to Go 1.25.0, and current `govulncheck` reports 25 reachable standard-library vulnerabilities under CR-365; no separate lockfile inconsistency was found

## Verdict

- decision: request_changes
- overall code-health change: the branch adds the requested product and extensive automated checks, but current lifecycle, authorization, release, dependency, and advertised-feature failures prevent approval
- rationale: ten major findings remain in the pinned product scope. Green aggregate checks do not execute the failing crash, alias, Windows, tag-release, environment-isolation, or evidence paths.

## Review Limits

- blocked or unavailable checks: no hosted `safety-dance-v*` release, authorized live-provider run, hosted Windows service run, or induced OS-level crash was available; Windows behavior was inspected statically. The selected verification artifact predates the later fix rounds.
- residual manual verification: after fixes, exercise detached nested mutation containment, SSH aliases, dirty-worktree restart, both publication interruption points, Windows foreign-task install and restart, tag release gating, sanitized agent environments, evidence rendering and retention, and a scan under the upgraded Go toolchain
