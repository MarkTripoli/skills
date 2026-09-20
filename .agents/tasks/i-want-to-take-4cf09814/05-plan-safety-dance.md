---
task: i-want-to-take-4cf09814
type: plan
summary: "This repaired plan implements Safety Dance in six testable phases and makes Phase 1 independently executable through a private admission handler plus a test-only hook helper, without moving the public CLI before Phase 4. It fixes the product namespace, persistence and concurrency boundaries, publication order, installer ownership, identity scan, and release contract. Implementation must pass each phase's listed checks and preserve the imported MIT notice before advancing."
repo: skills
branch: safety-dance
sha: f91e15029686fee9fce2d68f3eae88b779ad7ee4
---

# Safety Dance implementation plan

## Overview

Add Safety Dance as an independently branded Go tool in `tools/safety-dance/` and a canonical non-worker skill in `skills/delivery/safety-dance/`. The implementation keeps the selected source snapshot's local bare Git gate, durable daemon, branch-scoped validation, guarded upstream publication, terminal interfaces, and service management. The root repository continues to own skill installation and runtime adaptation.

The implementation uses one product contract everywhere outside the required imported license:

| Contract | Value |
|---|---|
| Go module | `github.com/MarkTripoli/skills/tools/safety-dance` |
| Binary and command | `safety-dance` |
| Local Git remote | `safety-dance` |
| Agent command | `/safety-dance` |
| Runtime root | `SD_HOME`, default `~/.safety-dance` |
| Repository config | `.safety-dance.yaml` |
| Runtime environment prefix | `SD_` |
| Installer and provider environment prefix | `SAFETY_DANCE_` |
| Product release tags | `safety-dance-v<version>` |

Do not add aliases for retired commands, paths, environment variables, services, database fields, fixtures, or release names.

## Current State Analysis

This repository is a Node package of canonical skills. `scripts/lib/build.mjs` scans `skills/`, copies every selected skill into runtime-specific trees, and emits worker definitions only for names beginning with `agent-` (`scripts/lib/build.mjs:70-119`). `scripts/install.mjs` plans writes before applying them, copies only selected skill directories, and removes only the selected resources on uninstall (`scripts/install.mjs:180-216`, `scripts/install.mjs:294-372`). Safety Dance should use these owners rather than add another skill installer.

There is no `tools/` tree or Go module on the branch baseline. The uncommitted Phase 1 work now contains the module, gate, hooks, and IPC token code, but no daemon package or public command. The latest implementation receipt records three passing package checks and one blocking gap: generated hooks have not run through a real executable adapter against authenticated IPC in a temporary bare repository. `.github/workflows/commits.yml` checks commit subjects, `.github/workflows/release.yml` manages Changesets releases, and `package.json` makes `npm test` the aggregate offline check (`package.json:18-28`).

### Key discoveries

- `scripts/validate.mjs` fixes the canonical skill count at 43, validates line 6 and referenced files, requires delivery skills to appear in `workflows/delivery.md`, and scans repository text for banned tokens (`scripts/validate.mjs:19-32`, `scripts/validate.mjs:274-329`, `scripts/validate.mjs:491-529`). Safety Dance must increase the count to 44 and satisfy those contracts.
- `scripts/sync-plugin.mjs` derives `.claude-plugin/plugin.json` from non-worker skills and creates `agents/` files only for `agent-*` skills (`scripts/sync-plugin.mjs:18-39`, `scripts/sync-plugin.mjs:65-70`). The generated plugin file is committed output, not a second source of truth.
- Installer tests already prove selected install and uninstall behavior across Claude Code, Codex, Oh My Pi, Pi, and portable destinations while preserving foreign files (`tests/install.test.mjs:101-135`). Extend that pattern for `safety-dance`.
- The selected source behavior depends on strict ordering at the publication boundary: reviewed-head continuity, remote-head lease selection, upstream ref verification, gate-mirror update, then durable publication binding. Reordering any of these checks can publish an unreviewed or stale head.
- Existing offline checks do not need provider credentials (`docs/testing.md:3-23`). New unit, race, identity, installer, and release-contract checks must preserve that property.

## Desired End State

A developer runs `safety-dance init` in a Git repository, pushes to the generated local `safety-dance` remote, and receives an authenticated gate decision before the bare gate changes. An accepted push creates a durable branch-scoped run. A newer push replaces work only for the same repository and branch; different branches may run concurrently. Every run uses its own disposable worktree.

The fixed pipeline records typed step results and publishes only the reviewed candidate. The push step checks the live upstream head, uses an explicit lease when history was rewritten, verifies the published ref, reconciles the local gate mirror, and then records the publication binding. Restart recovery must not repeat a completed publication.

The public CLI, wizard, service management, status commands, logs, and TUI use the Safety Dance contract. The canonical `/safety-dance` skill reaches all four runtime builds and portable installs through the existing repository installer. A `safety-dance-v*` tag produces checksummed native archives without coupling product releases to Changesets tags.

## What We're NOT Doing

