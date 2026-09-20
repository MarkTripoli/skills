---
task: i-want-to-take-4cf09814
type: structure-outline
summary: "Safety Dance enters the repository in six ordered slices: authenticated gate admission, durable branch runs, guarded validation and publication, operator interfaces, canonical agent distribution, and release integration. The Go module is github.com/MarkTripoli/skills/tools/safety-dance, public commands and state use the Safety Dance namespace, and source attribution remains only in the required legal file. Implementation must preserve each Git, concurrency, durability, and publication invariant before the binary becomes a public entry point."
repo: skills
branch: safety-dance
sha: 44bcfe83a96fe4ebbea57e5ace9cfca85d65af7f
---

# Bring Safety Dance into the skills repository

Safety Dance will live as a Go module under `tools/safety-dance/` and as one canonical skill under `skills/delivery/safety-dance/`. The first three phases rebuild the trusted runtime path behind package tests; the fourth exposes the complete command, and the last two connect it to this repository's installers and releases.

## Desired End State

- A push to the local `safety-dance` remote enters an authenticated, durable, branch-scoped run and reaches the real upstream only after every configured gate passes.
- Same-branch replacement, cross-branch concurrency, reviewed-head continuity, remote-head leases, gate-mirror reconciliation, and durable publication records match the selected design.
- Users operate the tool through `safety-dance`, `SD_HOME`, `~/.safety-dance`, and `.safety-dance.yaml`; retired product identifiers do not appear in shipped commands, paths, docs, fixtures, generated files, or release assets.
- The existing installer distributes `/safety-dance` to Claude Code, Codex, Oh My Pi, Pi, and portable destinations without changing unrelated configuration.
- Tagged builds publish checksummed Safety Dance binaries, while the imported MIT notice remains at `tools/safety-dance/LICENSE`.

## Phase Checklist

- [ ] Phase 1: Admit authenticated pushes through the branded local gate
- [ ] Phase 2: Persist and coordinate branch-scoped runs
- [ ] Phase 3: Validate and publish without crossing a stale boundary
- [ ] Phase 4: Expose the complete CLI, service, setup, and TUI
- [ ] Phase 5: Distribute the canonical agent skill
- [ ] Phase 6: Add repository checks and binary releases

---

## Phase 1: Admit authenticated pushes through the branded local gate

Create the independent Go module and the smallest executable flow behind internal package tests: initialization produces a bare gate, installs authenticated hooks, and converts an accepted ref update into a daemon notification. The phase does not add `cmd/safety-dance`; partially imported runtime code remains unreachable from public commands.

### Change Outline

```diff
 tools/safety-dance/
+├── go.mod                         # github.com/MarkTripoli/skills/tools/safety-dance
+├── go.sum                         # pinned Go dependencies
+├── LICENSE                        # required imported MIT notice
+└── internal/
+    ├── config/                    # .safety-dance.yaml contract
+    ├── paths/                     # SD_HOME and ~/.safety-dance
+    ├── types/                     # gate and notification shapes
+    ├── git/                       # pre-receive and post-receive hooks
+    ├── gate/                      # bare repository setup and rollback
+    └── ipc/                       # authenticated local notification transport
```

The gate keeps admission and notification separate:

```text
pre-receive
  authenticate token and ref request
  reject on failure
  accept on success

post-receive
  notify local daemon
  record notification failure
  never pretend an accepted ref was rolled back
```

Port the package tests with the code. Rename module imports, commands, remote names, environment variables, configuration paths, fixtures, socket names, and errors as one contract. Do not add compatibility aliases.

### Validation

#### Automated Verification

- [ ] `cd tools/safety-dance && go test -race ./internal/config ./internal/paths ./internal/types ./internal/git ./internal/gate ./internal/ipc`
- [ ] `cd tools/safety-dance && go test ./internal/gate -run 'Init|Hook|Rollback'`

Done when a temporary repository can initialize a gate, reject an unauthenticated update, accept an authenticated update, and emit the accepted ref notification without exposing a public binary.

human-gated: false

---

## Phase 2: Persist and coordinate branch-scoped runs

Consume the gate notification in one daemon owner, write the run before starting work, and isolate each run in a disposable worktree. A repository-and-branch lock replaces active work only on the same branch; other branches remain concurrent.

### Change Outline

```diff
 tools/safety-dance/internal/
+├── db/                            # SQLite schema, transitions, recovery
+├── daemon/                        # singleton service and run manager
+├── custody/                       # accepted ref ownership and recovery
+└── worktrees/                     # disposable checkout lifecycle
```

```text
notify(repo, branch, gate_head)
  acquire lock(repo, branch)
  cancel and join prior run for the same key
  persist replacement run and accepted head
  create isolated worktree
  start run
  release lock
```

