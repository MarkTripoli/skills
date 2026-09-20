---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 81-code-review-safety-dance.md
reviewed_head_sha: eb4182ad9368e69cc8f5e47994ec87bef73790f8
fixed_head_sha: 616e9d0
status: complete
summary: "Fixed all twelve major findings from the review: managed-hook authorization and receipt custody, shell-safe notification fallback, crash-safe receipt locks, rollback integrity, full-ref coordination, restart step reuse, publication mode selection, service restart and identity isolation, and SemVer release validation. Focused Go tests, race tests, vet, the release tests, and the full npm aggregate passed; hosted release, live provider, and platform-specific service execution remain untested."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: Review 81 examined `eb4182ad`; fixes landed in `0ff96a4` and `616e9d0`, with the merge base unchanged at `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not staged.

## Finding Dispositions

### CR-280

- disposition: fixed
- evidence: `admit`, `revoke`, and `notifyPush` now require `managedHookPeer` authorization in addition to token and receipt binding. Ordinary IPC peers are rejected; executable hook coverage and daemon tests pass.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/admission_test.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon ./internal/git`; passed.

### CR-281

- disposition: fixed
- evidence: Final notification persistence restores the receipt in memory when removal cannot be saved, preserving retry custody without requiring a daemon restart.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/admission_test.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon`; passed.

### CR-282

- disposition: fixed
- evidence: The post-receive capture fallback builds an argument vector and invokes the executable directly; push options are passed as separate arguments and are not interpolated into `sh -c`.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test ./internal/git`; passed.

### CR-283

- disposition: fixed
- evidence: Receipt-lock ownership writes the PID into a private candidate directory before atomically renaming it into place. A process cannot leave the shared lock in an unpublished empty state; stale published PIDs remain reclaimable and live owners are retained.
- files changed: `tools/safety-dance/internal/git/hook.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/git`; passed.

### CR-284

- disposition: fixed
- evidence: Custom gate setup retains the resolved owned target for compensation, and eject removes the owned bare repository before the stable symlink. Custom setup, rerun, and eject tests pass.
- files changed: Already fixed before this review in `tools/safety-dance/internal/cli/wizard.go` and `tools/safety-dance/internal/gate/gate.go`.
- regression check: `cd tools/safety-dance && go test ./internal/gate ./internal/cli ./internal/wizard`; passed.

### CR-285

- disposition: fixed
- evidence: Fresh-gate rollback stops before filesystem and remote destruction when `DeleteRepo` fails, so a surviving database row cannot be left pointing at deleted resources.
- files changed: `tools/safety-dance/internal/gate/gate.go`
- regression check: `cd tools/safety-dance && go test ./internal/gate`; passed.

### CR-286

- disposition: fixed
- evidence: `recordPush` preserves canonical full refs, and short branch names are expanded only at the CLI boundary. Branches and tags with colliding short names therefore use distinct durable keys.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/daemon`; passed.

### CR-287

- disposition: fixed
- evidence: Core step fingerprints use the durable run base as the stable candidate input, and completed steps are reused after a modifying step advances the run head. The restart regression confirms a completed step is not invoked again after the head changes.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/pipeline/runner_test.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline`; passed.

### CR-288

- disposition: fixed
- evidence: `executeRun` checks whether the verified upstream head is an ancestor of the candidate. Fast-forward publication uses normal push semantics; explicit lease mode is selected only for a non-fast-forward rewrite, with focused request-construction coverage.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/pipeline/steps/push_test.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/pipeline/steps`; passed.

### CR-289

- disposition: fixed
- evidence: macOS restart uses `launchctl kickstart -k`; Linux uses the service restart operation; Windows ends the owned task before running it. Exact command sequences are covered by service tests.
- files changed: `tools/safety-dance/internal/daemon/service.go`, `tools/safety-dance/internal/daemon/service_test.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon`; passed.

### CR-290

- disposition: fixed
- evidence: Service labels and Linux definition filenames include a digest of the canonical runtime home, preventing distinct homes from colliding after readable path normalization.
- files changed: `tools/safety-dance/internal/daemon/service.go`, `tools/safety-dance/internal/daemon/service_test.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon`; passed.

### CR-291

- disposition: fixed
- evidence: The workflow and packager now validate the same SemVer shape, accepting prerelease and build metadata, rejecting leading-zero numeric identifiers, and rejecting malformed versions. Boundary tests cover those cases.
- files changed: `.github/workflows/safety-dance-release.yml`, `tools/safety-dance/scripts/package-release.sh`, `tests/safety-dance-release.test.mjs`
- regression check: `node --test tests/safety-dance-release.test.mjs`; passed.

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./... && go vet ./...`
- result: Passed.
- command: `npm test`
- result: Passed validation, plugin synchronization, 137 Node tests, identity checks, Go race tests, vet, temporary binary build, and release-contract tests.
- command: `git diff --check`
- result: Passed.

## Remaining Blocks

- Hosted Windows service execution, live provider behavior, hosted `safety-dance-v*` release execution, and induced OS/process crash evidence remain unavailable in this environment.