- Migrating installations, hooks, services, SQLite databases, or configuration created by another product.
- Shipping old-name command aliases, environment fallbacks, path probes, or database migrations.
- Making the pipeline order configurable.
- Replacing `scripts/install.mjs` with a second skill installer inside the Go tool.
- Letting nested validation agents initialize, rerun, respond to, abort, or bypass their parent run.
- Adding remote service infrastructure, hosted queues, or telemetry.
- Claiming live GitHub pull-request, CI, or release proof from local fixtures.
- Deleting task history or scanning task artifacts as shipped product identity.

## Execution Strategy

Implement the trusted path before adding the public binary. Phase 1 creates the module, authenticated gate packages, a private daemon admission handler, and a test-only executable hook helper. That helper proves the generated shell hooks and real IPC boundary without exposing a product command. Phase 2 extends the daemon owner with durable branch-scoped execution. Phase 3 adds the fixed validation pipeline and guarded publication. Phase 4 wires the proven admission and notification calls into `cmd/safety-dance` and adds operator interfaces. Phase 5 connects one canonical skill to existing build and install owners. Phase 6 adds aggregate checks, identity enforcement, documentation, and product-specific releases.

Each phase commits production code with its package tests and leaves the repository runnable at that layer. Package APIs may remain `internal`; the first three phases use tests as their entry points. Test-only executable fixtures live below `testdata` and cannot become shipped commands. Do not create placeholder public commands or empty package shells for later phases.

---

## Phase 1: Admit authenticated pushes through the branded local gate

### Goal

Create the independent Go module and prove that gate initialization, receive-hook admission, and daemon notification use one Safety Dance identity. The pre-receive hook rejects an unauthenticated update. The post-receive hook records notification failure after an accepted update instead of claiming rollback.

### Required Edits

#### 1.1 Create the module, legal notice, and identity contract

**Files**:
- `tools/safety-dance/go.mod`
- `tools/safety-dance/go.sum`
- `tools/safety-dance/LICENSE`
- `tools/safety-dance/internal/paths/paths.go`
- `tools/safety-dance/internal/paths/paths_test.go`
- `tools/safety-dance/internal/config/config.go`
- `tools/safety-dance/internal/config/config_test.go`
- `tools/safety-dance/internal/types/types.go`
- `tools/safety-dance/internal/types/findings.go`

**Changes**:
- Set the module to `github.com/MarkTripoli/skills/tools/safety-dance` and pin the imported dependencies in `go.sum`.
- Copy the upstream MIT copyright and permission text unchanged into `tools/safety-dance/LICENSE`. Do not move that attribution into product copy.
- Centralize filesystem names in `internal/paths`. Resolve `SD_HOME` first and default to `~/.safety-dance`; derive the state database, gates, worktrees, logs, socket or named-pipe metadata, PID file, and singleton lock below that root.
- Load global config from `$SD_HOME/config.yaml` and repository overrides from `.safety-dance.yaml`. Reject unknown or invalid safety-sensitive values using the imported configuration behavior.
- Port run status, terminal-state predicates, findings, scenario evidence, verdicts, gate notification, and ref-update types before higher packages depend on them.
- Replace every module import and serialized product-controlled identifier as one change. Do not retain compatibility fields.

```go
func Home() (string, error) {
    if root := os.Getenv("SD_HOME"); root != "" {
        return filepath.Abs(root)
    }
    home, err := os.UserHomeDir()
    if err != nil { return "", err }
    return filepath.Join(home, ".safety-dance"), nil
}
```

#### 1.2 Port bare-gate setup as a rollback-safe transaction

**Files**:
- `tools/safety-dance/internal/gate/gate.go`
- `tools/safety-dance/internal/gate/gate_test.go`
- `tools/safety-dance/internal/git/hook.go`
- `tools/safety-dance/internal/git/hook_test.go`

**Changes**:
- Port gate initialization, repair, and managed-hook refresh into `internal/gate` and `internal/git`.
- Create the bare gate below `$SD_HOME/repos`, set its `origin` to the real upstream, enable push options, isolate the hooks path, and add or repair the working repository's `safety-dance` remote.
- Preserve pre-existing user hooks under a Safety Dance-owned backup name and execute them after managed admission. Refreshing the managed hook must not overwrite that backup.
- Record the original working-repository remote configuration and delete only files and Git keys created by the failed transaction.
- Cover first initialization, idempotent repair, partial failure rollback, preserved user hooks, and exact remote URL changes with temporary repositories.

```text
init transaction
  record original remote and Git config
  create or repair bare gate
  install managed hooks
  add or repair remote "safety-dance"
  commit transaction
on error
  restore original Git config
  remove only paths created by this attempt
```

#### 1.3 Authenticate admission and notify accepted updates

**Files**:
- `tools/safety-dance/internal/ipc/client.go`
- `tools/safety-dance/internal/ipc/server.go`
- `tools/safety-dance/internal/ipc/auth.go`
- `tools/safety-dance/internal/ipc/ipc_test.go`
- `tools/safety-dance/internal/daemon/admission.go`
- `tools/safety-dance/internal/daemon/admission_test.go`
- `tools/safety-dance/internal/git/hook.go`
- `tools/safety-dance/internal/git/hook_test.go`
- `tools/safety-dance/internal/git/hook_e2e_test.go`
- `tools/safety-dance/internal/git/testdata/hook-helper/main.go`

