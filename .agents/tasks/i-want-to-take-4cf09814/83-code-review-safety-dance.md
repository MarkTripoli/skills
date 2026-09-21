---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 0b78d3ae939ed92fbe3a7280b40a6ebcb4fed40e
status: findings
summary: "The complete Safety Dance change was reviewed against origin/main at 0b78d3a. One critical release-workflow failure and ten major correctness, durability, lifecycle, and platform findings remain; the next phase must fix them and repeat review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `0b78d3ae939ed92fbe3a7280b40a6ebcb4fed40e`
- commits: 150 commits in `4458fbf..0b78d3a`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts under `.agents/tasks/i-want-to-take-4cf09814/` and the two task-owned untracked directories

## Previous Round

- previous artifact: `81-code-review-safety-dance.md`
- CR-280 Receipt mutations still bypass managed-hook authorization: fixed
- CR-281 Notification persistence failure drops live receipt custody: fixed
- CR-282 Capture fallback executes client push options through a shell: fixed
- CR-283 A crash before lock PID publication blocks later pushes: fixed
- CR-284 Custom gates survive both failed setup and eject: still open
- CR-285 Failed database rollback destroys resources referenced by the surviving row: fixed
- CR-286 Branch keys alias distinct full Git refs: fixed
- CR-287 Restart changes completed-step fingerprints and replays work: fixed
- CR-288 Normal fast-forward publication is forced through the rewrite path: still open
- CR-289 Platform restart commands do not restart an active service: fixed
- CR-290 Runtime-home service identities are collision-prone: fixed
- CR-291 Release validation accepts versions outside SemVer: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced system as an independently named, complete Safety Dance product without references outside the required license
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; six phases require authenticated admission, durable branch runs, crash-safe replay, reviewed publication, operator interfaces, distribution, and native releases
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add the Safety Dance Go tool, canonical skill, durable local Git gate, operator interfaces, repository integration, and native release contract
- change description quality: the task artifacts and phase commits explain behavior and evidence; no pull request exists, so no pull-request title or body was available
- implementation model and review model: implementation model not recorded; review model `GPT-5.6 Sol`
- changed-line size and logical cohesion: 229 non-task files with 39,359 additions and 4 deletions; the work is one product import but spans six independently testable phases
- resulting large-file concerns: `internal/config/config.go` is 3,142 lines; `internal/scm/github/github.go`, `internal/agent/agent.go`, and `internal/db/run.go` exceed 1,100 lines, which raises ownership and review cost
- dependency or lockfile changes: new Go module and lock data add Bubble Tea, Cobra, SQLite, YAML, terminal, and support dependencies; no dependency-specific blocking defect was found

## Tests Reviewed First

