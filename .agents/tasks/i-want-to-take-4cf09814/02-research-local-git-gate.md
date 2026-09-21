---
date: 2026-09-20T04:32:42Z
git_commit: 447be0930b7c62f29f9e35c30c6f7a8d8f4b410a
branch: safety-dance
repository: i-want-to-take-4cf09814
topic: "Local Git gate and no-mistakes repository behavior"
type: research
summary: "This research establishes that this repository adapts canonical skills into runtime-specific installs through a validated Node build/install pipeline, with deliver, task worktrees, and commit hooks as its closest Git workflow surfaces. The referenced no-mistakes snapshot implements a local bare Git gate, daemon IPC, branch-scoped durable runs, disposable worktrees, structured review/test/document/lint gates, and guarded upstream publication; its MIT identity is spread across code, installers, generated skills, releases, docs, workflows, and assets. A later phase needs these current contracts and identity surfaces, but this artifact does not select an integration design."
tags: [research, codebase]
status: complete
---

# Research: Local Git gate and no-mistakes repository behavior

**Date**: 2026-09-20T04:32:42Z  
**Git Commit**: 447be0930b7c62f29f9e35c30c6f7a8d8f4b410a  
**Branch**: safety-dance  
**Repository**: i-want-to-take-4cf09814

## Research Question

1. How does this repository package, adapt, install, document, and validate skills that expose runtime-specific commands or worker roles across its supported runtimes?
2. How does `kunchenguid/no-mistakes` receive and handle Git pushes, and what current behavior do its code, tests, and docs define for validation, state, concurrency, failure, cleanup, and upstream interaction?
3. What commands, configuration, environment variables, filesystem state, Git hooks, remotes, daemon processes, and agent-facing interfaces make up the current `kunchenguid/no-mistakes` installation and runtime contract?
4. How does `kunchenguid/no-mistakes` define and execute its review, test, documentation, and lint gates, and what prompts, schemas, status outputs, fixtures, and tests describe those contracts?
5. Which existing modules, skills, scripts, documentation, tests, and conventions in this repository are the closest precedents for a locally installed Git workflow tool with CLI and coding-agent entry points?
6. What license, copyright, attribution, third-party notice, and provenance requirements govern reuse of `kunchenguid/no-mistakes`, and where do its project name, identifiers, paths, commands, assets, and user-facing references appear?
7. What terminal or browser interface surfaces exist in `kunchenguid/no-mistakes`, and what visual tokens, literal colors, typography, spacing, layout, responsive behavior, theming hooks, framework utilities, accessibility behavior, and regression assets define them and comparable interfaces in this repository?

## Research Methodology

This document records current behavior only. It does not recommend implementation work, refactors, optimizations, or future changes.

Evidence came from this checkout at commit `447be0930b7c62f29f9e35c30c6f7a8d8f4b410a`, a depth-one clone of `kunchenguid/no-mistakes` at `794bfd586d244272db48eff73a1fed09b97ec1a5`, its source/docs/tests, and the cited local repository files.

### Known limits

- Typed judgments for routing, citation verification, and coverage were unavailable in this environment, so worker-selected evidence order and manual source checks were used.
- The no-mistakes checkout was depth one; historical behavior beyond its current `main` snapshot was not examined.
- Provider-specific pull-request and CI API internals were not traced beyond their pipeline invocation and publication boundaries.

## Summary

This repository uses canonical `SKILL.md` sources, runtime adapters, generated worker formats, a plan-before-write installer, and structural validation. Its closest local Git workflow surfaces are `/deliver`, the optional Atomic `delivery` workflow, task/worktree conventions, and the commit-message hook.

No-mistakes places a local bare repository between a working repository and its real upstream. A managed pre-receive hook admits authorized pushes, a post-receive hook notifies one daemon over IPC, and a branch-scoped run executes intent, rebase, review, test, documentation, lint, push, PR, and CI steps. Runs persist in SQLite, use disposable worktrees, serialize replacement pushes on one branch, allow different branches concurrently, and publish upstream only after continuity and remote-head checks.

## Detailed Findings

### 1. Canonical skills are adapted into runtime-specific installs

The local repository treats `skills/` as the canonical source tree. `buildRuntime` copies selected skills, inserts runtime notes after the shared line-six sentence, and emits Markdown workers for Claude Code and Oh My Pi, TOML workers plus a Codex config snippet for Codex, and no worker files for Pi (`scripts/lib/build.mjs:15-18,70-119`). Runtime documents define slash-command or dollar-command invocation conventions (`runtimes/claude-code.md:3-15`, `runtimes/codex.md:3-15`, `runtimes/oh-my-pi.md:3-15`, `runtimes/pi.md:3-14`).

