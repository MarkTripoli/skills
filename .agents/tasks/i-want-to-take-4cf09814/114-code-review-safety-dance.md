---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: ea3bbe4942ec20f45ace34ef1c9f47edf23c2142
status: findings
summary: "The complete 230-file Safety Dance product diff was reviewed at ea3bbe4 against origin/main. Three previous findings remain open, and five new major or critical defects affect nested-run authorization, crash recovery, Windows service safety, evidence custody and durability, pull-request evidence, cleanup ownership, and Windows child environments. The next fix round must close CR-368 through CR-375 before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `ea3bbe4942ec20f45ace34ef1c9f47edf23c2142`
- commits: 197 commits after the merge base; `npm run check-commits -- origin/main..HEAD` accepted all 197 subjects.
- staged and unstaged changes: none.
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/`, `.agents/tasks/i-want-to-take-4cf09814/evidence/`, and `progress.md`.
- excluded changes: `.agents/tasks/i-want-to-take-4cf09814/**`, the task-owned untracked paths, and the two `origin/main` commits after the pinned merge base.

## Previous Round

- previous artifact: `112-code-review-safety-dance.md`
- CR-358 Detached validation children bypass nested-run controls: still open
- CR-359 GitHub SSH aliases are passed to gh as repository hosts: fixed
- CR-360 Restart recovery trusts uncheckpointed worktree state: still open
- CR-361 Publication recovery uses the mutable candidate as the gate CAS state: fixed
- CR-362 Windows service ownership is checked after mutation and omitted on restart: still open
- CR-363 Product tags bypass the repository test gate: fixed
- CR-364 Validation agents inherit daemon secrets with unrestricted permissions: fixed
- CR-365 Release binaries pin a vulnerable Go 1.25.0 standard library: fixed
- CR-366 Evidence configuration and implementations have no production path: fixed
- CR-367 Standalone agent runner is dead production code: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate as the independently branded Safety Dance product without shipped references to the source product.
- implementation source: `05-plan-safety-dance.md`; six phases require authenticated admission, durable branch-scoped execution, guarded publication, operator interfaces, canonical skill distribution, identity enforcement, and native releases.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed-file package conventions.

## Change Profile

- intent and expected behavior: add a Go CLI and daemon that admit pushes through a local bare gate, run durable validations in owned worktrees, publish only reviewed heads, expose operator controls, distribute `/safety-dance`, and release checksummed native archives.
- change description quality: commit subjects pass repository validation. No pull request exists, so no pull-request title or body was available to review.
- implementation model and review model: implementation model not recorded; review model `GPT-5.6 Sol` with focused `agent-implementation-reviewer` passes over runtime custody, pipeline and evidence, CLI and configuration, and repository integration.
- changed-line size and logical cohesion: 230 product files, 40,529 additions, and 4 deletions outside task artifacts. The change is one product import but exceeds the normal review-size signal; package-focused review and repeated fix rounds were required.
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, and `internal/cli/daemon.go` each exceed 1,000 lines. The confirmed findings concern boundary ownership rather than file length alone.
- dependency or lockfile changes: the new Go module pins its dependency graph, includes generated third-party notices, uses Go 1.26.6, and runs `govulncheck` in release preflight. The latest fix artifact records no reachable vulnerabilities.

## Tests Reviewed First

- behavior claimed by tests: authenticated hook admission, durable replacement and recovery, reviewed-head publication, operator commands, runtime installation, identity scanning, release packaging, and aggregate execution. `16-verification-safety-dance.md` records every locally decidable acceptance item passing at `49c6c2d`; `113-code-review-fixes-safety-dance.md` records focused Go, end-to-end, vulnerability, and root aggregate checks after the latest fixes.
- missing or misleading coverage: no test exercises evidence path confinement, atomic step-and-evidence completion, preservation of an existing pull-request body, repository-correct evidence links, cleanup of a shared custom evidence root, orphaned writers during restart recovery, failed Windows task queries, or the filtered Windows subprocess environment.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5620` in / `73` out

### Correctness

- assessment and evidence: the main gate and publication tests pass, but crash recovery can race surviving writers (CR-369), evidence is not committed atomically with step completion (CR-372), evidence updates corrupt the pull-request presentation (CR-373), and Windows validation children lose required environment state (CR-375).
- helper coverage: covered, level 3, confidence 0.97

### Readability and Simplicity

- assessment and evidence: package boundaries and explicit transition helpers make the main flow traceable. The evidence feature spreads one lifecycle across `pipeline.Runner`, step activity text, the PR step, local retention, and an orphan-branch publisher; that split hides the durability and ownership failures in CR-371 through CR-374.
- helper coverage: covered, level 2, confidence 0.76

### Architecture

- assessment and evidence: gate, daemon, database, worktree, pipeline, and provider packages own distinct responsibilities. Nested-run authorization still treats a forgeable environment marker as a mutation boundary (CR-368), and evidence is stored as semicolon-delimited activity text instead of durable typed step state (CR-372).
- helper coverage: covered, level 3, confidence 0.65

### Security

- assessment and evidence: authenticated IPC and reduced child environments remove several ambient-authority paths. A detached child can still escape nested-run controls (CR-368), a typed agent can select arbitrary host files for publication (CR-371), Windows task uncertainty can overwrite or delete a foreign task (CR-370), and cleanup can recursively delete unrelated directories (CR-374).
- helper coverage: covered, level 3, confidence 0.96

### Performance

- assessment and evidence: publication bounds one evidence batch to 500 files, 256 MiB total, and 64 MiB per file; pipeline loops and provider polling are bounded by contexts or configured limits. No critical- or major-severity performance regression was confirmed in the pinned diff.
- helper coverage: covered, level 3, confidence 0.62

## Verification Story

- command or inspection: inspected the complete `origin/main...HEAD` name/status and diff profile, traced changed production paths and tests, ran focused Go tests for pipeline steps, evidence, CLI, worktrees, daemon, and agent packages, ran release-contract tests, ran commit-subject validation, and ran product-only `git diff --check`.
- result: `npm test` passed with 137 Node tests plus the Safety Dance identity scan, full Go race suite, vet, temporary binary build, binary end-to-end test, and three release-contract tests. Focused Go and release tests, 197 commit subjects, and product-only `git diff --check` also passed. A whole-scope `git diff --check` reports trailing whitespace only in excluded task artifact `02-research-local-git-gate.md`.
- manual, screenshot, or before-and-after evidence: no hosted Windows, live-provider, or release execution was available. Source traces below reproduce each finding without mutating product code.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-368 Detached validation descendants still bypass nested-run authorization

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:349`
- failure mode: a validation process can daemonize or double-fork, unset `SD_PARENT_RUN_ID`, become reparented outside the marked ancestry, and invoke `safety-dance`; the daemon then sees an authenticated same-user peer and a Safety Dance CLI process but no marked ancestor, so it authorizes parent-run mutation.
- evidence or reproduction: `AuthorizeMutationPeer` walks only the current process ancestry and treats a `safety-dance` executable as sufficient after finding no marker at lines 355-380. `internal/agent/env.go:11-16` documents that the marker is removable and forgeable, so forwarding it to every direct adapter does not close detached-descendant escape.
- fix direction: make mutation authorization depend on a non-forgeable, run-scoped capability or OS-enforced process identity that validation descendants cannot discard or reacquire; add a test that daemonizes, unsets the marker, and attempts each parent mutation.

### CR-369 Restart recovery races validation processes that survived the daemon

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/worktrees/ownership.go:278`
- failure mode: after a daemon crash, an orphaned validation or tool subprocess can continue writing to the owned worktree. Recovery resets and cleans once, verifies a clean status, and resumes the run, but the surviving process can write immediately afterward and change the candidate outside durable checkpoints.
- evidence or reproduction: `RecoverDetached` performs `reset --hard`, `clean -fdx`, and one status check at lines 284-303. Startup calls this path before resumed execution, while process reaping appears only in ordinary cleanup at `internal/cli/daemon.go:294`; no restart path terminates or proves the absence of processes rooted in the run worktree.
- fix direction: persist enough process-group ownership to reap surviving run processes before resetting, or scan and terminate processes rooted in the worktree before recovery; prove with a writer that survives a simulated daemon crash and attempts a post-clean write.

### CR-370 Failed Windows task queries can overwrite or delete a foreign task

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/service.go:212`
- failure mode: any `schtasks /Query` error is treated as absence. Installation then uses `/Create ... /F`, which can replace an existing foreign task; if activation reports failure, rollback unconditionally deletes the task name and can remove the foreign task it never authenticated.
- evidence or reproduction: the collision check rejects only `queryErr == nil` with non-owned XML at lines 212-217. Lines 234-255 create with `/F` and delete on failure without distinguishing “task not found” from access, parsing, or transient query errors.
- fix direction: fail closed on every query error except a positively identified task-not-found result, record whether this attempt created the scheduler task, and delete only that newly created owned task during rollback. Add Windows executor tests for access-denied query, foreign task, create failure, and rollback preservation.

### CR-371 Typed evidence can publish arbitrary host files

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/pipeline/steps/pr.go:128`
- failure mode: a validation agent can return an absolute path to any daemon-readable file. The PR step reads that file and can push it to the evidence branch or upload it as a GitHub user asset, exposing credentials or unrelated user data.
- evidence or reproduction: agent-controlled `evidence` strings are accepted without path validation at `internal/pipeline/steps/validation.go:105-136,175-196` and persisted verbatim at `internal/pipeline/runner.go:302-305`. `renderEvidence` calls `os.Stat` and `os.ReadFile` on each value at lines 128-137, then publishes or uploads the resulting bytes at lines 146-171. The reduced child environment retains `HOME`, so home-directory files remain addressable.
- fix direction: accept structured evidence that distinguishes inline text from files; resolve file evidence relative to the owned worktree or a run-owned capture directory, reject absolute paths and symlink escapes, and test attempts to name files outside that boundary before any provider call.

### CR-372 Step completion and evidence persistence are not atomic

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/runner.go:281`
- failure mode: a crash after marking a step complete but before writing its evidence loses the evidence permanently. Restart sees the matching completed fingerprint, skips the step, and later PR rendering has nothing to publish.
- evidence or reproduction: `CompleteStepWithRunHead` commits completion at lines 293-296, while `TouchStepActivity` writes evidence in a second database operation at lines 302-305. Completed matching steps are skipped during replay at lines 159-163.
- fix direction: store typed evidence in the same transaction as step completion and read it from a dedicated field or table; add a crash-boundary test proving a completed step cannot exist without its evidence payload.

### CR-373 Evidence rendering replaces authored PR bodies and emits broken blob links

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/pipeline/steps/pr.go:73`
- failure mode: every run with evidence replaces the entire existing pull-request body with evidence-only text. When repository storage is enabled, links are based on the pull-request URL and resolve under `/pull/<n>/blob/...`, which is not a repository blob route.
- evidence or reproduction: lines 73-80 call `UpdatePR` with only the rendered evidence body; `internal/scm/github/github.go:351-366` sends that value as the complete body. Lines 152-154 append `/blob/<sha>/...` directly to `pr.URL`, producing a path such as `https://github.com/o/r/pull/1/blob/<sha>/...`.
- fix direction: read and preserve the authored body, update one idempotent managed evidence section, and build escaped commit-pinned links from the canonical repository web URL. Test an existing authored body and an exact GitHub or GitHub Enterprise link.

### CR-374 Custom evidence cleanup can recursively delete unrelated directories

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:780`
- failure mode: configuring `test.evidence.local_root` to an existing shared directory causes every child directory to be treated as run-owned and recursively deleted by age or count. A symlinked root can also bypass the lexical worktree exclusion.
- evidence or reproduction: `internal/paths/paths.go:83-104` accepts any absolute path outside the lexical managed-worktree tree. `prepareEvidenceStorage` enumerates every directory under that root and calls `os.RemoveAll` based only on modification time or list position at lines 789-817; it checks no ownership marker, run identifier, or database record.
- fix direction: place all managed evidence below a product-owned child directory and verify an ownership marker or durable run record before deletion; resolve symlinks before boundary checks and reject dangerous roots. Add a shared-root fixture with old foreign directories that must survive retention and max-run cleanup.

### CR-375 The reduced child environment is not Windows-safe

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/agent/env.go:83`
- failure mode: on native Windows, common environment keys use names such as `Path`, `USERPROFILE`, `TEMP`, `SystemRoot`, `ComSpec`, and `PATHEXT`. The allowlist compares most keys case-sensitively to Unix names and drops the Windows runtime state, so agent CLIs and configured commands can start but fail to locate child tools, home configuration, temporary storage, or system components.
- evidence or reproduction: lines 85-89 compute an uppercase key but use the original `key` for every equality except `LC_`, and the allowlist contains no Windows-specific runtime variables. The filtered environment is applied to every validation adapter and configured command.
- fix direction: define a platform-aware, case-insensitive execution allowlist that preserves the minimal Windows runtime variables without restoring credential-bearing variables; add a Windows test that receives `Path` casing, resolves a child executable, finds its home and temp directory, and retains `SD_PARENT_RUN_ID`.

## Advisories

### ADV-001 Accepted provider configuration is ignored

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `tools/safety-dance/internal/config/config.go:492`
- evidence: `RepoConfig.UnmarshalYAML` accepts any `provider` string at lines 492-543, but runtime selection derives only from the upstream URL at `internal/cli/daemon.go:728-746`. The wizard rejects non-GitHub providers, while a manually written typo or unsupported provider survives config parsing and has no effect.
- suggestion: validate the field as empty or `github`, or remove it and rely solely on detected upstream provider identity.

### ADV-002 CLI documentation contains commands that fail as written

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `tools/safety-dance/docs/cli.md:6`
- evidence: the documented `respond` command omits required `--step-id` and `--generation` flags enforced by `internal/cli/respond.go:18-22`. Line 12 documents bare `safety-dance --plain`, but `--plain` is local to the `tui` subcommand at `internal/cli/tui.go:17-20`.
- suggestion: document a complete response invocation and use `safety-dance tui --plain`, or promote `--plain` to a root flag if bare-command support is intended.

## Dead Code and Dependency Review

- newly orphaned code: none confirmed. The unreferenced standalone agent runner identified in CR-367 was removed.
- dependency findings: no new major dependency finding. Go 1.26.6 and pinned `govulncheck` close CR-365; focused Go and release-contract checks pass. Hosted release execution remains unverified.

## Verdict

- decision: request_changes
- overall code-health change: the latest fixes close provider aliasing, submitted-head mirroring, release preflight, dependency scanning, and dead-code issues, but evidence publication introduces critical host-file and cleanup boundaries and leaves three prior lifecycle findings open.
- rationale: CR-368 through CR-375 can authorize parent-run mutation, accept uncheckpointed state, overwrite or delete foreign scheduler state, expose host files, lose durable evidence, corrupt pull-request content, delete unrelated directories, or break Windows validation. These are release-blocking failures in the task's security, durability, data-loss, and cross-platform contracts.

## Review Limits

- blocked or unavailable checks: hosted GitHub release execution, authorized live-provider behavior, hosted Windows service execution, and induced operating-system crash recovery were unavailable. The complete local `npm test` aggregate passed; green checks do not exercise the eight boundary failures recorded above.
- residual manual verification: after fixes, exercise Windows task ownership and child environments on a Windows host, perform a live provider run with pre-existing PR prose and captured media, and simulate a daemon crash while a child continues writing.