**Changes**:
- Port the local IPC request and response types needed by receive hooks. Use Unix-domain sockets on Unix and the imported Windows local transport behind build-tagged files when required.
- Add the private daemon admission owner now, before durable run management. It registers the real admission method, binds each request to the operating-system-authenticated peer, gate, ref, launch token, and parent-process policy, then consumes the token once. Phase 2 extends this package instead of replacing the handler.
- Add a test-only executable under `internal/git/testdata`. It parses only `daemon admit-push` and `daemon notify-push`, calls the real IPC client, and exists solely so generated hooks can execute a process before Phase 4 adds `cmd/safety-dance`.
- Generate `pre-receive` so a nonzero `admit-push` result rejects the Git update. Generate `post-receive` so it forwards old SHA, new SHA, ref, and supported push options to `notify-push`.
- Keep notification non-blocking after Git accepts the ref. Print the error and append it to `<gate>/notify-push.log`; never report that the accepted ref was reverted. Tests must wait with a bounded poll for the asynchronous notification instead of reading the log immediately.
- Build the test helper into a temporary directory, install hooks rendered with its absolute path, and push to a temporary bare repository backed by the real IPC server. Prove unauthenticated rejection, authenticated acceptance, replay rejection, mismatched-gate rejection, accepted-ref notification, and preserved hook input. String assertions alone do not satisfy this check.

```sh
# managed pre-receive shape, inside the ref-update loop
safety-dance daemon admit-push --gate "$GATE_DIR" --ref "$refname" --token "$TOKEN" || exit 1

# managed post-receive shape, inside the ref-update loop
safety-dance daemon notify-push --gate "$GATE_DIR" --ref "$refname" --old "$oldrev" --new "$newrev" || {
  printf '%s\n' "Safety Dance notification failed" >&2
  exit 0
}
```

### Success Criteria:

#### Automated Verification:

- [x] `cd tools/safety-dance && go test -race ./internal/config ./internal/paths ./internal/types ./internal/git ./internal/gate ./internal/ipc`
- [x] `cd tools/safety-dance && go test ./internal/gate -run 'Init|Repair|Hook|Rollback|Preserve'`
- [x] `cd tools/safety-dance && go test ./internal/git -run 'PreReceive|PostReceive|NotifyFailure|PushOptions'`
- [x] `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git -run 'Admission|ExecutableGate|Authenticated|Replay|Mismatch|AcceptedRefNotification'`

Done when temporary Git repositories prove unauthenticated rejection, authenticated admission, replay and gate mismatch rejection, accepted-ref notification, preserved user hooks, and rollback that touches only Safety Dance-owned state. The executable proof uses the test-only helper; no public binary entry point exists yet.

human-gated: false

---

## Phase 2: Persist and coordinate branch-scoped runs

### Goal

Turn each accepted notification into a durable run before work starts. One daemon owns the runtime home, replaces an active run only for the same repository and branch, permits different branches to overlap, and retains worktrees owned by active or recoverable records.

### Required Edits

#### 2.1 Add SQLite schema, transitions, and recovery queries

**Files**:
- `tools/safety-dance/internal/db/db.go`
- `tools/safety-dance/internal/db/migrations.go`
- `tools/safety-dance/internal/db/repositories.go`
- `tools/safety-dance/internal/db/runs.go`
- `tools/safety-dance/internal/db/steps.go`
- `tools/safety-dance/internal/db/publications.go`
- `tools/safety-dance/internal/db/db_test.go`

**Changes**:
- Create a new Safety Dance schema for repositories, accepted refs, runs, typed step results, prompts and responses, cancellation state, worktree ownership, and publication bindings.
- Make run creation and accepted-head custody one transaction. Store repository identity, branch, gate head, previous reconciled head, launch nonce, validation generation, requested options, and timestamps before starting a goroutine.
- Express legal status changes as guarded updates that include the expected prior state. A cancelled or superseded run cannot later write a successful terminal state.
- Add restart queries that distinguish pending, running, cancelling, published, completed, and failed records. Never infer a publication from the mutable upstream head.
- Test migrations from an empty database, transition conflicts, concurrent readers, cancellation, and crash-state classification with real temporary SQLite files.

```sql
UPDATE runs
SET status = ?, updated_at = ?
WHERE id = ? AND status = ?;
-- Require exactly one changed row before exposing the new state.
```

#### 2.2 Add singleton daemon ownership and per-branch replacement

**Files**:
- `tools/safety-dance/internal/daemon/admission.go`
- `tools/safety-dance/internal/daemon/daemon.go`
- `tools/safety-dance/internal/daemon/manager.go`
- `tools/safety-dance/internal/daemon/recovery.go`
- `tools/safety-dance/internal/daemon/daemon_test.go`
- `tools/safety-dance/internal/daemon/manager_test.go`
- `tools/safety-dance/internal/daemon/subscribe_recover_test.go`