The database remains the source of truth across daemon restarts. Cleanup must not delete a worktree still owned by an active or recoverable run.

### Validation

#### Automated Verification

- [ ] `cd tools/safety-dance && go test -race ./internal/db/... ./internal/daemon/... ./internal/custody/... ./internal/worktrees/...`
- [ ] `cd tools/safety-dance && go test -race ./internal/daemon -run 'SameBranch|DifferentBranch|Restart|Singleton'`

Done when tests prove same-branch replacement, different-branch overlap, daemon singleton ownership, restart recovery, and owned-worktree cleanup against persisted run records.

human-gated: false

---

## Phase 3: Validate and publish without crossing a stale boundary

Add the complete fixed pipeline and exercise it through a gate notification in an end-to-end test. This phase owns the one obligation that matters at the trust boundary: only the reviewed head may become the published head.

### Change Outline

```diff
 tools/safety-dance/internal/
+├── agent/                         # validation-agent execution and schemas
+├── branchsync/                    # gate mirror and upstream reconciliation
+└── pipeline/
+    ├── runner.go                  # fixed step order and durable transitions
+    └── steps/                     # intent, rebase, review, test, document,
+                                  # lint, push, pull request, and CI
```

```text
accepted gate head
  -> intent
  -> rebase
  -> review
  -> test
  -> document
  -> lint
  -> push_active
       verify reviewed head == candidate head
       verify upstream head and choose lease
       push with force-with-lease when required
       verify upstream ref == candidate head
       update gate mirror
       persist publication binding
  -> pull request
  -> CI
```

Keep structured findings, retry limits, scenario evidence, verdicts, configured lint failures, and step results typed. A cancellation or process exit must leave enough state to classify the run and recover without repeating a completed publication.

### Validation

#### Automated Verification

- [ ] `cd tools/safety-dance && go test -race ./internal/agent/... ./internal/branchsync/... ./internal/pipeline/...`
- [ ] `cd tools/safety-dance && make e2e`

Done when a temporary upstream accepts the reviewed candidate, rejects stale reviewed or remote heads, records the verified publication, updates the gate mirror, and never publishes a failed or cancelled run.

human-gated: false

---

## Phase 4: Expose the complete CLI, service, setup, and TUI

Add the public binary only after the trusted pipeline is complete. The CLI initializes repositories, manages the daemon service, reports durable status, accepts responses, aborts runs, prints logs, and opens the setup wizard or responsive terminal UI without installing a second copy of the agent skill.

### Change Outline

```diff
 tools/safety-dance/
+├── cmd/safety-dance/              # public executable entry point
+├── internal/cli/                  # init, run, status, respond, abort, logs, daemon
+├── internal/daemon/service_*.go   # launchd, systemd, and Windows service setup
+├── internal/wizard/               # interactive repository setup
+├── internal/tui/                  # compact, wide, and plain-text rendering
+├── docs/                          # user and operator reference
+└── Makefile                       # build, test, lint, and e2e commands
```

```text
safety-dance
├── no configured repository -> setup wizard
├── active branch run         -> responsive TUI
├── init                      -> gate, remote, hooks, daemon service
├── run/status/respond/abort  -> durable run control
├── logs                      -> daemon and run diagnostics
└── daemon                    -> start, stop, restart, status
```

The setup transaction must restore the original Git configuration and remove only newly created Safety Dance files after failure. Plain-text output must remain ANSI-free and carry the same status and error information as the TUI.

### Validation

#### Automated Verification

- [ ] `cd tools/safety-dance && go test -race ./internal/cli/... ./internal/wizard/... ./internal/tui/... && go test -race ./internal/daemon -run 'Service'`
- [ ] `cd tools/safety-dance && go build ./cmd/safety-dance && make e2e`

Done when a temporary repository can run `safety-dance init`, push to the created remote, observe and control the durable run, and render matching compact, wide, and plain-text outcomes.

human-gated: false

#### Deferred human evidence (recorded, not a gate)

- Capture one terminal transcript for the setup wizard and one narrow-terminal run in the implementation artifact; automated golden tests remain authoritative for text and layout regressions.

---

## Phase 5: Distribute the canonical agent skill

Add `/safety-dance` as one canonical non-worker skill. Existing build and install code will copy it into runtime-specific skill trees and the Claude plugin; it must not generate `agent-*` worker definitions or let a nested validation agent control its parent run.

### Change Outline

```diff
 skills/delivery/safety-dance/
+├── SKILL.md                       # run, status, respond, abort, and logs
+└── references/                    # command and safety contracts
 scripts/validate.mjs
+  expected canonical skill count: 44
 workflows/delivery.md
+  independent Safety Dance operation and invocation
 tests/install.test.mjs
+  selected install, generated-tree, and uninstall preservation cases
 .claude-plugin/plugin.json
+  generated safety-dance skill entry
```

