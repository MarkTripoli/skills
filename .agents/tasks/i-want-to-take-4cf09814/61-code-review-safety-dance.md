---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: ccbdded66f32eabd83099a003fbe84da20f87b20
status: findings
summary: "The complete Safety Dance change was reviewed through ccbdded against origin/main. Critical admission, ordering, publication, and rollback failures remain, along with major provider, platform, validation, and operator-interface gaps. The next fix round must close CR-175 through CR-188 and add production-path regressions before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `ccbdded66f32eabd83099a003fbe84da20f87b20`
- commits: 109 commits in `origin/main..HEAD`; latest product repair is `9f104dc` and latest task receipt is `ccbdded`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: task artifacts and the two untracked task-evidence directories were excluded as review subjects

## Previous Round

- previous artifact: `59-code-review-safety-dance.md`
- CR-167 CI can certify checks from an unreviewed replacement head: fixed
- CR-168 CI fails instead of polling newly created checks: fixed
- CR-169 Non-GitHub repositories cannot complete the fixed pipeline: still open
- CR-170 Pull-request creation ignores the configured target branch: still open
- CR-171 Pending duplicate runs execute without becoming running: fixed
- CR-172 Startup recovery ignores configured worktree roots: fixed
- CR-173 Failed fresh initialization leaves a pre-existing orphan gate mutated: still open
- CR-174 Windows scheduled-task installation remains malformed: still open

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; latest receipt `26-implementation-safety-dance.md`; verification `16-verification-safety-dance.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and the changed-file conventions enforced by `scripts/validate.mjs`

## Change Profile

- intent and expected behavior: add the independently branded Safety Dance local Git gate, durable daemon, fixed validation and guarded publication pipeline, operator interfaces, canonical skill distribution, identity enforcement, and native release contract
- change description quality: no pull request exists; the latest code commit has a valid standalone subject but no body, and the task artifacts carry the behavioral rationale and limits
- implementation model and review model: implementation model not recorded; primary review used GPT-5.6 Sol with fresh specialist passes from GPT-5.6 Sol and GPT-6 Astra, with one broad pass falling back to Claude Fable 5.1
- changed-line size and logical cohesion: 225 non-task files and 37,781 changed lines; the change is one product import but far above the review split signal
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, and `internal/db/run.go` exceed 1,000 lines; no size-only finding is raised
- dependency or lockfile changes: a new Go module and `go.sum` were added; aggregate builds, race tests, vet, notices, and release checks pass

## Tests Reviewed First

- behavior claimed by tests: the verification artifact records all nine local repository commands and 28 locally decidable acceptance items as passing; the current review reran the focused gate, daemon, CLI, pipeline, SCM, and worktree race tests, then `npm run test:safety-dance`, which passed
- missing or misleading coverage: the latest production repair added no regression tests; current suites do not cover delayed pre-receive receipts, forged hook ancestry, out-of-order notifications, startup reconciliation ordering, uncertain push outcomes, orphan-gate compensation, native Windows Task Scheduler execution, non-GitHub hosts, durable PR target selection, structured validation evidence, exit classes, prompt discovery, or the omitted wizard and TUI fields

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `6163` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 6163 in / 73 out`

### Correctness

- assessment and evidence: temporary-repository reproductions proved accepted-push loss, nested-run admission, forged ancestry, and orphan-gate damage. Source tracing also found stale notification replacement, startup recovery races, uncertain publication outcomes, and required operator flows that are absent.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: the product is split into gate, daemon, DB, worktree, pipeline, SCM, CLI, TUI, and release owners, but several contracts exist only in comments or types while production uses narrower behavior. CR-183, CR-184, CR-187, and CR-188 identify those mismatches rather than treating file size as a defect.
- helper coverage: covered, level 2, confidence 0.62

### Architecture

- assessment and evidence: the durable owners are present, but receipt reconciliation starts before recovery, provider detection exceeds provider execution, PR target identity is not durable, and typed validation drops its required evidence. These ownership gaps cross the daemon, SCM, DB, and interface boundaries.
- helper coverage: covered, level 3, confidence 0.80

### Security

- assessment and evidence: the admission boundary accepts spoofed command-line ancestry and does not reject the actual `SD_PARENT_RUN_ID` marker. A validation child can obtain admission and create a new durable run despite the nested-run prohibition.
- helper coverage: covered, level 3, confidence 0.61