- behavior claimed by tests: verification records nine repository commands, 30 acceptance items, race coverage, built-binary observations, release-contract checks, and repeated aggregate runs; the current focused Go race packages and release tests pass
- missing or misleading coverage: tests do not parse the release workflow YAML, contend for the generated receipt lock, crash around step-head persistence, exercise a rebase that changes push mode, query the TUI using persisted full refs, fail custom-gate compensation, replace a just-completed manager handle, or contain Windows managed-server descendants

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5254` in / `73` out

### Correctness

- assessment and evidence: the release workflow does not parse; custom-gate rollback, manager replacement, TUI lookup, pipeline restart, push-mode selection, and policy pinning contradict required behavior at the cited locations below
- helper coverage: covered, level 3, confidence 0.96

### Readability and Simplicity

- assessment and evidence: core ownership is concentrated in `internal/cli/daemon.go`, but durable policy, step state, Git state, and publication decisions cross separate callbacks; the non-atomic boundaries in CR-296 and CR-300 make the restart contract hard to preserve
- helper coverage: covered, level 2, confidence 0.86

### Architecture

- assessment and evidence: database transactions own accepted-ref and publication state, but step completion does not own the corresponding HEAD checkpoint, and admission stores only part of the resolved policy generation; CR-296 and CR-300 identify these ownership gaps
- helper coverage: covered, level 3, confidence 0.58

### Security

- assessment and evidence: managed-hook authorization and shell-safe fallback from the prior round are fixed; CR-300 still lets a durable run execute a later mutable policy generation, and CR-298 can lose publication custody after cancellation
- helper coverage: covered, level 2, confidence 0.51

### Performance

- assessment and evidence: no blocking hot-path query or unbounded-loop defect was found; CR-299 can leak Windows server descendants and their ports, memory, and file handles across daemon lifecycles
- helper coverage: unavailable

## Verification Story

- command or inspection: `go test -race ./internal/git ./internal/daemon ./internal/gate ./internal/cli ./internal/pipeline ./internal/pipeline/steps`; `node --test tests/safety-dance-release.test.mjs`; `git diff --check origin/main...HEAD -- . ':(exclude).agents/tasks/**'`; `actionlint .github/workflows/safety-dance-release.yml`; direct POSIX `mv` lock-contention reproduction
- result: focused Go race tests, three release tests, and the non-task diff check passed; `actionlint` failed at release workflow line 43; the lock reproduction showed a second directory move returns success inside an existing lock
- manual, screenshot, or before-and-after evidence: verification recorded built-binary and terminal observations at revision `49c6c2d`; no screenshot evidence was required, and hosted Windows, provider, or product-release evidence remains unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-292 Release workflow is invalid YAML

- type: Potential issue
- severity: critical
- category: Functional correctness
- location: `.github/workflows/safety-dance-release.yml:43`
- failure mode: GitHub cannot parse the product release workflow, so a valid `safety-dance-v*` tag cannot build or publish any archive or checksum manifest.
- evidence or reproduction: `actionlint .github/workflows/safety-dance-release.yml` exits 1 with `could not parse as YAML: did not find expected ',' or '}'`; the flow mappings at lines 44 and 52 contain unquoted `${{ ... }}` expressions, while `tests/safety-dance-release.test.mjs` checks text without parsing YAML.
- fix direction: convert the `with` and `env` flow mappings to block mappings and add a workflow syntax check to the release-contract test or aggregate.

### CR-293 Receipt lock admits multiple owners

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/git/hook.go:51`
- failure mode: when `$LOCK` already exists, `mv "$candidate" "$LOCK"` moves the candidate inside the existing directory and returns success; two hooks then both set `LOCK_OWNED=1`, rewrite receipt state concurrently, and can leave a permanent nested lock.
- evidence or reproduction: a direct POSIX reproduction created `lock` and `lock.123`, then `mv lock.123 lock` returned 0 and produced `lock/lock.123/pid`; the same acquisition appears in pre-receive at lines 51-67 and post-receive at lines 167-183, without a contention test.
- fix direction: use a portable atomic create-if-absent lock whose success cannot mean moving inside an existing directory, then execute two real contenders in a regression test.

### CR-294 Custom gates still survive failed setup and eject

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/wizard.go:163`
- failure mode: wizard setup moves the bare gate to a custom target but records no inverse action; rollback removes the default symlink and leaves the custom repository. Eject calls `os.Remove` on the non-empty target, ignores the failure, and removes only the symlink.
- evidence or reproduction: compensation at `internal/cli/wizard.go:193-225` invokes the original rollback, which knows only the default path; eject ignores the target-removal result at `internal/gate/gate.go:433-439`.
- fix direction: journal the relocation, restore or remove the owned target during rollback, recursively remove the verified owned target during eject, and test both failure paths.

### CR-295 A completed manager handle can block the next accepted push

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/manager.go:79`
- failure mode: replacement can capture a handle while its run finishes, wait for it, then call `SupersedeRun` on the completed row. The call fails, the already-created nonce worktree remains, and notification retries fail at the existing worktree path until restart.
- evidence or reproduction: `Manager.Replace` unconditionally supersedes after `prior.Wait()` at lines 79-89; the runner can persist completion before removing its map handle at `internal/cli/daemon.go:250-280` and `internal/daemon/manager.go:109-119`; current tests keep the prior runner blocked until cancellation.
- fix direction: reload durable status after the join, supersede only a still-supersedable row, and test replacement during the completed-to-handle-removal window.

### CR-296 Step completion and resulting HEAD are not crash-atomic

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:868`
- failure mode: a modifying step changes HEAD, updates `runs.head_sha`, and only later records step completion. A crash before the head update makes recovery reject and delete the changed worktree; a crash after it but before completion reruns the step against its own output.
- evidence or reproduction: HEAD persistence occurs inside the callback at lines 868-880, while `CompleteStep` runs afterward at `internal/pipeline/runner.go:186-203`; `RecoverDetached` rejects any mismatch at `internal/worktrees/ownership.go:250-267`.
- fix direction: commit the resulting HEAD and successful step state in one database transaction, and restore an interrupted worktree to the last durable checkpoint before replay.

### CR-297 Push mode is computed before the final reviewed candidate exists

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:801`
- failure mode: a submitted non-fast-forward head can be rebased into a fast-forward candidate, but `Rewrite` remains true because ancestry was checked before the pipeline. Servers that allow normal fast-forward pushes but reject force-style pushes reject the reviewed candidate.
- evidence or reproduction: `rewrite` is set from the initial `run.HeadSHA` at lines 801-808; the push callback updates only `Candidate` and `ReviewedHead` at lines 890-898; `Push` maps stale `Rewrite` directly to `--force-with-lease` at `internal/pipeline/steps/push.go:46-50`.
- fix direction: determine ancestry from the final reviewed HEAD immediately before `steps.Publish`, and add a daemon-path rebase-to-fast-forward regression.

