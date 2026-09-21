---
type: code-review
date: 2026-09-20
branch: safety-dance
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 21750d96db24c3e5e7759a8a63e18f8f253bfea1
status: findings
summary: "The complete Safety Dance change at 21750d9 still has two major lifecycle gaps. The built-binary test can pass without creating or completing a run, and startup receipt import leaves an existing pre-acceptance daemon receipt permanently unreconciled. The next phase must make the binary regression non-vacuous and merge gate acceptance into existing receipts before review repeats."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `21750d96db24c3e5e7759a8a63e18f8f253bfea1`
- commits: 174 commits in `origin/main..HEAD`, including the Safety Dance implementation, review fixes, tests, docs, and task history
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `.agents/tasks/i-want-to-take-4cf09814/evidence/`
- excluded changes: all `.agents/tasks/` artifacts and the two task-owned untracked directories; no unrelated product changes were present

## Previous Round

- previous artifact: `97-code-review-safety-dance.md`
- CR-338 The shipped workflow still lacks a binary push-to-publication regression: still open
- CR-339 Binary-test cleanup can stop the user's default daemon: fixed
- CR-340 A committed gate update can be lost before accepted notification persists: still open
- CR-341 Replacement validation can go stale while an older publication rewinds the gate: fixed
- CR-342 Receipt acknowledgements are not crash-durable: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-to-take-4cf09814/task.md`; import the referenced local Git gate as an independently named product without shipped references to the source repository
- implementation source: `.agents/tasks/i-want-to-take-4cf09814/05-plan-safety-dance.md`; the plan requires durable accepted-ref custody, restart recovery, built-binary gate-to-publication proof, and guarded publication
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: add the Safety Dance Go tool, authenticated local Git gate, durable branch-scoped daemon, fixed validation and guarded publication pipeline, operator interfaces, canonical skill distribution, identity checks, CI, and native release packaging
- change description quality: commit subjects identify the implementation and repeated lifecycle repairs; no pull request exists, so no pull-request body or title was available for review
- implementation model and review model: implementation model not recorded in the selected implementation receipt; review model GPT-5.6 Sol
- changed-line size and logical cohesion: 232 non-task files with 40,150 additions and 4 deletions; the scope is one imported product plus repository integration, but its size requires subsystem-level tests to carry the review burden
- resulting large-file concerns: `internal/config/config.go`, `internal/scm/github/github.go`, `internal/agent/agent.go`, `internal/gate/gate_test.go`, and `internal/db/run.go` exceed roughly 1,000 lines; no newly proven blocking defect follows from size alone
- dependency or lockfile changes: a new pinned Go module and checksummed `go.sum` add Cobra, Bubble Tea/Lip Gloss, YAML, SQLite, and supporting dependencies; package dependencies did not change

## Tests Reviewed First

- behavior claimed by tests: the selected verification artifact records passing root, race, vet, build, runtime, identity, release-contract, and temporary-remote checks at `49c6c2d`; the latest fix adds built-binary push coverage and relies on existing receipt reconciliation tests
- missing or misleading coverage: `TestPublicBinarySmoke` pushes the same commit already installed upstream, does not require the status poll to observe completion, and therefore passed in 21.88 seconds after the poll timed out; no test covers importing a gate receipt when the same token already exists in the daemon store with `Accepted == false`

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3443` in / `73` out

### Correctness

- assessment and evidence: publication, cancellation, branch replacement, and current focused package checks pass, but the built-binary proof is vacuous and receipt startup import skips the exact pre-acceptance record that must become recoverable; see CR-343 and CR-344
- helper coverage: covered, level 3, confidence 0.97

### Readability and Simplicity

- assessment and evidence: gate, admission, manager, publication, CLI, and repository integration have explicit owners; the latest fixes extend those owners instead of adding parallel control paths. The large imported packages remain costly to navigate, but no critical or major readability defect was proven.
- helper coverage: covered, level 2, confidence 0.77

### Architecture

- assessment and evidence: the daemon owns authenticated admission and durable run construction, the pipeline owns fixed step order, and the publication step owns upstream verification and binding. CR-344 is an ownership violation inside admission recovery because two custody journals are not merged into one accepted receipt state.
- helper coverage: covered, level 2, confidence 0.52