### Performance

- assessment and evidence: no critical or major performance regression was found. CI polling is bounded by the configured timeout or explicit unlimited sentinel, branch work is serialized only per repository/ref key, and the aggregate race suite passed.
- helper coverage: unavailable

## Verification Story

- command or inspection: `cd tools/safety-dance && go test -race ./internal/gate ./internal/daemon ./internal/cli ./internal/pipeline/steps ./internal/scm/github ./internal/worktrees`
- result: exit 0; `internal/scm/github` has no test files
- command or inspection: `npm run test:safety-dance`
- result: exit 0; identity scan, full Go race suite, vet, temporary binary build, and two release-contract tests passed
- command or inspection: temporary built-binary pushes with delayed preserved hooks and `SD_PARENT_RUN_ID`, forged process ancestry, SQLite insertion failure, and wizard service failure
- result: reproduced CR-175, CR-176, and both CR-180 failure paths without changing repository files
- manual, screenshot, or before-and-after evidence: no screenshot evidence applies; hosted Windows service, provider-backed PR/CI, and release execution were unavailable

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-175 Nested validation can forge managed-hook admission

- type: Potential issue
- severity: critical
- category: Security and privacy
- location: `tools/safety-dance/internal/daemon/admission.go:119`
- failure mode: `managedHookPeer` searches arbitrary ancestry argument fields for a hook path and `git-receive-pack`, checks `SD_MANAGED_HOOK`, and never rejects the `SD_PARENT_RUN_ID` marker actually propagated to validation children. A nested agent can mint a token and push a new gate update despite the explicit parent-run fence.
- evidence or reproduction: `SD_PARENT_RUN_ID=active-parent git push safety-dance HEAD:refs/heads/nested` succeeded and created the gate ref. Separately, `/bin/sh` with argv zero `git-receive-pack` and the hook path as an inert argument obtained a 64-character token without a managed hook or Git receive process.
- fix direction: reject parent-run ancestry in token issuance and verify operating-system executable identity plus actual hook invocation structure. Do not authorize from matching argument strings.

### CR-176 Receipt reconciliation deletes an admission before Git commits it

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/admission.go:86`
- failure mode: the one-second reconciler deletes a receipt whenever the gate ref does not yet equal the admitted SHA, but that is the expected state while pre-receive and its preserved user hook are still running. The accepted ref then changes, post-receive cannot match its receipt, and no durable run starts.
- evidence or reproduction: a preserved pre-receive hook that slept for three seconds produced a successful push followed by `notification does not match admitted update`; SQLite contained zero runs and the receipt store was empty. The ordering is visible at `internal/git/hook.go:63-69` and `internal/cli/daemon.go:223-230`.
- fix direction: represent in-flight, committed, and rejected receive transactions explicitly. An old ref or transient Git inspection error cannot by itself discard a durable receipt.

### CR-177 Delayed older notifications can cancel the newer branch run

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:441`
- failure mode: notification handling validates each receipt but does not compare accepted generations. If update A's asynchronous post-receive notification arrives after update B's, `Manager.Replace` treats arrival order as acceptance order, cancels B, and runs older A.
- evidence or reproduction: post-receive dispatches each notification in a background subshell at `internal/git/hook.go:102-110`; `recordPush` forwards every matching nonce to `Replace`, which unconditionally supersedes the current key at `internal/daemon/manager.go:64-80`.
- fix direction: persist and compare per-branch acceptance order under the branch lock. Reject stale replacement attempts even when their receipts remain valid.

### CR-178 Receipt processing races startup recovery

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/cli/daemon.go:223`
- failure mode: receipt reconciliation starts before protected worktrees are recovered and before `Manager.Recover`. It can create a newly journaled worktree that the startup snapshot does not protect, after which `RecoverPending` removes it. The same ordering can race two pending-to-running transitions and abort daemon startup.
- evidence or reproduction: the reconciler starts at lines 223-232, while worktree recovery and manager recovery do not run until lines 359-401. `internal/worktrees/ownership.go:121-126` removes unprotected pending paths, and `internal/daemon/manager.go:187-189` returns a losing transition error.
- fix direction: finish worktree recovery and manager reconstruction before starting reconciliation or accepting mutation IPC.

### CR-179 Cancellation can strand a successful remote push without a binding

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/push.go:56`
- failure mode: if cancellation kills `git push` after the remote accepts the update but before the client reports success, `Push` returns immediately and never queries the remote. The cancelled run is terminal, so mirror reconciliation and publication binding never run and restart cannot prove the published candidate.
- evidence or reproduction: `exec.CommandContext` returns directly on any push error at lines 56-62; remote verification starts only at line 63 and binding only at lines 148-167. `Manager.Replace` cancels and joins before superseding at `internal/daemon/manager.go:64-78`.
- fix direction: persist uncertain publication before invoking Git. On every push error or cancellation, reconcile the remote with a bounded non-cancelled context and finish mirror/binding recovery when the candidate landed.