**Changes**:
- Extend Phase 1's private admission owner into the runtime daemon. Keep the admission handler as the only owner of receive-hook authentication.
- Acquire one process lock for `SD_HOME` before binding IPC. A second daemon must fail without replacing the socket or PID record owned by the first.
- Key run coordination by stable repository identity plus full branch ref. Hold the key lock while cancelling and joining the prior run, persisting the replacement, and assigning its worktree. Release it before the pipeline performs long work.
- Recheck current ownership after every blocking wait so an older cancellation path cannot act on a newer run.
- Permit managers for different keys to execute concurrently. Add barriers or channels in race tests to prove actual overlap rather than only checking elapsed time.
- On restart, rebuild managers from SQLite, classify interrupted states, and resume only operations whose durable record permits replay.

```go
type BranchKey struct {
    RepositoryID int64
    Ref           string
}

func (m *Manager) Replace(ctx context.Context, key BranchKey, accepted AcceptedRef) (*Run, error) {
    unlock := m.lock(key)
    defer unlock()
    if prior := m.active(key); prior != nil {
        prior.Cancel()
        prior.Wait()
    }
    return m.persistAndAssign(ctx, key, accepted)
}
```

#### 2.3 Preserve accepted-ref custody and worktree ownership

**Files**:
- `tools/safety-dance/internal/custody/custody.go`
- `tools/safety-dance/internal/custody/custody_test.go`
- `tools/safety-dance/internal/worktrees/worktrees.go`
- `tools/safety-dance/internal/worktrees/worktrees_test.go`

**Changes**:
- Track the accepted gate head separately from mutable working and upstream refs. Recovery must use the persisted accepted head and reconciliation provenance.
- Create one detached disposable worktree per run under `$SD_HOME/worktrees/<run-id>`. Confirm the checked-out commit equals the persisted gate head before validation starts.
- Associate the worktree path with the run in SQLite before exposing it to the runner.
- Cleanup only after the owning run reaches a state that cannot resume. Skip unknown directories and worktrees referenced by active or recoverable records.
- Test same-branch replacement while cleanup is blocked, restart with an owned worktree, missing worktree recovery, and preservation of unrelated directories.

### Success Criteria:

#### Automated Verification:

- [x] `cd tools/safety-dance && go test -race ./internal/db/... ./internal/daemon/... ./internal/custody/... ./internal/worktrees/...`
- [x] `cd tools/safety-dance && go test -race ./internal/daemon -run 'SameBranch|DifferentBranch|Restart|Singleton|Supersede'`
- [x] `cd tools/safety-dance && go test ./internal/worktrees -run 'Ownership|Cleanup|Recover|Preserve'`

Done when tests prove durable creation before execution, same-key cancellation and join, different-key overlap, singleton daemon ownership, restart classification, and worktree cleanup bounded by persisted ownership.

human-gated: false

---

## Phase 3: Validate and publish without crossing a stale boundary

### Goal

Implement the fixed validation pipeline and prove through an end-to-end temporary remote that only the reviewed candidate can become the upstream head. A failed, cancelled, superseded, or stale run must not publish.

### Required Edits

#### 3.1 Port typed agent execution and pipeline state

**Files**:
- `tools/safety-dance/internal/agent/runner.go`
- `tools/safety-dance/internal/agent/schema.go`
- `tools/safety-dance/internal/agent/runner_test.go`
- `tools/safety-dance/internal/pipeline/runner.go`
- `tools/safety-dance/internal/pipeline/result.go`
- `tools/safety-dance/internal/pipeline/runner_test.go`

**Changes**:
- Port agent invocation, structured finding and scenario schemas, retry limits, output validation, and cancellation propagation. Keep prompts and outputs typed at package boundaries.
- Define the fixed core order as data owned by `internal/pipeline`, not caller configuration: intent, rebase, review, test, document, lint, push, pull request, CI.
- Persist `running` before each step and its typed result before the next step. A restart skips a completed idempotent step only when its durable inputs still match the run.
- Stop immediately on cancellation or a required failed verdict. Preserve findings, stdout and stderr references, attempt counts, and failure classification.
- Reject nested Safety Dance control by injecting parent-run identity into validation agents and checking it in the CLI and daemon admission paths.

```go
var coreSteps = []StepName{
    StepIntent, StepRebase, StepReview, StepTest, StepDocument,
    StepLint, StepPush, StepPullRequest, StepCI,
}
```

#### 3.2 Implement validation steps and branch reconciliation

**Files**:
- `tools/safety-dance/internal/pipeline/steps/intent.go`
- `tools/safety-dance/internal/pipeline/steps/rebase.go`
- `tools/safety-dance/internal/pipeline/steps/review.go`
- `tools/safety-dance/internal/pipeline/steps/test.go`
- `tools/safety-dance/internal/pipeline/steps/document.go`
- `tools/safety-dance/internal/pipeline/steps/lint.go`
- `tools/safety-dance/internal/pipeline/steps/pr.go`
- `tools/safety-dance/internal/pipeline/steps/ci.go`
- `tools/safety-dance/internal/pipeline/steps/steps_test.go`
- `tools/safety-dance/internal/branchsync/sync.go`
- `tools/safety-dance/internal/branchsync/sync_test.go`