### Security

- assessment and evidence: mutation RPCs inspect peer ancestry and nested-run markers, hooks fail closed before ref mutation, URLs are redacted, and tests exercise token replay and gate mismatch. No new critical or major security defect was reproduced in the pinned scope.
- helper coverage: unavailable

### Performance

- assessment and evidence: branch locks are scoped by repository and ref, receipt reconciliation snapshots pending work, status polling is bounded, and database use is local. No critical or major unbounded hot-path or scalability defect was found.
- helper coverage: unavailable

## Verification Story

- command or inspection: `go test ./internal/daemon ./internal/cli ./internal/git ./internal/e2e`; `make e2e`; `go vet ./...`; `go test -count=1 -v ./internal/e2e -run TestPublicBinarySmoke`; `git diff --check origin/main...HEAD -- ':!.agents/tasks/**'`
- result: focused packages, end-to-end target, vet, product diff check, and the named public-binary test passed; the named test took 21.88 seconds and passed without proving that its 20-second status poll reached a terminal state
- manual, screenshot, or before-and-after evidence: source tracing showed upstream receives the candidate before `safety-dance init`, while the final assertions compare both refs to that unchanged candidate; no UI screenshot or hosted release evidence was required for these findings

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-343 The binary regression passes without a durable publication

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/safety-dance/internal/e2e/public_binary_test.go:27-37,74-99`
- failure mode: the shipped binary can fail to construct or complete a durable run while the required end-to-end regression still passes, leaving the plan's binary gate-to-publication acceptance criterion unproved
- evidence or reproduction: the fixture pushes `HEAD` to upstream before initialization, then pushes the same `HEAD` to the gate. The status loop has no `completed` flag or timeout failure, and both final ref assertions already hold when no publication occurs. `go test -count=1 -v ./internal/e2e -run TestPublicBinarySmoke` passed in 21.88 seconds, consistent with exhausting the 20-second loop rather than observing completion.
- fix direction: create and push a distinct candidate commit only after the upstream base and gate are initialized, require the poll to observe a durable completed or published run before its deadline, assert the run/publication record, and fail rather than skip or accept a missing authenticated hook flow

### CR-344 Startup import does not promote an existing admitted receipt

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `tools/safety-dance/internal/daemon/admission.go:84-99,153-168`
- failure mode: if the daemon persists admission, Git commits the gate ref, and the daemon restarts before post-receive marks the receipt accepted, the committed update remains in the daemon store with `Accepted == false` and reconciliation never creates its durable run
- evidence or reproduction: `admit` persists the token before ref mutation. On restart, `loadReceipts` restores that token, but `ImportGateReceipts` skips any token already present at lines 93-95 instead of merging the gate journal's accepted state. `ReconcileOnce` processes only receipts whose `Accepted` field is true at lines 164-168. No test covers this crash sequence.
- fix direction: when a matching gate journal entry already exists in the daemon map, validate gate/ref/old/new equality and promote that receipt to `Accepted: true` before the durable save; reject conflicts, preserve any stored metadata, and add a restart test for crash after ref mutation but before post-receive acceptance

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none proven; the two structured-output fixtures remain unreferenced but predate the latest repair and do not create a major defect
- dependency findings: the new Go dependencies are pinned and checksummed; no critical or major maintenance, license, or known-vulnerability finding was established in this review

## Verdict

- decision: request_changes
- overall code-health change: the latest changes narrow cleanup, mirror-CAS, replacement, and filesystem-durability gaps, but leave two required lifecycle proofs incomplete
- rationale: CR-343 permits a false-green built-binary acceptance test, and CR-344 preserves the committed-ref loss window that the latest repair intended to close

## Review Limits

- blocked or unavailable checks: no pull request existed; hosted `safety-dance-v*` release execution, authorized live-provider behavior, hosted Windows service execution, and induced power-loss evidence remain unavailable. Helper judgments for security and performance returned `unclear`, so those axes were decided from the pinned source and tests instead.
- residual manual verification: after fixes, run the non-vacuous built-binary flow on supported Unix and retain hosted cross-platform release and live-provider evidence as deferred proof