### CR-180 Orphan gate rollback can mutate or delete pre-existing state

- type: Potential issue
- severity: critical
- category: Data integrity and integration
- location: `tools/safety-dance/internal/gate/gate.go:244`
- failure mode: a database insertion failure restores the working remote but not a pre-existing orphan gate snapshot. If wizard service installation fails after adopting that gate, `created=true` causes compensation to eject and recursively delete the whole pre-existing directory.
- evidence or reproduction: a temporary SQLite `BEFORE INSERT` abort left the orphan gate origin changed from `old-origin` to the new upstream. A separate wizard run with a failing temporary service command deleted a foreign sentinel stored in the orphan gate; the destructive call is `internal/cli/wizard.go:111-118`.
- fix direction: restore `gateBefore` on every post-provision failure and distinguish database-record creation from filesystem ownership. Wizard compensation must restore an adopted gate rather than eject it.

### CR-181 Windows service installation still cannot create a task

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/daemon/service.go:217`
- failure mode: the released Windows binary invokes `schtasks /Create` without the mandatory `/SC <schedule>` argument or an XML task definition, so setup cannot install the daemon service.
- evidence or reproduction: the exact argument list at lines 217-218 is invalid under the documented Task Scheduler syntax. Cross-compilation passes because it does not execute `schtasks`; the release workflow still ships Windows assets.
- fix direction: use a valid per-user trigger or a complete XML task definition, then add native Windows installation, ownership-query, start, and stop coverage.

### CR-182 Non-GitHub providers remain advertised but cannot execute

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:494`
- failure mode: production detects and configures GitLab, Bitbucket, Azure DevOps, Forgejo, and Gitea, then `newSCMHost` rejects every provider except GitHub before validation or publication.
- evidence or reproduction: a repository whose upstream detects as GitLab receives `provider gitlab is not supported by this build`; provider types remain public in `internal/scm/scm.go:22-31` and configuration in `internal/config/config.go:710-769`.
- fix direction: implement the exposed provider hosts, or reject and remove unsupported provider configuration and claims at setup rather than after an accepted push starts.

### CR-183 Pull-request target selection is not durable across restart

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/pr.go:34`
- failure mode: the PR step recomputes the base from current configuration and persists only the PR URL. If trusted configuration changes before restart, recovery searches the new base and may create a duplicate instead of continuing or retargeting the existing durable PR.
- evidence or reproduction: lines 34-54 derive the base and only call `UpdateRunPRURL`. The repository already defines `PRBaseBranchReader` and `PRBaseRetargeter` for this restart case at `internal/scm/host.go:393-409`, but production does not use them.
- fix direction: persist the resolved base with PR identity, recover it before lookup, and explicitly inspect or retarget an existing PR.

### CR-184 Typed validation drops the required findings and evidence

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/pipeline/steps/validation.go:81`
- failure mode: the schema requires only `pass`, `fail`, or `blocked`, and production discards the output after parsing that one field. Durable steps therefore contain no typed findings, scenario evidence, attempts, or output references required by the plan and cannot show what the agent evaluated after restart.
- evidence or reproduction: `parseTypedVerdict` and the JSON schema at lines 81-149 contain only `verdict`; the result is not persisted. Existing tests cover verdict parsing but not missing evidence or durable output.
- fix direction: require the planned findings and scenario schema, persist validated output and attempt/output references before completion, and test malformed, missing-evidence, cancellation, and restart cases.