```text
skills/delivery/safety-dance/SKILL.md
  -> buildRuntime(runtime, temporary tree)
  -> runtime-adapted SKILL.md
  -> installer plan
  -> selected destination
```

The skill must refuse parent-run bypass or control from an agent spawned by that run. The root installer remains the only owner of skill installation; `safety-dance init` owns repository and service setup only.

### Validation

#### Automated Verification

- [ ] `node scripts/validate.mjs && node scripts/sync-plugin.mjs --check && node --test tests/install.test.mjs`
- [ ] `tmp=$(mktemp -d); for runtime in claude-code codex oh-my-pi pi; do node scripts/build-runtimes.mjs --runtime "$runtime" --dest "$tmp/$runtime"; done; rm -rf "$tmp"`

Done when every supported runtime contains the canonical Safety Dance skill, a selected install and uninstall preserve unrelated files, and no worker definition is generated for the non-worker skill.

human-gated: false

---

## Phase 6: Add repository checks and binary releases

Make Go behavior and identity checks part of normal repository verification, document the new product, and publish checksummed binaries from product-specific tags. Keep Safety Dance releases independent from the existing Changesets version tags.

### Change Outline

```diff
 scripts/
+└── check-safety-dance-identity.mjs  # shipped-file scan with legal allowlist
 tests/
+├── safety-dance-identity.test.mjs   # rejected and allowed fixtures
+└── safety-dance-release.test.mjs    # tag and asset naming contract
 package.json
+  test:safety-dance and identity checks in the aggregate test
 .github/workflows/
+├── tests.yml                         # Node checks plus Go tests and race tests
+└── safety-dance-release.yml          # safety-dance-v* native build matrix
 README.md
+  Safety Dance install and use entry point
 docs/
+  development, verification, and release instructions
 .changeset/
+  user-facing addition
```

The identity scan covers shipped tool, skill, script, test-fixture, generated-plugin, documentation, and release paths. It excludes task history and permits the imported copyright and permission notice only at `tools/safety-dance/LICENSE`; its retired-token patterns must not leave the exact retired product identity in shipped source.

Release tags use `safety-dance-v<version>`. Native Linux, macOS, and Windows jobs build `safety-dance`, archive platform-specific assets, and publish a checksum manifest under this repository's GitHub Releases page.

### Validation

#### Automated Verification

- [ ] `node scripts/check-safety-dance-identity.mjs && npm test`
- [ ] `cd tools/safety-dance && go test -race ./... && go vet ./... && go build ./cmd/safety-dance`
- [ ] `node --test tests/safety-dance-release.test.mjs`

Done when the aggregate checks fail on an identity leak or Go regression, pass with only the legal notice allowlisted, and the release contract names every supported archive and checksum from a `safety-dance-v*` tag.

human-gated: false

#### Deferred human evidence (recorded, not a gate)

- Record the first tagged workflow's Linux, macOS, and Windows artifact names and checksum verification in the pull request or release evidence; local tests prove the contract but cannot prove hosted runner execution.

---

## Open Questions

- None. The current repository fixes the Go module at `github.com/MarkTripoli/skills/tools/safety-dance`; Safety Dance uses its own `safety-dance-v*` tags in the same GitHub repository.

## Human Review

### Review targets

- Check that the first public binary appears only after gate admission, durable coordination, validation, and guarded publication are complete.
- Check that each phase has one obligation, consumes the prior phase immediately, and can land without changing existing skill behavior.
- Check ownership between the Go setup command and the root skill installer; neither should install or remove the other's files.
- Check that release and identity enforcement cover shipped files without rewriting legal attribution or historical task artifacts.

### Verify

- [ ] The six phases retain authenticated admission, durable branch isolation, same-branch replacement, cross-branch concurrency, and guarded publication in their responsible packages.
- [ ] Public commands, paths, environment variables, configuration, services, docs, fixtures, generated files, and assets use only the Safety Dance identity outside the legal notice.
- [ ] The canonical skill reaches all four runtime builds and portable installs without generating a worker or mutating unrelated configuration.
- [ ] Validation names runnable Go race, end-to-end, Node installer, identity, build, and release-contract checks.

### Known limits

- The selected source snapshot did not include repository history, so the phases preserve current tested behavior rather than undocumented historical compatibility decisions.
- Provider pull-request and CI behavior can be tested with fixtures and temporary remotes, but live provider proof requires credentials during final verification.
- The first release does not migrate another product's hooks, services, configuration, or persisted database and does not provide old-name aliases.
- Hosted cross-platform release execution remains deferred evidence until the first `safety-dance-v*` tag runs on GitHub Actions.
