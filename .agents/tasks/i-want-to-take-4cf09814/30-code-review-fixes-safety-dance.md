---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 29-code-review-safety-dance.md
reviewed_head_sha: af1aa859fb19f97ca5c5e0b5bb4000ea9b0d652d
fixed_head_sha: 645df6d
status: complete
summary: "This repair pass binds post-receive notifications to one-use admission receipts, writes and removes owned service definitions, preserves repaired installations during wizard compensation, enables strict repository-schema decoding, rechecks cancellation before publication binding, and restores the full Safety Dance aggregate. The validation-step implementation, caller authorization for token issuance, interactive TUI loop, and transactional cancellation compare-and-set remain blocked for a later review round."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The reviewed artifact named `690c067`; the working tree was at `af1aa85` before code changes. The repair is committed as `645df6d`.
- unrelated changes preserved: Existing `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not modified.

## Finding Dispositions

### CR-018

- disposition: blocked
- evidence: `executeRun` still registers step functions whose implementations fail closed with `implementation is not configured`. No safe source-backed integration was completed in this pass, so fresh runs still cannot reach publication.
- files changed: None.
- regression check: `npm test` passes the aggregate, but this does not prove a successful real validation run.

### CR-019

- disposition: fixed
- evidence: Admission now requires `old` and `new` revisions and stores a receipt keyed by the consumed token. Notification extracts that token from push options, matches gate, ref, old revision, and new revision, and consumes the receipt before creating a run.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/ipc/protocol.go`, `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/git/hook.go`, `tools/safety-dance/internal/git/testdata/hook-helper/main.go`, `tools/safety-dance/internal/daemon/admission_test.go`.
- regression check: `go test -race ./...` and `npm run test:safety-dance` passed.

### CR-020

- disposition: blocked
- evidence: The hidden token-issuing IPC method still authorizes any authenticated same-user peer. A complete ancestry policy for token issuance and a supported top-level tokenized push flow were not added.
- files changed: None.
- regression check: Existing admission and executable-hook tests pass; nested token issuance remains unproven.

### CR-021

- disposition: fixed
- evidence: Service installation now atomically writes the Darwin plist or Linux user unit before invoking the manager, uses the exact written path or basename, and removes only that owned definition after a successful stop.
- files changed: `tools/safety-dance/internal/daemon/service.go`.
- regression check: `go test -race ./internal/daemon` and `npm run test:safety-dance` passed.

### CR-022

- disposition: fixed
- evidence: Wizard compensation records whether `gate.Init` created or refreshed the installation and only calls broad `gate.Eject` for a newly created gate. Repaired existing state is left intact when later setup fails.
- files changed: `tools/safety-dance/internal/cli/wizard.go`.
- regression check: `go test -race ./internal/cli ./internal/wizard` passed.

### CR-023

- disposition: fixed
- evidence: Repository parsing now accepts the declared `commit`, `intent`, `providers`, `disable_project_settings`, and `no_ci` fields and uses `yaml.Decoder.KnownFields(true)` after the explicit top-level allowlist, so nested typed keys such as `commands.tset` are rejected.
- files changed: `tools/safety-dance/internal/config/config.go`.
- regression check: `go test -race ./internal/config` passed.

### CR-024

- disposition: blocked
- evidence: `safety-dance tui` still renders one snapshot and exits; a daemon event subscription and keyboard interaction loop were not implemented in this pass.
- files changed: None.
- regression check: Static TUI tests pass, but live interaction remains unproven.

### CR-025

- disposition: fixed
- evidence: The post-receive companion-hook contract is now reflected in gate and hook tests. Custom hooks move to `post-receive.safety-dance-user`, the managed wrapper remains installed, and the fallback hook test polls for the intentionally asynchronous helper.
- files changed: `tools/safety-dance/internal/git/hook.go`, `tools/safety-dance/internal/git/hook_test.go`, `tools/safety-dance/internal/gate/gate_test.go`.
- regression check: `go test -race ./internal/gate ./internal/git` and `npm run test:safety-dance` passed.

### CR-026

- disposition: blocked
- evidence: Publication now rechecks context and durable cancelled/failed state after mirror reconciliation and immediately before recording the binding. A transactional compare-and-set spanning the final state writes and the required barrier race test remain incomplete.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`.
- regression check: `go test -race ./internal/pipeline/...` passed; the cancellation race is not fully closed.

## Advisory Decisions

### ADV-004

- disposition: accepted
- reason: The prior repair already tightened package version parsing to three numeric components; the release contract tests pass.

## Verification

- command: `npm run test:safety-dance`
- result: passed; identity scan, Go race suite, vet, temporary binary build, and release-contract tests passed.
- command: `npm test`
- result: passed; validation, plugin sync, 136 Node tests, and the Safety Dance aggregate passed.
- command: `git diff --check`
- result: passed before the code commit.

## Remaining Blocks

- CR-018: connect concrete agent, configuration, command, provider, and evidence owners so a real run performs validation rather than failing closed at the first step.
- CR-020: authorize token issuance through the gate-context ancestry policy and expose only a trusted top-level tokenized push path.
- CR-024: implement event-driven TUI state updates and operator interaction coverage.
- CR-026: add a transactional compare-and-set publication boundary and the cancellation-after-mirror barrier test.
- Hosted release execution and authorized live-provider behavior remain untested.