**Changes**:
- Port the selected source behavior for intent resolution, safe rebase, structured review, configured tests, documentation, configured lint, provider pull request creation, and CI polling.
- Keep command execution inside the run's owned worktree. Capture exact command, exit status, bounded output reference, and resulting HEAD for steps that can modify files.
- Reconcile the accepted gate head, previously reconciled head, worktree candidate, gate mirror, and live upstream head without silently discarding commits.
- Refuse branch synchronization while a run has `push_active` or the push step is running.
- Keep provider clients behind concrete packages only where multiple imported providers already exist. Use local fixtures for provider responses; do not require live credentials in `go test`.

#### 3.3 Guard publication and make completion replay-safe

**Files**:
- `tools/safety-dance/internal/pipeline/steps/push.go`
- `tools/safety-dance/internal/pipeline/steps/push_test.go`
- `tools/safety-dance/internal/db/publications.go`
- `tools/safety-dance/internal/branchsync/sync.go`

**Changes**:
- Set `push_active` durably before any formatting, commit, reconciliation, or network push, and clear it through a deferred transition on every exit.
- Resolve the candidate HEAD after all allowed modifications. Require it to equal the head approved by review and later required gates.
- Fetch or query the live upstream ref immediately before choosing the push form. Use a normal push for fast-forward publication. Use `--force-with-lease=<ref>:<verified-head>` only for an approved rewrite; never use bare `--force`.
- After Git reports success, query the upstream ref and require it to equal the candidate. Update the gate mirror next. Persist the publication binding only after both checks pass.
- On restart, a binding for the same run, ref, and candidate makes publication complete. A matching upstream without that binding enters reconciliation and must not be assumed complete.

```text
persist push_active
resolve candidate and require candidate == reviewed head
read live upstream head
choose fast-forward or explicit force-with-lease
push candidate
require upstream ref == candidate
update gate mirror
persist publication(run, ref, candidate, verified upstream)
clear push_active
```

#### 3.4 Add an end-to-end gate fixture

**Files**:
- `tools/safety-dance/internal/e2e/e2e_test.go`
- `tools/safety-dance/internal/e2e/fake_agent.go`
- `tools/safety-dance/internal/e2e/fixtures/`
- `tools/safety-dance/Makefile`

**Changes**:
- Build the internal test entry point or invoke packages directly until Phase 4 adds the public binary.
- Create a temporary working repository, bare gate, and bare upstream. Push through authenticated hooks, wait for durable completion, and inspect SQLite plus both refs.
- Add scenarios for success, validation failure, same-branch supersession, stale reviewed head, changed upstream head, explicit lease rejection, cancellation during push preparation, and restart after remote push before binding.
- Make `make e2e` run only local processes and fixtures. Keep recorded provider fixtures scrubbed and deterministic.

### Success Criteria:

#### Automated Verification:

- [x] `cd tools/safety-dance && go test -race ./internal/agent/... ./internal/branchsync/... ./internal/pipeline/...`
- [x] `cd tools/safety-dance && go test ./internal/pipeline/steps -run 'ReviewedHead|RemoteHead|Lease|PublishedRef|Mirror|Binding|Cancel'`
- [x] `cd tools/safety-dance && make e2e`

Done when a temporary upstream accepts the reviewed candidate, rejects every stale or failed case, records the publication only after mirror reconciliation, and recovers without repeating a completed publication.

human-gated: false

---

## Phase 4: Expose the complete CLI, service, setup, and TUI

### Goal

Add the public `safety-dance` executable after the trusted path is complete. Users can initialize repositories, manage the daemon, inspect and control durable runs, complete setup, read logs, and use equivalent compact, wide, and plain-text status views.

### Required Edits

#### 4.1 Add the command tree and durable run controls

**Files**:
- `tools/safety-dance/cmd/safety-dance/main.go`
- `tools/safety-dance/internal/cli/root.go`
- `tools/safety-dance/internal/cli/init.go`
- `tools/safety-dance/internal/cli/run.go`
- `tools/safety-dance/internal/cli/status.go`
- `tools/safety-dance/internal/cli/respond.go`
- `tools/safety-dance/internal/cli/abort.go`
- `tools/safety-dance/internal/cli/logs.go`
- `tools/safety-dance/internal/cli/daemon.go`
- `tools/safety-dance/internal/cli/cli_test.go`

