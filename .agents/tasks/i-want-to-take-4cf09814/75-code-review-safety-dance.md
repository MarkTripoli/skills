---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 8a7055bb952180562cbc20f07becfcde925965dd
status: findings
summary: "Review of the complete 131-commit Safety Dance change found ten major failures in receipt custody and reconciliation, bootstrap-policy isolation, worktree recovery, wizard and TUI behavior, and source-identity removal. The next fix round must close CR-247 through CR-256 and add production-path regressions before another review."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` (`origin/main`)
- reviewed HEAD: `8a7055bb952180562cbc20f07becfcde925965dd`
- commits: 131 commits after the merge base; commit subjects pass `npm run check-commits -- origin/main..HEAD`.
- staged and unstaged changes: none.
- task-owned untracked files: 278 files below `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`.
- excluded changes: task artifacts and the two task-owned untracked evidence directories were excluded as review subjects.

## Previous Round

- previous artifact: `73-code-review-safety-dance.md`
- CR-240 Stale receipt locks still cannot be recovered: fixed
- CR-241 Wizard bootstrap lets a pushed branch self-authorize commands: fixed
- CR-242 Failed durable revocation can still resurrect a rejected update: still open
- CR-243 One reconciliation error permanently claims unrelated receipts: still open
- CR-244 A failed concurrent ref update can still launch a run: fixed
- CR-245 Worktree journal discovery still depends on the first `worktrees` path component: still open
- CR-246 Windows core validation still hard-codes `sh`: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the local Git gate as a fully renamed product with no source-repository references.
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; latest implementation receipt `26-implementation-safety-dance.md`; latest fix receipt `74-code-review-fixes-safety-dance.md`.
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `docs/testing.md`, and changed-file package conventions.

## Change Profile

- intent and expected behavior: add a Safety Dance Go binary, authenticated local Git gate, durable branch-scoped daemon, fixed validation and guarded publication pipeline, operator interfaces, canonical skill distribution, identity checks, and native release packaging.
- change description quality: no pull request exists. The 131 commit subjects stand alone and pass the repository checker, but there is no pull-request body documenting the 38,613-line product change, decisions, evidence, or limits.
- implementation model and review model: implementation receipts identify multiple agent-assisted iterations; review model `GPT-5.6 Sol` with three scoped implementation-review workers.
- changed-line size and logical cohesion: 227 non-task files, 38,609 additions and 4 deletions. The feature is one product, but its trust, durability, interface, distribution, and release surfaces exceed a normally reviewable single change.
- resulting large-file concerns: `internal/config/config.go` is 3,137 lines; `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/db/run.go`, and `internal/cli/daemon.go` exceed 900 lines. The defects below cross responsibilities concentrated in `daemon.go` and generated hook strings.
- dependency or lockfile changes: the new Go dependency graph is pinned in `go.sum` and `THIRD_PARTY_NOTICES.md` is generated. No concrete license, maintenance, or known-vulnerability defect was established.

## Tests Reviewed First

- behavior claimed by tests: gate initialization and hooks, admission authentication, branch replacement, durable pipeline state, guarded publication, wizard compensation, service definitions, TUI rendering, installer/runtime distribution, identity checks, release packaging, and built-binary end-to-end flow. `16-verification-safety-dance.md` records all locally decidable items passing at `49c6c2d`; `74-code-review-fixes-safety-dance.md` records focused Go race tests, the full Go suite, vet, and `npm test` passing at `e973105`.
- missing or misleading coverage: commit `e973105` changes eight production files but no tests. Current tests do not cover reconciliation failures, receipt persistence failures, a default `SD_HOME` journal recovery, multiple repository bootstrap policies, policy removal, wizard gate/provider collection, or the full response text at narrow widths. `TestRenderWidthPreservesStatusAndPrompt` checks only the word `prompt`, permitting the action itself to disappear.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5799` in / `73` out
- helper provenance: `judge: model jev-1.13.0, tokens 5799 in / 73 out`

### Correctness

