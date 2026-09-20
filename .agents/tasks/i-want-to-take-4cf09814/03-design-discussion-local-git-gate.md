---
task: i-want-to-take-4cf09814
type: design-discussion
summary: "Safety Dance will bring the referenced local Git gate into this repository as an independently branded Go tool plus a canonical coding-agent skill, while preserving its gate, daemon, durable-run, validation, and guarded-publication behavior. User-facing names and namespaces will change to Safety Dance; the upstream MIT copyright and permission notice will remain only in the legally required provenance surface. Later phases must plan a behavior-preserving source import, exhaustive identity migration, integration with this repository's build and validation conventions, and parity tests at every trust boundary."
repo: i-want-to-take-4cf09814
branch: safety-dance
sha: 061f0054afcd8ff76db1d9192aacae36c691551c
---

### Summary of change request

Bring the referenced repository's local Git validation gate into this repository under the independent name **Safety Dance**, without exposing the source project's identity in normal product use and without weakening its safety contracts.

### Current State

- This repository distributes coding-agent skills and workers across supported runtimes, but it does not provide a local Git remote that validates a branch before publishing it upstream.
- A user can run the delivery skills and commit checks, but a normal Git push does not automatically enter a durable review, test, documentation, lint, and publication pipeline.
- The referenced tool supplies that gate as a separate product with its own command, state directory, configuration, daemon, TUI, installer, release assets, and agent skill.
- The referenced tool's product identity appears throughout its user interfaces and distribution surface, so copying only the core package would leave old names and links visible.

### Desired End State

- Users initialize a local Safety Dance gate for a repository and push to it before changes reach the real upstream.
- One local daemon accepts authorized gate notifications, persists branch-scoped runs, and isolates work in disposable worktrees.
- Each run preserves the established intent, rebase, review, test, documentation, lint, push, pull-request, and CI sequence.
- A replacement push cancels the active run for the same branch, while different branches can proceed concurrently.
- Upstream publication occurs only after review-head continuity, remote-head lease, gate-mirror, and durable-state checks pass.
- Users and coding agents interact through Safety Dance names, commands, paths, configuration, status output, and terminal interfaces. Normal product surfaces do not mention the source project or repository.
- The original MIT copyright and permission notice remains available in the imported tool's legal files because redistribution requires it.

### What we're not doing

- Rewriting the mature Go runtime in Node.js or replacing its SQLite, Git hook, IPC, worktree, or service-management model.
- Adding a browser application; the product remains CLI- and terminal-native.
- Adding compatibility aliases for the source command, environment variables, state directory, remote, configuration file, or agent invocation.
- Migrating an existing installation or its persisted database in the first release. This repository currently has no corresponding installed product state to preserve.
- Changing gate policy, finding schemas, pipeline order, cancellation semantics, or upstream publication guarantees merely to simplify the import.
- Removing or disguising legally required license provenance.

### Proposed End State Architecture

Safety Dance is a cohesive tool inside this repository, not a Node reimplementation and not a renamed external dependency. The imported Go implementation retains ownership of runtime behavior; this repository's existing skill and validation pipeline owns coding-agent distribution.

```text
repository
├── tools/safety-dance/               # Go module: CLI, daemon, gate, pipeline, TUI
│   ├── cmd/                           # safety-dance executable entry points
│   ├── internal/                      # renamed, behavior-preserving runtime packages
│   ├── docs/                          # Safety Dance user and operator documentation
│   ├── LICENSE                       # upstream MIT notice required for redistribution
│   └── go.mod                         # independent Go dependency boundary
├── skills/delivery/safety-dance/     # canonical agent-facing command and constraints
├── scripts/                           # root validation/release integration where needed
└── tests/                             # repository-level install and identity checks
```

The runtime flow remains bounded by the same trust boundaries:

```text
working repository
  └─ git push safety-dance
       └─ local bare gate
            ├─ pre-receive: authenticate and admit the push
            └─ post-receive: notify the daemon without reverting an accepted ref
                 └─ branch-scoped durable run in SQLite
                      ├─ disposable worktree
                      ├─ intent → rebase → review → test → document → lint
                      └─ guarded upstream push
                           ├─ verify reviewed-head continuity
                           ├─ verify remote head and force-with-lease decision
                           ├─ verify published ref
                           ├─ update gate mirror
                           └─ persist publication binding
```

