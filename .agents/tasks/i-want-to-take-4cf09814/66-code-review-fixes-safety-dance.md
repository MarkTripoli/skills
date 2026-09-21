---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 65-code-review-safety-dance.md
reviewed_head_sha: 61e2afbf6253d152674e131b6de53ec223aa8d7a
fixed_head_sha: 02dea4c
status: complete
summary: "CR-203 and CR-205 through CR-216 are fixed with production-path regressions; CR-190 remains blocked because five advertised non-GitHub provider hosts are not implemented. Focused Go race tests, the full Go race/vet/build suite, and npm test pass; hosted provider, Windows service, and release execution remain untested."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review covered `61e2afbf6253d152674e131b6de53ec223aa8d7a`; fixes were applied on that branch and committed as `02dea4c`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` directories were not staged or changed.

## Finding Dispositions

### CR-203

- disposition: fixed
- evidence: Publication reconciliation uses a cancellation-independent context, and the publication binding accepts a cancelled run while `push_active` ownership remains. A database regression covers cancellation after remote write before binding.
- files changed: `tools/safety-dance/internal/db/publications.go`, `tools/safety-dance/internal/db/db_test.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/db ./internal/pipeline/...`

### CR-204

- disposition: blocked
- evidence: Non-GitHub provider detection and configuration still exist, but production hosts for GitLab, Bitbucket, Azure DevOps, Forgejo, and Gitea require provider-specific implementations and fixtures outside this bounded repair. The existing code continues to fail closed rather than silently publish.
- files changed: None.
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/scm`

### CR-205

- disposition: fixed
- evidence: Typed validation findings are converted to the canonical `types.Findings` envelope and persisted before both success and failure transitions; evidence activity is written after terminal step activity so it is not overwritten. Validation and reader regressions cover typed evidence persistence.
- files changed: `tools/safety-dance/internal/pipeline/steps/validation.go`, `tools/safety-dance/internal/pipeline/runner.go`, `tools/safety-dance/internal/pipeline/steps/validation_test.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/... ./internal/db/...`

### CR-206

- disposition: fixed
- evidence: Cobra/pflag typed parse errors now map to usage exit class 2, including unknown shorthand flags. CLI regression coverage exercises the classification.
- files changed: `tools/safety-dance/internal/cli/root.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli`; built `safety-dance -z` returns 2.

### CR-207

- disposition: fixed
- evidence: Preserved-hook rejection invokes an authenticated daemon receipt-revocation method before removing the shell receipt, preventing a rejected receive from being replayed by later ref equality.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/admission_test.go`, `tools/safety-dance/internal/git/hook.go`, `tools/safety-dance/internal/ipc/protocol.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git`

### CR-208

- disposition: fixed
- evidence: Terminal cleanup removes gate-created worktrees through the registered bare Safety Dance repository rather than the unrelated working checkout.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/daemon ./internal/worktrees`

### CR-209

- disposition: fixed
- evidence: Gate initialization returns a bounded repair rollback handle. Wizard compensation invokes it after service failure and restores repaired hooks, configuration, metadata, and remotes without deleting pre-existing gate state.
- files changed: `tools/safety-dance/internal/gate/gate.go`, `tools/safety-dance/internal/cli/wizard.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/gate ./internal/cli ./internal/wizard`

### CR-210

- disposition: fixed
- evidence: New PR titles derive from durable intent, pass through configured title rendering, and default to a conventional `chore: validate changes` title instead of the repository-invalid free-form title.
- files changed: `tools/safety-dance/internal/pipeline/steps/pr.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/...`; `node scripts/check-commits.mjs origin/main..HEAD --title 'chore: validate changes'`

### CR-211

- disposition: fixed
- evidence: Linux systemd units now include `[Install]` with `WantedBy=default.target`, matching the existing `enable --now` lifecycle, and service definition tests cover the generated contract.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`

### CR-212

- disposition: fixed
- evidence: Windows scheduled-task ownership queries XML action data and validates the managed marker, runtime home, and binary before collision handling or deletion.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`

### CR-213

- disposition: fixed
- evidence: Direct daemon startup writes lifecycle records to `DaemonLog`; bootstrap and platform service definitions route stdout/stderr to owned log paths. The logs command now reads paths production owns.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/daemon/service.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/daemon`

### CR-214

- disposition: fixed
- evidence: The interactive TUI skips periodic rendering when the semantic model and width are unchanged while still forcing output after operator actions or refreshed state. Regression coverage confirms unchanged state emits once.
- files changed: `tools/safety-dance/internal/tui/app.go`, `tools/safety-dance/internal/tui/app_test.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/tui`

### CR-215

- disposition: fixed
- evidence: Terminal run cleanup intent is journaled before terminal status is persisted, and the existing ownership journal remains authoritative until Git confirms removal. Crash-boundary recovery coverage exercises the journal.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/worktrees/ownership.go`, `tools/safety-dance/internal/worktrees/ownership_durability_test.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/daemon ./internal/worktrees`

### CR-216

- disposition: fixed
- evidence: Identity tests now cover command, module, environment, path, service, and release classes with path-line findings. Release tests package a fake Windows executable and inspect archive members for the executable, license, and dependency notices.
- files changed: `tests/safety-dance-identity.test.mjs`, `tests/safety-dance-release.test.mjs`
- regression check: `npm test`

## Advisory Decisions

### ADV-001

- disposition: accepted
- reason: The committed third-party notice remains a checked-in source notice while release packaging generates the authoritative complete dependency notice; changing the manifest format is outside the critical repair scope.

## Verification

- command: `cd tools/safety-dance && go test -race ./... && go vet ./... && go build -o /tmp/safety-dance-review ./cmd/safety-dance`
- result: Passed all Go packages under race detection, vet, and binary build.
- command: `npm test`
- result: Passed validation, plugin sync, 136 Node tests, identity checks, full Go race/vet/build aggregate, and release-contract tests.
- command: `git diff --check`
- result: Passed with no whitespace errors.

## Remaining Blocks

- CR-204 remains blocked until concrete production hosts and provider-backed tests exist for GitLab, Bitbucket, Azure DevOps, Forgejo, and Gitea.
- Hosted Windows service execution, live provider behavior, and hosted `safety-dance-v*` release execution remain unavailable in this environment.
