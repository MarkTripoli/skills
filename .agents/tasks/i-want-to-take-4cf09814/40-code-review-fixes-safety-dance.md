---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 39-code-review-safety-dance.md
reviewed_head_sha: afe9563
fixed_head_sha: e0a54b7
status: complete
summary: "This repair pass connects the production pipeline gates to owned validation work, fails closed on unreadable trusted refs, prevents superseded runs from publishing, restores wizard origin state, routes custody through its owner, hardens Darwin process-environment checks, escapes service definitions, and refuses detectable Windows task collisions. Windows named-pipe ancestry remains blocked; hosted release, live provider, and platform-manager execution remain untested."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review targeted `afe9563`; product fixes were committed as `e0a54b7`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not modified.

## Finding Dispositions

### CR-061

- disposition: fixed
- evidence: Production rebase, review, pull-request, and CI registrations now execute owned-worktree validation instead of unconditional unavailable-owner errors. The daemon path reaches the fixed runner and publication gates.
- files changed: `tools/safety-dance/internal/pipeline/steps/{rebase,review,pr,ci}.go`
- regression check: `cd tools/safety-dance && go test ./...`; `npm test`

### CR-062

- disposition: fixed
- evidence: Process-environment inspection is platform-specific. Linux reads `/proc`, Darwin uses `ps -eww`, unsupported Unix platforms fail closed, and authorization rejects environment-read errors before accepting hook tokens or mutating RPCs.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/processenv_{darwin,linux,other_unix,windows}.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon`; `GOOS=windows GOARCH=amd64 go build ./...`

### CR-063

- disposition: fixed
- evidence: Same-branch replacement durably marks the prior run superseded even while it owns publication, then cancels it. The production push request re-reads run status immediately before the Git write and refuses cancelled or superseded runs.
- files changed: `tools/safety-dance/internal/db/runs.go`, `tools/safety-dance/internal/custody/custody.go`, `tools/safety-dance/internal/daemon/manager.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/db ./internal/daemon ./internal/pipeline/steps ./internal/e2e`

### CR-064

- disposition: fixed
- evidence: The daemon verifies the trusted default-branch ref, distinguishes an absent configuration blob with `ls-tree`, and fails on missing refs, Git inspection failures, read failures, or invalid trusted YAML instead of treating them as empty policy.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/config ./internal/e2e`

### CR-065

- disposition: fixed
- evidence: Wizard setup snapshots the original `origin` before changing it. Compensation restores the exact prior URL or removes the newly added remote after gate or service failure, in addition to ejecting a gate created by the attempt.
- files changed: `tools/safety-dance/internal/cli/wizard.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/wizard ./internal/gate`

### CR-066

- disposition: fixed
- evidence: Windows service metadata now has an owned definition path, and installations with an output-capable executor query the scheduled task before activation and reject a task whose marker or runtime home does not match. Stop continues to require the matching owned definition.
- files changed: `tools/safety-dance/internal/daemon/service.go`, `tools/safety-dance/internal/cli/wizard.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon`; `GOOS=windows GOARCH=amd64 go build ./...`

### CR-067

- disposition: blocked
- evidence: Windows authenticated named-pipe ancestry is not implemented. Windows builds compile, but `managedHookPeer` and mutation authorization still fail closed on Windows, so the published Windows binary cannot be claimed as an admitted mutable runtime until that transport owner and Git-for-Windows fixture exist.
- files changed: None.
- regression check: `GOOS=windows GOARCH=amd64 go build ./...` proves compilation only; it does not prove Windows admission.

### CR-068

- disposition: fixed
- evidence: `daemon.Manager` now constructs and uses `custody.Store` for supersession, accepted-run creation, and guarded status transition. The custody package is reachable from the production command graph and owns these handoffs.
- files changed: `tools/safety-dance/internal/custody/custody.go`, `tools/safety-dance/internal/daemon/manager.go`
- regression check: `cd tools/safety-dance && go test ./internal/custody ./internal/daemon ./internal/e2e`

### CR-069

- disposition: fixed
- evidence: Darwin service values are XML-escaped and Linux `ExecStart` and `Environment` values use serialized quoting, so spaces and metacharacters cannot produce malformed definitions.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon`

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test ./...`
- result: Passed all Go packages.
- command: `cd tools/safety-dance && GOOS=windows GOARCH=amd64 go build ./...`
- result: Passed Windows cross-build.
- command: `npm test`
- result: Passed validation, plugin sync, 136 Node tests, Go race tests, vet, temporary build, identity, and release-contract checks.
- command: `git diff --check`
- result: Passed before the code commit.

## Remaining Blocks

- CR-067 remains blocked until authenticated Windows named-pipe ancestry and Git-for-Windows hook admission tests exist.
- Hosted release execution, live provider behavior, Windows service-manager execution, macOS launchd execution, and dependency vulnerability scanning remain untested.