- assessment and evidence: CR-247 through CR-254 show accepted updates can lose custody, reconciliation can spin without returning, crash recovery can leak worktrees, setup omits required choices, and narrow rendering hides required actions. The focused race command passed, but its tests do not exercise these paths.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: receipt ownership is split between generated shell, daemon memory, and a JSON store, while bootstrap trust is resolved differently in admission and execution. The duplicated protocols obscure the invariants and caused CR-247, CR-248, CR-250, CR-251, and CR-256.
- helper coverage: covered, level 3, confidence 0.54

### Architecture

- assessment and evidence: repository policy needs one repository-bound resolver, worktree ownership needs one journal-root owner, and receipt processing needs one durable state machine. Global bootstrap state and path inference place those invariants outside their responsible repository and runtime owners.
- helper coverage: covered, level 3, confidence 0.84

### Security

- assessment and evidence: CR-250 lets one repository supply trusted commands to another, CR-251 can accept a ref without recording the receipt needed to launch validation, and CR-255 leaves direct source-repository identity in shipped code despite the task boundary.
- helper coverage: covered, level 2, confidence 0.52

### Performance

- assessment and evidence: CR-248 can retry one failed receipt in an unbounded tight loop at full CPU and starve every later receipt. No other concrete hot-path or unbounded-query defect was established.
- helper coverage: covered, level 2, confidence 0.75

## Verification Story

- command or inspection: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli ./internal/git ./internal/worktrees ./internal/pipeline/steps`; `npm run check-commits -- origin/main..HEAD`; `git diff --check origin/main...HEAD -- ':!.agents/tasks/**'`; complete diff, latest fix diff, production callers, and changed tests inspected.
- result: focused race tests, 131 commit-subject checks, and product diff checks passed. Passing tests do not cover the ten production failures below.
- manual, screenshot, or before-and-after evidence: no hosted Windows execution, live-provider run, hosted release, pull-request CI run, or interactive narrow-terminal capture exists. Static traces establish each finding without those environments.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-247 Receipt removal still reports failed rewrites as success

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/git/hook.go:64`
- failure mode: after a preserved pre-receive hook rejects a push, daemon revocation can succeed while the shell receipt rewrite fails. `remove_receipt` then returns the successful status of `unlock_receipts`, so `revoke_accepted` treats local removal as successful and leaves a stale token that a later identical accepted update selects first.
- evidence or reproduction: the `awk`/`mv` failure branch at lines 67-70 removes only the temporary file; line 71 overwrites that status. The post-receive lookup at lines 151-155 selects the first matching old/new/ref token, and the daemon rejects the stale revoked token. No persistence-failure regression was added in `e973105`.
- fix direction: retain the rewrite result across unlock, return nonzero on `mktemp`, `awk`, or `mv` failure, and add a rejected-push regression that forces local rewrite failure before an identical accepted update.

### CR-248 Reconciliation retries one failed receipt forever

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/safety-dance/internal/daemon/admission.go:88`
- failure mode: a stale ref, persistent callback error, nil callback, or receipt-save failure releases the claim and immediately selects the same accepted receipt again. `ReconcileOnce` never returns to the one-second ticker, consumes CPU, can invoke the same callback repeatedly, and starves other receipts.
- evidence or reproduction: the unbounded loop selects any accepted unclaimed token at lines 90-100. Every failure path at lines 105-123 and 129-132 removes or omits the claim before `continue`, making the token eligible in the next iteration. The latest fix has no reconciliation-error test.
- fix direction: process a fixed snapshot or attempted-token set so each receipt runs at most once per call, restore state transactionally after persistence failure, aggregate errors, and test stale-ref, callback, and save failures with multiple receipts.

### CR-249 Default worktree journals are written outside the startup scan

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/worktrees/ownership.go:17`
- failure mode: with normal `SD_HOME`, creation and removal journals for default worktrees are written to `$SD_HOME/.safety-dance-journals`, but startup scans `$SD_HOME/worktrees/.safety-dance-journals`. A crash leaves unowned or terminal worktrees registered and on disk with no replay.
- evidence or reproduction: `metadataDir` returns `root/.safety-dance-journals` for every path below `root/worktrees` at lines 19-26. Startup seeds roots with `filepath.Join(p.Root(), "worktrees")` at `internal/cli/daemon.go:419` and `RecoverPending` appends `.safety-dance-journals` at `internal/worktrees/ownership.go:197`. `RunWorktreesOutside` excludes default placements, so the new discovery branch does not add the missing root.
- fix direction: make journal placement and discovery use the same explicit runtime-owned root, then test crash recovery with `SD_HOME` set and a default worktree path.