**Changes**:
- Keep `main.go` limited to dependency construction, signal handling, exit-code mapping, and `cli.Execute`.
- Port `init`, `run`, `status`, `respond`, `abort`, `logs`, and `daemon start|stop|restart|status`. Route state changes through authenticated IPC and durable daemon methods rather than editing SQLite from the CLI.
- Replace the Phase 1 test-only command adapter with public argument parsing that calls the same daemon admission and notification methods; do not duplicate hook authentication in the CLI.
- Refuse parent-run control when `SD_PARENT_RUN_ID` identifies a validation child. Status and logs may remain read-only if the imported contract permits them; init, run, respond, and abort must fail.
- Return stable nonzero exit classes for usage, unavailable daemon, rejected request, failed run, and blocked run. Keep plain-text output ANSI-free.
- Test command behavior with injected clients and temporary homes, then cover the built binary in end-to-end tests.

#### 4.2 Install and manage one daemon service per runtime home

**Files**:
- `tools/safety-dance/internal/daemon/service.go`
- `tools/safety-dance/internal/daemon/service_darwin.go`
- `tools/safety-dance/internal/daemon/service_linux.go`
- `tools/safety-dance/internal/daemon/service_windows.go`
- `tools/safety-dance/internal/daemon/service_test.go`

**Changes**:
- Generate launchd, systemd user, and Windows Task Scheduler definitions with Safety Dance labels, executable path, `SD_HOME`, logs, and restart policy.
- Make install and start idempotent. Stop only the service definition owned by the selected `SD_HOME`.
- Keep platform commands behind an injectable executor and use golden service definitions in unit tests. Do not invoke the host's real service manager during offline tests.
- Confirm a service cannot silently point to another runtime home or a missing binary.

#### 4.3 Add transactional setup wizard and repository repair

**Files**:
- `tools/safety-dance/internal/wizard/model.go`
- `tools/safety-dance/internal/wizard/setup.go`
- `tools/safety-dance/internal/wizard/setup_test.go`

**Changes**:
- Launch the wizard when the bare command has no configured repository. Collect the upstream, gate location, validation commands, provider choices, and service confirmation before writing.
- Reuse Phase 1's gate transaction and Phase 4's service owner. Do not duplicate hook or service logic in the wizard.
- Record compensating actions as each write succeeds. On failure, run them in reverse order, restore original Git configuration, and leave pre-existing Safety Dance files untouched.
- Cover cancellation at each step, invalid configuration, service failure after gate creation, and successful idempotent rerun.

#### 4.4 Port responsive TUI and matching text rendering

**Files**:
- `tools/safety-dance/internal/tui/app.go`
- `tools/safety-dance/internal/tui/model.go`
- `tools/safety-dance/internal/tui/view.go`
- `tools/safety-dance/internal/tui/plain.go`
- `tools/safety-dance/internal/tui/view_test.go`
- `tools/safety-dance/internal/tui/testdata/`

**Changes**:
- Keep one root model driven by daemon event snapshots. Render compact and wide layouts from the same semantic view model used by plain text.
- Preserve status, current step, findings, prompts, errors, publication state, and key hints at narrow widths. Truncate content without hiding the terminal status or required response.
- Disable color and cursor control when output is not a TTY or plain mode is selected.
- Add golden tests for empty, running, waiting, failed, cancelled, and published runs at compact and wide widths. Strip ANSI and assert semantic equivalence with plain output.

#### 4.5 Add tool-local documentation and complete build targets

**Files**:
- `tools/safety-dance/docs/getting-started.md`
- `tools/safety-dance/docs/configuration.md`
- `tools/safety-dance/docs/cli.md`
- `tools/safety-dance/docs/daemon.md`
- `tools/safety-dance/docs/recovery.md`
- `tools/safety-dance/Makefile`

**Changes**:
- Document the gate topology, trust boundary, fixed pipeline, configuration precedence, daemon lifecycle, failure recovery, and every public command under the Safety Dance identity.
- Define `build`, `test`, `test-race`, `lint`, and `e2e` targets. `lint` runs `go vet ./...` plus repository-local checks that do not download an unpinned tool at execution time.
- Update the end-to-end target to build and drive `./cmd/safety-dance`.

### Success Criteria:

#### Automated Verification:

- [ ] `cd tools/safety-dance && go test -race ./internal/cli/... ./internal/wizard/... ./internal/tui/... && go test -race ./internal/daemon -run 'Service'`
- [ ] `cd tools/safety-dance && go build ./cmd/safety-dance && make e2e`
- [x] `cd tools/safety-dance && go vet ./...`

Done when a temporary repository can run the built `safety-dance init`, push through the generated remote, observe and control the durable run, and produce semantically matching compact, wide, and plain outputs.

human-gated: false

#### Deferred human evidence (recorded, not a gate)

- Record one setup-wizard transcript and one narrow-terminal run in the Phase 4 implementation artifact. Golden tests remain the regression check.

---

## Phase 5: Distribute the canonical agent skill

### Goal

Add one independent `/safety-dance` skill to the repository's existing canonical skill tree. Every supported runtime and portable install receives it; no `agent-*` worker definition is generated, and the Go setup command never installs skill files.

### Required Edits

#### 5.1 Add the canonical skill and safety references