The name migration applies as one contract, not as scattered cosmetic edits:

```text
binary / command       safety-dance
Git remote             safety-dance
agent invocation       /safety-dance
state root              SD_HOME, default ~/.safety-dance
repository config      .safety-dance.yaml
installer variables    SAFETY_DANCE_*
service / socket names safety-dance
module / release IDs   repository-owned Safety Dance identifiers
```

The implementation plan must inventory every identity-bearing string before replacement, classify each as product identity, protocol compatibility, test fixture, or legal provenance, and fail validation when an old product identifier remains outside the approved legal files.

### Design Questions

None. The request delegates product and implementation choices; the selected direction is recorded below for review.

### Resolved Design Questions

#### Import the proven Go runtime or rewrite it

**Import and adapt the Go runtime in `tools/safety-dance/`.** Its concurrency, process ownership, Git reconciliation, publication, and cleanup behavior already exists with focused tests. A rewrite would recreate those safety invariants without a product requirement that justifies the risk.

A direct external dependency was rejected because the request requires independent ownership and branding. A Node.js rewrite was rejected because this repository's language is not a reason to replace a cohesive executable with many operating-system boundaries.

#### Product identity

**Use Safety Dance as the product name and `safety-dance` as the command, remote, service, path, and release stem.** The name is distinct, fits the gate's purpose, and is already the task branch name.

The source name will not remain as an alias because aliases would preserve the unwanted product reference and expand compatibility scope.

#### Attribution boundary

**Remove source identity from normal product surfaces, but retain its MIT copyright and permission notice in `tools/safety-dance/LICENSE` and any legally necessary source distribution.** This honors the requested independent branding without violating the license condition identified by research.

Removing every reference, including the license notice, was rejected because the source license requires that notice in copies or substantial portions. Product documentation should link to a neutral third-party notices or license page rather than naming the source project in setup, commands, screenshots, or marketing copy.

#### Runtime and interface scope

**Preserve the CLI, daemon, service integration, local bare gate, SQLite state, disposable worktrees, terminal TUI, and setup wizard.** These pieces jointly implement the user-visible guarantee that an accepted gate push is durably evaluated and only safely published upstream.

A browser UI was rejected because the source behavior and this request do not require one. The TUI keeps its responsive compact and wide modes, status semantics, accessible plain-text output, and terminal-only interaction after rebranding.

#### Agent integration

**Create one canonical `skills/delivery/safety-dance/SKILL.md` and let the existing runtime build pipeline generate supported worker forms.** The skill exposes run, status, respond, abort, and logs while retaining the source restriction that nested validation agents cannot control or bypass their parent run.

Hand-maintained copies for each agent runtime were rejected because this repository already generates runtime-specific forms from canonical skills.

#### First-release compatibility

**Ship a clean Safety Dance namespace without automatic migration from the source product.** There is no local predecessor in this repository, and silent reuse of another tool's hooks, state, or services could mutate an installation the user did not ask Safety Dance to own.

Migration tooling and old-name aliases can be designed later only if an actual installed-user requirement appears.

### Patterns to follow

#### Canonical skill with generated runtime adapters

Use the repository's existing canonical-source boundary and generate worker definitions instead of maintaining runtime forks.

- `scripts/lib/build.mjs:70-119` for skill copying, runtime notes, and worker generation.
- `scripts/sync-plugin.mjs:18-70` for generated-worker synchronization and stale-output removal.
- `runtimes/{claude-code,codex,oh-my-pi,pi}.md` for invocation differences.

```text
skills/delivery/safety-dance/SKILL.md
  → buildRuntime(...)
  → runtime-specific skill and worker outputs
```

#### Plan before filesystem mutation

Installation changes must extend the typed plan/apply model rather than write opportunistically. Preserve unrelated runtime configuration and clean temporary build state on both success and failure.

- `scripts/install.mjs:180-216,358-373,440-445`
- `tests/install.test.mjs:38-260`

#### Authenticate before admitting, notify after accepting

The pre-receive path remains authoritative for admission. Post-receive notification remains non-blocking and records failures because Git cannot undo an accepted ref update at that point.

- Imported `internal/git/hook.go`
- Imported `internal/cli/daemon_cmd.go`
- Imported `internal/daemon/manager.go`