### CR-298 Cancelled Git pushes can outlive publication custody

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/push.go:57`
- failure mode: context cancellation kills only the direct Git process, allowing SSH, credential, or transport descendants to survive and update the remote after the one immediate reconciliation check; the gate mirror and durable publication binding may then never be recorded.
- evidence or reproduction: `Push` uses raw `exec.CommandContext` and `CombinedOutput` at lines 57-63; the repository's `internal/shellenv/shell_command_unix.go:31-52` states that this leaves grandchildren and supplies group cleanup, but the push path does not use it.
- fix direction: run the push through the existing cross-platform process-tree lifecycle helper and add cancellation during an active transport.

### CR-299 Managed agent-server descendants leak on Windows

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/agent/server_windows.go:11`
- failure mode: OpenCode or RovoDev server children survive shutdown because startup applies console hardening only and shutdown kills only the direct PID; Windows process sweeping is a no-op because it assumes every subprocess uses a kill-on-close job object.
- evidence or reproduction: `internal/agent/server.go:78-107` starts the raw command; `server_windows.go:14-20` kills only `cmd.Process`; `internal/procreap/proc_other.go:5-22` documents and applies the conflicting job-object assumption.
- fix direction: place managed servers and descendants in a kill-on-close Windows job and close that job during every shutdown and startup-failure path.

### CR-300 Accepted runs do not pin one policy generation

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/cli/daemon.go:498`
- failure mode: admission resolves the trusted default-branch policy but persists only gates. Execution fetches the mutable default branch again, so a delayed or restarted run can combine old gates with new commands, agent, repository-command permission, and pull-request policy.
- evidence or reproduction: `pinGatesForAdmission` returns only `MarshalGates` at lines 498-542; run creation at lines 606-612 leaves `ValidationGeneration` unset; execution fetches and resolves the then-current default branch at lines 720-762.
- fix direction: persist the trusted revision and complete resolved policy snapshot with the accepted ref, populate the validation generation, and execute only that pinned generation.

### CR-301 TUI queries a short branch while durable runs use full refs

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/tui.go:49`
- failure mode: the TUI queries `main`, but accepted runs are stored as `refs/heads/main`; exact database lookup returns no run, so the current branch appears idle and TUI response or abort controls cannot target it.
- evidence or reproduction: `renderTUI` uses `git symbolic-ref --short HEAD` and exact lookups at lines 49-68; `recordPush` preserves the full ref at `internal/cli/daemon.go:568-581`, and current TUI tests cover rendering rather than database integration.
- fix direction: query with `git symbolic-ref HEAD` or canonicalize through `canonicalRef`, then add a full-ref TUI integration test.

### CR-302 Service activation failure can leave an installed definition

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/service.go:211`
- failure mode: failed activation leaves the attempted definition and recovery journal; wizard compensation discards `StopService` errors, while `Stop` restores state only after a successful manager command. The same manager failure can therefore leave setup state behind.
- evidence or reproduction: `Service.Install` writes the definition before activation and retains it on error at lines 211-243; `wizard/setup.go:95-100` ignores stop failure; `Service.Stop` restores only on successful unload or disable at lines 280-310.
- fix direction: restore or remove the owned definition and recovery journal even when service disable fails, and return the joined activation and cleanup errors.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none identified
- dependency findings: no blocking lockfile, license, or maintenance defect found; the release workflow failure prevents the packaged license and notices from shipping

## Verdict

- decision: request_changes
- overall code-health change: the branch adds the requested product boundaries and tests, but the remaining release, durability, policy, and lifecycle failures prevent safe delivery
- rationale: CR-292 blocks all native releases, while CR-293 through CR-302 leave accepted work, publication custody, restart behavior, operator controls, or cleanup inconsistent with the plan

## Review Limits

- blocked or unavailable checks: no pull request title or body exists; hosted Windows service execution, live provider behavior, induced process crashes, and a hosted product release were unavailable; the performance judgment returned `unclear`, so that helper judgment was skipped
- residual manual verification: after fixes, rerun a hosted `safety-dance-v*` release, Windows service and managed-server lifecycle checks, and credentialed provider flows