**Files**:
- `skills/delivery/safety-dance/SKILL.md`
- `skills/delivery/safety-dance/references/commands.md`
- `skills/delivery/safety-dance/references/safety.md`

**Changes**:
- Use exact `name` and `description` frontmatter and preserve the shared writing and conventions sentence on line 6.
- Document discovery of the `safety-dance` executable, repository status, run, respond, abort, and log flows. Keep the skill usable without Atomic or another delivery skill.
- State the nested-run fence before mutating instructions. A child with `SD_PARENT_RUN_ID` must not initialize, start, respond to, abort, or bypass its parent run.
- Keep installation instructions pointed at `scripts/install.mjs` or the published repository installer. The skill may diagnose a missing binary but must not download or install it implicitly.
- Keep long command tables and safety invariants in `references/`; `SKILL.md` links the exact files.

```yaml
---
name: safety-dance
description: Operate the local Safety Dance Git gate, inspect durable runs, and respond to validation prompts without bypassing parent-run controls.
---
```

#### 5.2 Register the skill through existing generators

**Files**:
- `scripts/validate.mjs`
- `workflows/delivery.md`
- `.claude-plugin/plugin.json`

**Changes**:
- Change `EXPECTED_SKILL_COUNT` from 43 to 44.
- Add `safety-dance` to the phase table as an independent skill with artifact type `none`, no human gate, and by-hand operation. Do not add it to an automatic delivery chain.
- Run `node scripts/sync-plugin.mjs` and commit the generated `.claude-plugin/plugin.json` entry. Do not create an `agents/safety-dance.md` file.
- Leave `scripts/lib/build.mjs` unchanged unless a failing test exposes a real adaptation defect. Its name-based worker filter already gives the required non-worker behavior.

#### 5.3 Extend installer and runtime-build regression tests

**File**: `tests/install.test.mjs`

**Changes**:
- Add a table-driven test that selects only `safety-dance` for Claude Code, Codex, Oh My Pi, Pi, and portable destinations.
- Assert each destination contains `safety-dance/SKILL.md` and both references, preserves a foreign skill, creates no Safety Dance worker definition or Codex worker block, and removes only Safety Dance on uninstall.
- Build all four runtime trees into temporary directories. Assert runtime notes appear in the adapted `SKILL.md` and the source canonical file remains unchanged.
- Assert plugin sync lists the skill and has no generated agent entry.

### Success Criteria:

#### Automated Verification:

- [x] `node scripts/validate.mjs && node scripts/sync-plugin.mjs --check && node --test tests/install.test.mjs`
- [x] `tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT; for runtime in claude-code codex oh-my-pi pi; do node scripts/build-runtimes.mjs --runtime "$runtime" --dest "$tmp/$runtime"; test -f "$tmp/$runtime/skills/safety-dance/SKILL.md"; test ! -e "$tmp/$runtime/agents/safety-dance.md"; test ! -e "$tmp/$runtime/agents/safety-dance.toml"; done`

Done when all runtime and portable trees contain the canonical skill, selected uninstall preserves unrelated files, plugin sync is clean, and no worker definition is generated.

human-gated: false

---

## Phase 6: Add repository checks and binary releases

### Goal

Make Safety Dance behavior and identity part of aggregate verification, document the product entry point, and publish checksummed native archives from `safety-dance-v*` tags without changing Changesets release behavior.

### Required Edits

#### 6.1 Add a scoped identity scanner and fixtures

**Files**:
- `scripts/check-safety-dance-identity.mjs`
- `tests/safety-dance-identity.test.mjs`

**Changes**:
- Scan shipped Safety Dance tool, skill, scripts, tests, generated plugin metadata, root documentation, and product workflow files as text. Skip `.git`, `node_modules`, `dist`, binary assets, and `.agents/tasks` history.
- Build retired token patterns from fragments so the scanner source and negative fixture do not themselves ship the retired identity as a contiguous string.
- Permit the imported copyright and permission notice only at `tools/safety-dance/LICENSE`. Fail if an allowlisted legal line appears elsewhere or the license is missing.
- Report `path:line` for every match and return nonzero after collecting all findings.
- Test one rejected command token, module path, environment token, path, service identifier, and release asset, plus the legal allowlist and task-history exclusion.

```js
const retired = ["no", "mistakes"].join("-");
const allow = new Set(["tools/safety-dance/LICENSE"]);
```

#### 6.2 Add Safety Dance to aggregate tests and CI

**Files**:
- `package.json`
- `.github/workflows/tests.yml`
- `docs/testing.md`

**Changes**:
- Add `test:safety-dance` for the identity scan, Go race suite, `go vet`, and release-contract test. Add it to `npm test` after existing validation, plugin sync, and Node tests.
- Add a `Tests` workflow for pull requests, merge queue, and pushes to `main`. Use Node 22, the Go version declared by `tools/safety-dance/go.mod`, `npm ci`, and `npm test`.
- Keep `.github/workflows/commits.yml` dedicated to commit subjects. Do not overload the Changesets release job with binary builds.
- Update `docs/testing.md` to distinguish local Go and identity proof, temporary-remote end-to-end proof, provider-credential checks, and hosted release evidence.