### CR-250 Bootstrap trust is global, permanent, and repository-unbound

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `tools/safety-dance/internal/paths/paths.go:41`
- failure mode: every wizard writes the same `$SD_HOME/bootstrap-repo-config.yaml`. Configuring repository B replaces repository A's trusted initial commands; any repository without committed default-branch policy executes the last wizard's policy. Deleting a committed policy later also resurrects the stale bootstrap instead of revoking command trust.
- evidence or reproduction: `BootstrapConfigFile` contains no repository identity, `runWizard` overwrites it at `internal/cli/wizard.go:113`, and every missing-policy execution loads it at `internal/cli/daemon.go:707-717`. No repository binding, trusted revision, or consumed state is stored.
- fix direction: store bootstrap policy under stable repository identity, bind it to the initial trusted revision, resolve admission and execution through one policy owner, and retire the bootstrap permanently once committed policy is observed. Test two repositories and policy removal.

### CR-251 Pre-receive accepts updates after custody writes fail

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/git/hook.go:83`
- failure mode: a filesystem error can leave the captured receive input empty or omit the admitted token from `$ACCEPTED` or `$RECEIPTS`, yet the hook exits zero. Git mutates the ref, but post-receive lacks the token required to create the durable run.
- evidence or reproduction: `cat > "$INPUT"` at line 83, the append to `$ACCEPTED` at line 102, and the append to `$RECEIPTS` at line 104 do not check status. Admission therefore fails open after the daemon has issued or persisted a token. Existing executable-hook tests do not inject these write failures.
- fix direction: check every custody write, durably revoke any issued receipt, reject before ref mutation, and add disk/write-failure hook tests.

### CR-252 Successful completion becomes terminal before cleanup is journaled

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/cli/daemon.go:241`
- failure mode: a crash after the run transitions to `completed` but before `JournalRemoval` writes cleanup intent leaves a terminal run's worktree permanently registered and on disk. Startup has neither an active placement to protect nor a removal journal to replay.
- evidence or reproduction: lines 244-245 transition the run and set cleanup before lines 247-250 call `journalCleanup`. The error path journals first at lines 234-239, matching `JournalRemoval`'s stated contract; the success path reverses that order.
- fix direction: durably journal removal before every terminal transition, clear or complete the journal only after Git removal, and add a crash-point recovery test between journal, terminal status, and removal.

### CR-253 The setup wizard omits required gate and provider choices

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/wizard.go:160`
- failure mode: operators cannot choose the gate location or provider promised by Phase 4. The production wizard asks only for upstream and eight commands, then always uses the default gate owner and auto-detected SCM path.
- evidence or reproduction: `PromptLabels` is `{"upstream", "commands"}` at lines 160-161. `wizard.Model` still defines `Gate` and `Provider`, but production never populates or persists them. The generic setup tests do not drive `runWizard` and therefore do not catch the omission.
- fix direction: collect, validate, persist, and apply gate and supported-provider choices through their owning config and gate layers, or revise the accepted plan before shipping. Add built-command cancellation, rollback, and idempotent-rerun tests.

### CR-254 Narrow rendering hides the action required to continue a run

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/tui/view.go:52`
- failure mode: compact terminals truncate the prompt and key hint like ordinary detail text. At width 8, `prompt: approve` renders as `prompt:…`, so the operator cannot see the required response or available action.
- evidence or reproduction: lines 37-45 add full prompt and key-hint strings, then lines 52-54 truncate every line. `TestRenderWidthPreservesStatusAndPrompt` at `internal/tui/view_test.go:18-28` asserts only that `prompt` remains, not `approve` or the complete keys. This contradicts the plan's requirement that narrow layouts preserve required responses.
- fix direction: use width-aware compact semantic labels that retain the complete actionable choices, and add compact/wide golden tests for waiting, failed, cancelled, and published states plus plain-output equivalence.