The installer computes a typed plan before filesystem writes. It resolves requested skills and dependencies, deduplicates destinations, builds temporary trees, applies only planned files, and removes the temporary build directory in `finally` (`scripts/install.mjs:180-216,358-373,440-445`). Project and user destinations honor `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and `ATOMIC_CODING_AGENT_DIR`; project installs target local `.claude`, `.agents`, `.omp`, `.pi`, and `.atomic` locations (`scripts/install.mjs:146-177`).

Worker names beginning with `agent-` become runtime worker definitions where supported (`scripts/lib/build.mjs:101-117`). The plugin synchronizer derives generated workers from the canonical layout and removes stale generated workers (`scripts/sync-plugin.mjs:18-40,42-70`). The package exposes installation, validation, build, plugin-check, and test commands, and `prepare` configures Git hooks (`package.json:12-28`, `scripts/prepare.mjs:1-12`).

#### Testing patterns

`tests/install.test.mjs:38-260` covers target detection, argument parsing, destination overrides, project scope, selective install/uninstall, preservation of unrelated files, Codex config preservation, Atomic scope, and installed CLI help. `scripts/validate.mjs` was run by the worker and reported 43 skills, 57 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, and 0 banned tokens. `npm test` reached 103 passing tests but encountered missing `yaml` and `@clack/prompts` modules in the checkout (`tests/atomic-controller.test.mjs`, `tests/install.test.mjs`).

### 2. No-mistakes receives pushes through a managed local bare gate

`no-mistakes init` creates or repairs a bare gate, installs managed receive hooks, records the upstream as the gate's `origin`, and adds a `no-mistakes` remote to the working repository (`internal/gate/gate.go:131-171,186-226`; `README.md:89-108`). The working repository keeps `origin` for upstream while `no-mistakes` points to the local gate.

The managed pre-receive hook invokes `no-mistakes daemon admit-push --gate "$GATE_DIR"` and rejects the Git update on a nonzero result (`internal/git/hook.go:19-61`). Existing user pre-receive hooks are preserved as `pre-receive.no-mistakes-user` and run after managed admission (`internal/git/hook.go:70-106`). The daemon validates the authenticated process ancestry through IPC before allowing the gate ref update (`internal/cli/daemon_cmd.go:60-80`).

The post-receive hook forwards old SHA, new SHA, ref, and `GIT_PUSH_OPTION_*` values to `daemon notify-push` (`internal/git/hook.go:168-180`). Notification is intentionally non-blocking after Git has accepted the ref: failures print to stderr and append to `<gate>/notify-push.log` without undoing the ref mutation (`internal/git/hook.go:120-139,181-207`). `notify-push` parses skip steps, intent, launch nonce, validation generation, PR base, Pi profile, and reconciled previous head before making the `push_received` IPC call (`internal/cli/daemon_cmd.go:88-175`).

The daemon maps the gate and ref to a registered repository and branch, rejects ref deletions because there is no pipeline to run, derives the old SHA as the base, and starts a run (`internal/daemon/manager.go:757-797`). Run creation uses a repository/branch mutex. A new push cancels an active run on the same branch before replacement; different branches run concurrently (`internal/daemon/manager.go:1233-1273`; `docs/src/content/docs/concepts/gate-model.md:176-180`; `internal/daemon/manager_test.go:340-397`).

#### Testing patterns

`internal/daemon/manager_test.go:340-397` verifies concurrent runs on different branches. `internal/cli/daemon_cmd_test.go:81-155` covers multiline intent, conflicting launch metadata, and reconciled-head parsing. `internal/daemon/orphan_processes_test.go:442-469` covers cleanup after setup failure. A focused daemon test command for concurrent branches and run telemetry passed; a broader package command exceeded its 30-second execution limit.

### 3. Runtime state spans one daemon, SQLite, hooks, worktrees, and managed remotes

The runtime root is `NM_HOME`, defaulting to `~/.no-mistakes`. It contains SQLite state, bare gates, disposable worktrees, logs, a socket, a PID record, and a singleton lock (`internal/paths/paths.go:18-50,100-136`). The documented global config is `$NM_HOME/config.yaml`; repository overrides are `<repo>/.no-mistakes.yaml` (`docs/src/content/docs/guides/configuration.md:26-32`).

The installer uses `$HOME/.no-mistakes/bin` by default, with `NO_MISTAKES_INSTALL_DIR` and `NO_MISTAKES_LINK_DIR` overrides, downloads a release archive, creates a `no-mistakes` symlink, and restarts the daemon (`docs/install.sh:4-16,32-95`; `README.md:70-76`). `NM_DAEMON_CONNECT_TIMEOUT` controls daemon socket connection timeout. Bitbucket integration reads `NO_MISTAKES_BITBUCKET_EMAIL`, `NO_MISTAKES_BITBUCKET_API_TOKEN`, and `NO_MISTAKES_BITBUCKET_API_BASE_URL` (`docs/src/content/docs/reference/environment.md:27-36`; `internal/bitbucket/client.go:17-20`). Agent subprocesses use a sanitized environment and can remove ambient credentials such as `GH_TOKEN` (`internal/agent/env.go:19-24`).

The daemon is managed by `no-mistakes daemon start|stop|restart|status` through launchd, a systemd user service, or Windows Task Scheduler (`docs/src/content/docs/concepts/daemon.md:29-42`). One live daemon owns an `NM_HOME` file lock; a second daemon fails rather than taking the socket (`docs/src/content/docs/concepts/daemon.md:75-79`). The agent contract is `/no-mistakes` plus `no-mistakes axi run|status|respond|abort|logs`; nested validation agents are forbidden from initializing, rerunning, responding to, synchronizing, aborting, ejecting, or directly pushing the pipeline (`skills/no-mistakes/SKILL.md:1-13,15-30,33-47,97-119`).

#### Testing patterns

`internal/daemon/lock_test.go`, `singleton_test.go`, `service_test.go`, `service_launchd_test.go`, `service_systemd_test.go`, and `service_schtasks_test.go` cover daemon ownership and service rendering. `internal/paths/` is covered through callers and path-specific tests in daemon, gate, and configuration packages. `install_script_test.go:16-181` covers installation paths, symlink replacement, daemon restart, release URL construction, and missing-release-tag failure.

### 4. Upstream publication is guarded by continuity, lease, mirror, and durable-state checks

The Push step marks `push_active` before work and clears it with a deferred update (`internal/pipeline/steps/push.go:20-34`). It can format files, commit agent changes, resolve the worktree head, and load prior step results (`internal/pipeline/steps/push.go:36-84`). Publication requires review-approved head continuity, a safe gate-mirror reconciliation plan, and a force-push decision anchored to a verified remote head (`internal/pipeline/steps/push.go:136-167`). Rewritten branches use force-with-lease; new or fast-forward branches use ordinary push (`internal/pipeline/steps/push.go:171-191`).

After publication, the code verifies the remote ref equals the intended SHA and updates the gate mirror before recording the publication binding in SQLite (`internal/pipeline/steps/push.go:192-232`). A mirror failure therefore remains retryable before a durable success record. Branch synchronization refuses to alter state while `PushActive` is set or the push step is running (`internal/branchsync/sync.go:1472-1476`).

Initialization errors are handled transactionally: missing `origin` stops setup; fresh setup rolls back the added remote and bare gate when database insertion fails; refresh failures preserve the existing gate (`internal/gate/gate.go:95-110,131-167`). A failed AXI trigger push restores a reconciled branch and rechecks ownership (`internal/cli/axi_drive.go:586-600`).

#### Testing patterns

`internal/cli/axi_test.go:605-611` verifies failed pushes do not fall back to rerun while successful no-op pushes do. `internal/branchsync/sync_test.go:174-199` covers active and push-in-progress blocking. `internal/gate/` and `internal/pipeline/steps/` contain gate and publication tests, including reconciliation, refresh, and push-step behavior.

### 5. Review, test, documentation, and lint gates use structured prompts and typed findings

The pipeline's fixed step vocabulary and order are intent, rebase, review, test, document, lint, push, PR, and CI (`internal/types/types.go:48-60,99-132`). Review asks for reviewed paths, concrete traces, risk assessment, structured findings, and action classifications (`internal/pipeline/steps/review.go:292-363`). Schema rejection triggers correction retries (`internal/pipeline/steps/review.go:377-407`).

The test gate prompt defines scenarios, evidence, verdicts, and UI-evidence expectations (`internal/pipeline/steps/test.go:172-228`). Its analyzer validates structured output and retries corrections (`internal/pipeline/steps/test.go:292-341`). Documentation owns placement and combines with a lint prompt in one path (`internal/pipeline/steps/document.go:28-86`). Configured lint commands execute separately and turn command failures into findings (`internal/pipeline/steps/lint.go:37-109,155-180`). Shared validation requires finding severity, description, action, summary, and test fields such as `tested`, `testing_summary`, `artifacts`, `scenarios`, and `verdict` (`internal/pipeline/steps/common.go:19-154`).

Status contracts include run lifecycle statuses and terminal-state predicates (`internal/types/types.go:10-46`), finding action/severity vocabularies (`internal/types/findings.go:10-23`), and scenario result/verdict vocabularies (`internal/types/findings.go:124-159`). The repository has recorded agent fixtures for Claude, Codex, OpenCode, and Antigravity under `internal/e2e/fixtures/`; `cmd/recordfixture/` captures and scrubs them. CI runs Unix, Windows-sharded, and build checks (`.github/workflows/ci.yml:104-132`), while the required-action workflow enforces the no-mistakes attestation and completed status (`.github/workflows/no-mistakes-required.yml:46-67`; `.github/actions/require-no-mistakes/verify.py:73-79,309-335`).

#### Testing patterns

`internal/pipeline/steps/review_schema_retry_test.go:22-240` covers malformed review output and retry limits. `test_scenario_contract_test.go:18-80,168-380` covers prompt wording, verdict policy, and invalid payloads. `document_test.go:152-248`, `lint_test.go:19-304`, `common_test.go:1544-1710`, and `housekeeping_test.go` cover documentation placement, lint output, schemas, combined passes, retries, and timeouts. `internal/e2e/journey_test.go` covers gate statuses, terminal outcomes, CLI rendering, TUI startup, and ANSI-free output.

### 6. The source is MIT-licensed and its identity is distributed across the product surface

The source `LICENSE:1-21` grants copying, modification, distribution, sublicensing, and sale while requiring preservation of the copyright and permission notices; its copyright line names Kun Chen. No separate `NOTICE` or third-party attribution file was found. The Go module identity is `github.com/kunchenguid/no-mistakes` (`go.mod:1`), and dependencies are declared in `go.mod:5-46`; documentation lockfiles carry dependency license identifiers.

Identity appears in the README heading and badges, the `git push no-mistakes` command, GitHub/raw-content/docs URLs, `/no-mistakes`, `no-mistakes init`, demo assets, and installer URLs (`README.md:1-46,70-120`). The installer embeds the repository, `NO_MISTAKES_*` variables, default state directory, binary/symlink names, release archive names, and daemon restart (`docs/install.sh:4-16,49-56,88-91`). The generated skill, Makefile linker flags, release archive/signing identifiers, GitHub Action signatures, contribution guide, tests, and demo assets repeat the product identity (`skills/no-mistakes/SKILL.md:1-12,29-47,97-119`; `Makefile:10-22,78-118`; `.github/workflows/release.yml:63-72,129-133`; `CONTRIBUTING.md:1-34`).

This repository has a separate MIT identity: `LICENSE:1-13` names Mark Tripoli, `package.json:1-13` names `@marktripoli/skills`, `.claude-plugin/plugin.json:1-11` names `marktripoli-skills`, and `.claude-plugin/marketplace.json:1-12` names the `marktripoli` marketplace owner. Its README and package scripts expose the `skills` name, install paths, tests, validation, and plugin synchronization (`README.md:1-25,55,69-73`; `package.json:20-28`).

#### Testing patterns

`install_script_test.go:16-181`, `internal/skill/skill_test.go:15-51,94-168`, `internal/update/release_test.go:94-124`, and `workflow_release_test.go:72-80,190-215` cover identity-bearing installation, generated skill, release, and telemetry behavior. Local identity and plugin synchronization are covered by `tests/install.test.mjs`, `tests/commits.test.mjs`, and `scripts/sync-plugin.mjs --check`.

### 7. The source human interface is terminal-native; this repository's closest interface precedent is JEV UI

No-mistakes' human interface is a Bubble Tea terminal TUI and setup wizard rather than a browser-rendered product surface. `internal/tui/app.go:15` is the TUI root; `internal/tui/view.go:11-40` selects compact or regular rendering; `internal/tui/layout.go:9-20,43-80` defines width thresholds, pane widths, gaps, and two-column layout; and `internal/tui/theme.go:8-25` defines ANSI color roles. The design document records typography roles, rounded boxes, spacing, gutters, status icons, and severity icons (`internal/tui/DESIGN.md:5-39,57-85,125-149`). The wizard defines ANSI palette, terminal title, setup box, action bar, footer, and error rendering (`internal/wizard/view.go:11-75`).

Responsive behavior is terminal-size based: the layout changes at a 100-column threshold, uses a 38-to-48-column left pane, and suppresses connectors/logs in compact or height-constrained layouts (`internal/tui/layout.go:9-20,43-64`; `internal/tui/layout_compact_test.go:14-70,90-148`; `internal/tui/view.go:120-143`). The TUI documents a browser-open action for a PR URL, but no browser UI is part of the source product (`docs/src/content/docs/guides/tui.md:174-221`). Regression assets include rendering, compact-layout, wide-layout, wizard-view, and end-to-end tests (`internal/tui/rendering_test.go:14-160`; `internal/tui/layout_wide_test.go:14-171`; `internal/wizard/view_test.go:43-152`).

The local repository's closest interface contract is `jev-ui`. Its controller records receipts, bounds actions, checks independent postconditions, and cleans up non-green runs (`skills/delivery/jev-ui/scripts/jev-ui.mjs:19-40`; `skills/delivery/jev-ui/references/result-schema.md:3-21`). Browser drivers enforce origin and sensitive-value controls, snapshot fingerprints, CDP request blocking, and stale-observation rejection (`skills/delivery/jev-ui/scripts/browser.mjs:4-49,65-131`). Local tests cover browser origin guards, redaction, budgets, stale observations, fixture isolation, native accessibility normalization, and cleanup (`tests/jev-ui-browser-review.test.mjs:32-90`; `tests/jev-ui-controller.test.mjs:7-89`; `tests/jev-ui-fixture.test.mjs:8-46`; `tests/jev-ui-native.test.mjs:44-45`).

#### Testing patterns

No-mistakes TUI rendering and layout tests are listed above; its fixture tree contains 12 recorded agent fixtures. Local JEV UI tests use isolated web fixtures, accessible `status`/`aria-live="polite"` output (`skills/delivery/jev-ui/fixture/web/index.html:1-15`), and explicit `passed`/`failed`/`blocked` receipts (`skills/delivery/jev-ui/references/result-schema.md:3-21`).

## Code References

### Local packaging, workflows, and conventions (exhaustive for the researched areas)

- `scripts/lib/build.mjs:1-119` - runtime adaptation, worker generation, and output layout.
- `scripts/install.mjs:44-450` - argument parsing, plan/apply, destinations, confirmation, and cleanup.
- `scripts/validate.mjs:274-555` - layout, frontmatter, templates, handoffs, and inventory validation.
- `skills/delivery/deliver/SKILL.md:8-90` - coding-agent delivery entry point and routing.
- `shared/CONVENTIONS.md:5-21,35-53` - portable install and task/worktree contracts.
- `tests/install.test.mjs`, `tests/atomic-controller.test.mjs`, `tests/commits.test.mjs` - installation, workflow, and Git commit checks.

### No-mistakes push/runtime/gates (representative of the current snapshot's relevant subsystems)

- `internal/git/hook.go`, `internal/gate/gate.go`, `internal/daemon/manager.go` - hook admission, gate initialization, and run creation.
- `internal/cli/daemon_cmd.go`, `internal/ipc/protocol.go`, `internal/paths/paths.go` - daemon commands, IPC payloads, and filesystem paths.
- `internal/pipeline/steps/{review,test,document,lint,push}.go` and `internal/pipeline/steps/common.go` - gate prompts, schemas, retries, and publication.
- `internal/types/{types,findings}.go`, `internal/db/run.go`, `internal/branchsync/sync.go` - lifecycle, findings, run state, and synchronization contracts.
- `skills/no-mistakes/SKILL.md`, `README.md`, `docs/src/content/docs/`, `.github/workflows/`, `Makefile` - user, agent, CI, build, and documentation surfaces.

### Interface and identity (representative)

- `internal/tui/{app,view,layout,theme,DESIGN}.go|md` and `internal/wizard/view.go` - terminal interface and visual tokens.
- `internal/e2e/fixtures/`, `cmd/recordfixture/`, `internal/tui/*_test.go` - recorded agents and UI regression tests.
- `LICENSE`, `go.mod`, `docs/install.sh`, `.github/workflows/release.yml` - licensing, module, installer, and release identity.
- `skills/delivery/jev-ui/`, `tests/jev-ui-*.test.mjs` - local browser/native interface precedent.

## Architecture Documentation

The no-mistakes runtime is a chain of boundaries rather than a direct upstream push:

```text
working repository
  └─ git push no-mistakes
       └─ bare gate pre-receive admission
            └─ bare gate post-receive notification
                 └─ daemon IPC: push_received
                      └─ branch-scoped durable run
                           ├─ disposable worktree
                           ├─ intent / rebase / review / test / document / lint
                           └─ guarded push → verified upstream ref → gate mirror → SQLite binding
```

The local repository's corresponding ownership boundaries are source skill, runtime adapter, install plan, destination apply, agent invocation, task/worktree state, and validation/test gates. Its runtime adaptation is generated rather than maintained as separate skill implementations.

## Open Questions

None.