#### 6.3 Define and test the release contract

**Files**:
- `.github/workflows/safety-dance-release.yml`
- `tests/safety-dance-release.test.mjs`
- `tools/safety-dance/scripts/package-release.sh`

**Changes**:
- Trigger only on `safety-dance-v*` tags. Validate that the stripped version is a semantic version before building.
- Build native archives for supported Linux, macOS, and Windows OS/architecture pairs. Name the executable `safety-dance` or `safety-dance.exe` and assets `safety-dance_<version>_<os>_<arch>.<ext>`.
- Generate one `checksums.txt` from the final archives, upload archives and manifest to the same GitHub Release, and grant only `contents: write`.
- Keep packaging logic in the checked-in shell script so Node tests can run it against fake binaries and assert archive names and checksum contents.
- Test workflow triggers, matrix coverage, asset naming, executable naming, checksum inclusion, and separation from `.github/workflows/release.yml`.

#### 6.4 Document installation, development, and releases

**Files**:
- `README.md`
- `docs/testing.md`
- `docs/safety-dance.md`
- `.changeset/<generated-safety-dance-name>.md`

**Changes**:
- Add a short root README entry linking to `docs/safety-dance.md`; keep detailed configuration and recovery in tool-local docs.
- Document source builds, supported platforms, checksum verification, local gate setup, `SD_HOME`, `.safety-dance.yaml`, and the separation between binary installation and skill installation.
- Document the `safety-dance-v*` release procedure independently from Changesets.
- Add a minor Changesets entry for `@marktripoli/skills` describing the new tool and skill. Use the filename produced by `npx changeset`; do not hand-edit an existing published entry.

### Success Criteria:

#### Automated Verification:

- [x] `node scripts/check-safety-dance-identity.mjs && npm test`
- [x] `cd tools/safety-dance && go test -race ./... && go vet ./... && go build ./cmd/safety-dance`
- [x] `node --test tests/safety-dance-release.test.mjs`
- [x] `node scripts/sync-plugin.mjs --check && git diff --exit-code -- .claude-plugin/plugin.json agents/`

Done when the aggregate suite catches Go, identity, installer, generated-plugin, and release-contract regressions; local builds contain no retired product identity outside the legal file; and product tags map deterministically to native archives plus checksums.

human-gated: false

#### Deferred human evidence (recorded, not a gate)

- Record the first `safety-dance-v*` workflow's Linux, macOS, and Windows asset names and checksum verification in the pull request or release evidence. Local tests cannot prove hosted runner execution.

---

## Human Review

### Review targets

- Confirm the first public binary remains in Phase 4, after authenticated admission, durable coordination, validation, and guarded publication are tested.
- Confirm Phase 1 can finish through its private daemon handler and test-only executable helper while the first shipped `cmd/safety-dance` entry point remains in Phase 4.
- Confirm the database, daemon, worktree, and publication owners each enforce one boundary without duplicating checks in CLI or TUI code.
- Confirm the push sequence cannot record success before upstream verification and gate-mirror reconciliation.
- Confirm the Go setup flow owns repository and service state while the root installer alone owns coding-agent skill files.
- Confirm the identity scan covers shipped paths, excludes task history, and preserves only the required legal notice.
- Confirm the product release workflow does not alter Changesets tags or the existing `release.yml` behavior.

### Verify

- [ ] Every outline phase maps to one independently testable implementation phase with named files, invariants, failure behavior, and runnable commands.
- [ ] Phase 1 has a buildable test-only hook helper, a real private admission handler, and a temporary-repository check that can pass before Phase 4 begins.
- [ ] The plan retains authenticated admission, durable creation before execution, same-branch replacement, cross-branch concurrency, worktree ownership, and restart recovery.
- [ ] Publication requires reviewed-head continuity, live remote-head verification, an explicit lease when needed, post-push ref verification, gate-mirror update, and a durable binding in that order.
- [ ] Public commands, paths, configuration, environment variables, service labels, skill files, fixtures, generated metadata, docs, and release assets use the Safety Dance identity outside `tools/safety-dance/LICENSE`.
- [ ] The canonical non-worker skill reaches Claude Code, Codex, Oh My Pi, Pi, and portable installs through existing build and install owners.
- [ ] Aggregate verification covers Go race tests, local end-to-end tests, Node installer tests, identity scanning, plugin sync, binary build, and release-contract checks.

### Known limits

- Phase 1 executable proof uses a test-only helper. The shipped `safety-dance` command does not exist until Phase 4 replaces that adapter with public CLI wiring.
- The selected source snapshot had no repository history, so implementation can preserve current tested behavior but cannot recover undocumented historical compatibility decisions.
- Provider pull-request and CI integrations can use fixtures locally; live provider proof needs credentials during final verification.
- This plan intentionally provides no migration or aliases for another product's hooks, services, configuration, persisted database, or commands.
- Hosted cross-platform release execution remains deferred evidence until the first `safety-dance-v*` tag runs on GitHub Actions.