### CR-255 Shipped sources still name the repository being removed

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `scripts/check-safety-dance-identity.mjs:12`
- failure mode: the resulting repository still directly names the source repository owner, contradicting the task's requirement to make no references to that repository. The identity check cannot detect the bare owner token because it only matches the assembled full URL.
- evidence or reproduction: `rg -n -i 'kunchenguid|no[-_ .]?mistakes' --glob '!.agents/tasks/**' --glob '!tools/safety-dance/LICENSE' .` finds the owner at `scripts/check-safety-dance-identity.mjs:12` and `tests/safety-dance-identity.test.mjs:29`.
- fix direction: assemble the owner token from fragments in fixtures and add a rejected bare-owner pattern while retaining the required legal notice only in `tools/safety-dance/LICENSE`.

### CR-256 Empty-lock recovery can create two concurrent receipt owners

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/git/hook.go:51`
- failure mode: hook A can create the lock directory and pause before writing `pid`; after one second hook B deletes that live lock and acquires it. Hook A then writes into B's directory and both enter the receipt critical section, allowing concurrent rewrites to lose admission tokens.
- evidence or reproduction: `mkdir` succeeds at line 53, but ownership is published only at line 61. The contender treats an empty owner as stale after ten 100 ms waits at line 56, with no atomic proof that the creator died. The same protocol is duplicated in post-receive at line 142.
- fix direction: use an OS lock or atomically publish owner identity before acquisition becomes visible; test a creator suspended between lock creation and owner publication with a concurrent receive hook.

## Advisories

### ADV-001 Cancelled recovery reports an unpublished cancellation as failed

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `tools/safety-dance/internal/cli/daemon.go:635`
- evidence: the prior advisory remains: cancelled recovery returns an error when the remote differs from the reviewed candidate, and the manager can replace the persisted cancelled state with failed rather than clear publication ownership and preserve cancellation.
- suggestion: return a typed unpublished-cancellation result, retain `RunCancelled`, clear `push_active`, and cover pre-push cancellation restart.

### ADV-002 Configuration and platform docs are inaccurate

- type: Potential issue
- severity: minor
- category: Maintainability and code quality
- location: `tools/safety-dance/docs/configuration.md:3`
- evidence: configuration docs say repository settings override global settings without describing trusted-default-branch, bootstrap, or pushed-field precedence. `docs/safety-dance.md:7` says releases cover Linux and macOS while `.github/workflows/safety-dance-release.yml` also builds Windows amd64.
- suggestion: document precedence by field class and list the Windows archive and executable shape without claiming hosted runtime evidence.

## Dead Code and Dependency Review

- newly orphaned code: `wizard.Model.Gate` and `wizard.Model.Provider` are production-orphaned inputs because `runWizard` never prompts for or consumes them; this is part of CR-253.
- dependency findings: dependencies are pinned and notices are generated; no additional dependency finding was established.

## Verdict

- decision: request_changes
- overall code-health change: Safety Dance adds the requested product and broad offline checks, but production trust, custody, crash recovery, operator setup, and compact rendering remain unsafe or incomplete.
- rationale: ten major findings can lose or duplicate accepted work, cross repository trust boundaries, leak worktrees after crashes, omit required setup controls, hide required responses, and retain a forbidden repository reference.

## Review Limits

- blocked or unavailable checks: hosted Windows service and command execution, authorized live-provider behavior, hosted `safety-dance-v*` release execution, hosted pull-request CI, and interactive terminal capture were unavailable. No pull request exists, so no title or body was reviewed.
- residual manual verification: after fixes, run concurrent and write-failure receive hooks, multi-receipt reconciliation failures, default-root crash recovery, two-repository bootstrap setup plus policy removal, a crash between successful transition and cleanup, built wizard gate/provider selection, and narrow-terminal response flows.