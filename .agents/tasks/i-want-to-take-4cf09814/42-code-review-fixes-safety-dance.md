---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 41-code-review-safety-dance.md
reviewed_head_sha: 1c70460
fixed_head_sha: d89e30a
status: complete
summary: "This repair pass connects configured rebase, review, pull-request, and CI commands, records the exact reviewed head before publication, validates trusted policy from a fresh upstream fetch, hardens admission receipt replay and nonce replacement, hashes publication targets, fixes identity and release notices, and removes unsupported Windows binaries from the release promise. Response wake-up remains blocked because the synchronous runner has no durable resume channel; all local Go and Safety Dance aggregate checks pass."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The review targeted `1c70460`; fixes were committed as `d89e30a`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not modified.

## Finding Dispositions

### CR-070

- disposition: fixed
- evidence: The daemon now executes configured rebase, review, pull-request, and CI commands. A successful review records `git rev-parse HEAD` as durable review evidence, and publication requires that exact recorded head instead of caller equality.
- files changed: `tools/safety-dance/internal/config/config.go`, `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/pipeline/steps/validation.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/config ./internal/pipeline/steps`

### CR-071

- disposition: fixed
- evidence: Darwin process-environment inspection no longer uses the system-wide `ps -e` form; it scopes `ps eww -p` to the requested PID and fails closed for invalid or unreadable PIDs.
- files changed: `tools/safety-dance/internal/daemon/processenv_darwin.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon`; Darwin execution remains unavailable on this host.

### CR-072

- disposition: fixed
- evidence: Receipt reconciliation verifies the gate ref still equals the admitted new SHA before invoking the durable callback. Stale receipts are discarded, and an admission receipt is removed from memory when persistence fails.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon`

### CR-073

- disposition: fixed
- evidence: Manager replacement checks the immutable `(repository, branch, launch nonce)` binding before cancelling the active branch run. Replaying a nonce returns the existing run without supersession.
- files changed: `tools/safety-dance/internal/daemon/manager.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon ./internal/e2e`

### CR-074

- disposition: fixed
- evidence: Replacement cancellation occurs and joins before durable supersession, so publication ownership clears before the prior run is marked cancelled. The existing push-active and final publication guards remain in place.
- files changed: `tools/safety-dance/internal/daemon/manager.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon ./internal/pipeline/steps ./internal/e2e`

### CR-075

- disposition: fixed
- evidence: Each run fetches the configured upstream default branch into a run-owned temporary ref, loads policy from that ref, and deletes the temporary ref on exit. Missing or failed fetches fail the run.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/e2e`

### CR-076

- disposition: blocked
- evidence: Responses now validate the requested action and require the named run step to be in `awaiting_approval` or `fix_review` before persistence. The synchronous runner still has no durable response-consumption or wake-up channel, so an accepted response cannot yet resume a parked run.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli`; a durable resume test remains required.

### CR-077

- disposition: fixed
- evidence: The release workflow no longer publishes a Windows archive while Windows admission and mutation authorization remain fail-closed. The release contract tests now cover only supported Linux and macOS targets.
- files changed: `.github/workflows/safety-dance-release.yml`, `tests/safety-dance-release.test.mjs`
- regression check: `npm run test:safety-dance`

### CR-078

- disposition: fixed
- evidence: Service ownership accepts serialized and XML-escaped home values, Windows task actions include the managed marker, and Windows stop queries ownership before deletion.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon`; live service-manager execution remains unavailable.

### CR-079

- disposition: fixed
- evidence: Publication bindings now store a SHA-256 target fingerprint rather than the remote URL.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline/steps ./internal/e2e`

### CR-080

- disposition: fixed
- evidence: The identity scanner walks `.agents` while excluding only task history, and retired identity patterns are case-insensitive across space, dash, underscore, and dot separators.
- files changed: `scripts/check-safety-dance-identity.mjs`
- regression check: `npm run test:safety-dance`

### CR-081

- disposition: fixed
- evidence: Release packaging includes `THIRD_PARTY_NOTICES.md` alongside the binary and project license in every archive. The notice reproduces the required `modernc.org/sqlite` binary-distribution terms.
- files changed: `tools/safety-dance/THIRD_PARTY_NOTICES.md`, `tools/safety-dance/scripts/package-release.sh`
- regression check: `npm run test:safety-dance`

### CR-082

- disposition: fixed
- evidence: Missing-binary recovery now directs users to a checksummed `safety-dance-v*` release archive or source build and states that `scripts/install.mjs` installs only the agent skill.
- files changed: `skills/delivery/safety-dance/SKILL.md`, `skills/delivery/safety-dance/references/commands.md`
- regression check: `npm test`

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: Wizard rollback error joining was not required to close the trust-boundary findings in this pass and remains visible for a later focused repair.

### ADV-002

- disposition: fixed
- reason: Release packaging now requires exactly three non-empty dot-separated numeric version components.

## Verification

- command: `cd tools/safety-dance && go test ./...`
- result: Passed all Go packages.
- command: `cd tools/safety-dance && go vet ./...`
- result: Passed with no diagnostics.
- command: `npm run test:safety-dance`
- result: Passed identity scanning, Go race tests, vet, temporary build, and release-contract tests.
- command: `npm test`
- result: Passed 136 Node tests and the Safety Dance aggregate.
- command: `git diff --check`
- result: Passed for the committed repair diff.

## Remaining Blocks

- CR-076 remains blocked until a durable response consumer wakes or resumes the matching parked pipeline run.
- Darwin process inspection, live service-manager execution, hosted releases, and live provider behavior remain untested in this environment.