### CR-185 Public commands do not expose the required exit classes

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/root.go:21`
- failure mode: every Cobra failure exits `1`, so scripts and hooks cannot distinguish usage, unavailable daemon, rejected request, failed run, and blocked run as required by the command contract.
- evidence or reproduction: `Execute` returns only zero or one at lines 21-26; no typed error-to-exit mapping exists.
- fix direction: define stable error classes at the CLI boundary, map them to documented nonzero codes, and cover the built binary for each class.

### CR-186 The distributed skill directs operators to prompts that status and logs do not show

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/safety-dance/references/commands.md:27`
- failure mode: the skill says to respond only to a prompt shown by `status` or `logs`, but status prints only run, branch, status, and head, while logs only reads a file. An operator following the skill cannot discover the durable step/action needed by `respond`.
- evidence or reproduction: compare the instruction at lines 27-35 with `internal/cli/status.go:62-68` and `internal/cli/logs.go:11-30`.
- fix direction: expose durable prompts and valid actions in status/log output, or route the skill to a command that does. Add a built-binary blocked-run response flow.

### CR-187 The identity scanner does not enforce the imported permission-text boundary

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `scripts/check-safety-dance-identity.mjs:47`
- failure mode: the scanner verifies the permission sentence exists in the license but scans only `Copyright` lines elsewhere. A copied `Permission is hereby granted` notice outside the legal file passes despite the plan's one-file legal boundary.
- evidence or reproduction: `legalLines` at lines 52-58 contains only lines beginning with `Copyright`; `tests/safety-dance-identity.test.mjs` has no outside-permission fixture.
- fix direction: compare the required imported notice text or stable legal fragments outside the allowlisted license and add a rejecting fixture.

### CR-188 Setup and TUI omit required operator state

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/wizard.go:142`
- failure mode: the public wizard suppresses the supported gate and provider prompts, while the TUI model has no publication state or persistent key hints. Operators cannot make the planned setup choices or inspect the publication/control state promised in compact, wide, and plain views.
- evidence or reproduction: the setup owner supports `gate` and `provider` at `internal/wizard/setup.go:44-65`, but production passes only `upstream` and `commands`. `internal/tui/model.go:5-10` and `internal/tui/view.go:21-53` contain no publication or key-hint fields.
- fix direction: collect and apply gate/provider selections in the public wizard, add publication and control hints to the shared semantic model, and cover matching compact, wide, and plain output.

## Advisories

### ADV-001 Configuration documentation overstates repository precedence

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `tools/safety-dance/docs/configuration.md:3`
- evidence: the document says repository settings override global values without qualification, while security-sensitive commands, agents, gates, and policies come from the trusted default-branch copy unless explicitly allowed.
- suggestion: document trusted versus pushed configuration and name which values may be overridden.

### ADV-002 Recovery trusts journal paths outside the managed root

- type: Potential issue
- severity: minor
- category: Data integrity and integration
- location: `tools/safety-dance/internal/worktrees/ownership.go:105`
- evidence: `RecoverRemoving` and `RecoverPending` execute forced worktree removal for journal `Dir` and `Source` values without proving the directory lies below the root being recovered. A temporary journal pointing at an unrelated worktree removed it, including uncommitted files; exploiting this requires same-user write access to the private runtime home.
- suggestion: reject journal paths outside the walked root and require a matching durable ownership row before forced removal.

## Dead Code and Dependency Review

- newly orphaned code: no separate orphan is raised; the unused PR base-reader and retargeter contracts are part of CR-183
- dependency findings: no lockfile, notice, build, license, or local vulnerability finding was confirmed; hosted dependency and release execution remain outside local proof

## Verdict

- decision: request_changes
- overall code-health change: Safety Dance adds the intended owners and passes local aggregate checks, but its core admission, branch-ordering, publication, rollback, provider, platform, and operator contracts remain incomplete
- rationale: four critical and ten major findings contradict the plan's trust, durability, platform, and interface requirements; green aggregate tests do not exercise the failing production paths

## Review Limits

- blocked or unavailable checks: no pull request or title exists; native Windows Task Scheduler, live non-GitHub providers, hosted CI, and `safety-dance-v*` release execution were unavailable. The performance helper judgment returned `unclear`, so that helper result was skipped and the axis was decided from the pinned diff and checks.
- residual manual verification: after fixes, repeat the delayed-hook, forged-ancestry, out-of-order notification, startup recovery, uncertain-push, orphan-gate, native Windows, provider-backed PR/CI, and built-binary operator flows