```text
pre-receive failure  → reject ref update
post-receive failure → keep ref, log notification failure, permit recovery
```

#### Serialize by branch, not globally

Guard run replacement with a repository-and-branch lock. Cancel and replace work on the same branch; permit independent branches to run concurrently.

- Imported `internal/daemon/manager.go`
- Imported `internal/daemon/manager_test.go`

#### Guard publication at every continuity boundary

Retain the `push_active` state, reviewed-head check, mirror reconciliation, remote-head verification, force-with-lease choice, post-push ref verification, mirror update, and durable publication record in that order.

- Imported `internal/pipeline/steps/push.go`
- Imported `internal/branchsync/sync.go`

#### Keep gate outputs structured

Preserve typed findings, correction retries, test scenarios, evidence, verdicts, and configured lint-command failures. Rename identity-bearing prose without weakening schemas or verdict rules.

- Imported `internal/pipeline/steps/{review,test,document,lint}.go`
- Imported `internal/pipeline/steps/common.go`
- Imported `internal/types/findings.go`

#### Prove rebranding mechanically

Add an allowlist-based identity scan that permits the source copyright holder and license text only in approved legal locations. Run it alongside imported Go tests, root validation, installer tests, release checks, and terminal rendering tests.

```text
search old product identifiers
  ├─ approved legal file → allowed
  └─ command, path, docs, fixture, asset, config, binary, release → fail
```

### Execution DAG

The task uses the fixed `full` workflow and has no execution-plan artifact. Research questions and research are complete; this design discussion is the current human-review boundary.

1. `create-structure-outline` defines ordered implementation slices and pauses for approval.
2. `create-plan` turns the approved outline into file-level phases and pauses for approval.
3. `implement-plan` executes one phase at a time, with implementation-boundary review enabled by the full workflow.
4. `verify-implementation` independently reruns repository checks and promised acceptance items.
5. `review-code` and `fix-code-review` run unattended until clean, blocked, or bounded by the workflow.
6. `describe-pr` prepares the pull request description and pauses at the pull-request gate.

### Testing approach

- Run the imported Go unit and package tests for hooks, daemon singleton ownership, branch concurrency, gate initialization rollback, branch synchronization, pipeline schemas, push continuity, installer behavior, and terminal rendering.
- Port end-to-end journeys that exercise initialization, a gate push, durable status, terminal outcomes, guarded publication, and ANSI-free output.
- Add repository-level tests for canonical skill installation, generated workers, root validation, commit policy, and preservation of unrelated configuration.
- Add a negative identity test that fails on old commands, paths, environment variables, URLs, badges, fixture text, release names, and assets outside the legal allowlist.
- Run race-sensitive Go tests for same-branch replacement and different-branch concurrency.
- Treat the current checkout's missing `yaml` and `@clack/prompts` dependencies as an environment prerequisite to restore before using the root `npm test` result as completion evidence.

## Human Review

### Review targets

- Confirm that Safety Dance is the accepted product and command name.
- Confirm that preserving the upstream MIT notice only in the legal provenance surface satisfies the intended "no references" requirement.
- Confirm that the first release should preserve runtime behavior rather than redesign the gate or pipeline.
- Confirm that migration from an existing source-tool installation remains out of scope.

### Verify

- [ ] The architecture assigns the Go runtime, canonical skill, installer integration, legal notice, and tests to explicit owners.
- [ ] Every trust-boundary invariant from gate admission through durable upstream publication remains present.
- [ ] The identity migration covers commands, paths, configuration, environment variables, services, releases, docs, fixtures, and assets.
- [ ] The testing approach covers behavior parity, concurrency, failure recovery, terminal rendering, runtime installation, and identity leakage.
- [ ] The fixed `full` execution chain and its human gates match `task.md` and `workflows/delivery.md`.

### Known limits

- The research used a depth-one source snapshot, so it did not examine historical compatibility decisions.
- Provider-specific pull-request and CI internals were traced only to their invocation and publication boundaries.
- Root `npm test` previously reached 103 passing tests but could not complete because `yaml` and `@clack/prompts` were absent from the checkout.
- The exact repository-owned Go module path and release URL depend on the final hosting namespace; the plan must derive them from this repository rather than inventing an upstream-compatible alias.
