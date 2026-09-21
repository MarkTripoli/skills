---
type: code-review
date: 2026-09-20
branch: feat/jev-ios
base_branch: main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 2fcc651
status: clean
summary: "The iOS-only WAIT and cleanup repairs are covered by focused regressions, independent probes, 150 aggregate tests, four fresh runtime builds, and current plain-omp native evidence; no critical or major finding remains."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` (`main`)
- reviewed HEAD: `2fcc651`
- commits: `4458fbf..2fcc651`
- staged and unstaged changes: none
- task-owned untracked files: none
- excluded changes: unrelated task directories and ignored native media; committed `.agents/tasks/jev-ios/` evidence is reviewed as acceptance evidence

## Previous Round

- previous artifact: `09-code-review-jev-ios.md`
- CR-001 Exact-Name acceptance is proven with a rewritten goal, not the required raw helper contract: fixed. The rejected rewriting wrapper is explicitly excluded; subsequent receipts record plain `omp -p`, direct goals passed byte-for-byte, and blocked raw-helper attempts remain preserved.

## Requirements and Standards

- task or ticket: `.agents/tasks/jev-ios/task.md`, including exact label-equal `Name`, `Confirmed Name`, Casey-to-Jordan without relaunch, truthful cleanup, standalone execution, and Android preservation
- implementation source: `02-verification-jev-ios.md`, `04-verification-continuation-jev-ios.md`, `10-repair-verification-jev-ios.md`, `11-repair-verification-jev-ios.md`, `12-repair-verification-jev-ios.md`, and `evidence-inventory.md`
- repository instructions: `shared/WRITING.md`, `shared/CONVENTIONS.md`, `skills/delivery/review-code/SKILL.md`

## Change Profile

- intent and expected behavior: keep ordinary Android WAIT available while suppressing post-text iOS WAIT only for confirmation ambiguity, and reject unreadable iOS app-state output during cleanup
- change description quality: current receipts and repair notes distinguish rejected wrapper evidence, blocked raw-helper attempts, and accepted plain-helper runs
- implementation model and review model: product/tests/diagnostics are attributed to Luna-fast; this review independently inspected code, receipts, frames, probes, tests, and builds
- changed-line size and logical cohesion: focused repair plus additive regressions and evidence reconciliation
- resulting large-file concerns: existing acceptance orchestration remains dense, but the repair keeps ownership at chooser and native cleanup boundaries
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: iOS-only post-text confirmation removes WAIT while Android retains WAIT; valid stopped observations remain accepted; empty/malformed/interrupted-unreadable observations fail; cleanup failures preserve non-green terminal outcomes
- missing or misleading coverage: no blocking gap found. The external native receipt does not embed the original helper goal or command transcript; the committed verification notes point to retained raw prompt hashes and distinguish accepted direct goals from rejected long-goal output.

## Five-Axis Assessment

- helper axis-coverage: second pass: correctness covered level 3 confidence 0.99; readability covered level 2 confidence 0.65; architecture covered level 3 confidence 0.91; security covered level 3 confidence 0.55; performance covered level 3 confidence 0.56. First pass had readability 0.54, architecture 0.90, security 0.51, and performance unclear 0.42; the performance section was manually expanded with bounded-path evidence before the second pass. Second stderr provenance: `judge: model jev-1.13.0, tokens 3110 in / 73 out`; first stderr: `judge: model jev-1.13.0, tokens 2867 in / 73 out`.

### Correctness

- assessment and evidence: `typesafe.mjs:14-15` scopes WAIT removal to iOS post-text confirmation and relevant ambiguity, while Android remains eligible. `acceptance.mjs:23-32` distinguishes unusable app-state output from valid `[]` and `Unknown`/null-PID observations. Independent `/tmp/jev-controller-probe.mjs` produced `TYPE_TEXT,WAIT,DONE` and passed for current and origin-main; `/tmp/jev-stop-probe.mjs` rejected empty, malformed, and interrupted-empty output while accepting valid stopped state. `npm test` passed 150/150.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: The repair is expressed as bounded conditions and boundary validation with focused tests. Repeated wrapper-backed claims were removed from accepted evidence rather than hidden.
- helper coverage: covered, level 2, confidence 0.54

### Architecture

- assessment and evidence: Platform-specific chooser policy remains in `typesafe.mjs`; process-state parsing and cleanup verification remain in `acceptance.mjs`; native regressions exercise each boundary. No new dependency or pass-through abstraction was introduced.
- helper coverage: covered, level 3, confidence 0.90

### Security

- assessment and evidence: The reviewed delta adds no credentials or uploads. Existing snapshot redaction and helper process cleanup tests remain green; plain helper evidence uses direct goals without fixture-specific rewriting.
- helper coverage: covered, level 3, confidence 0.51

### Performance

- assessment and evidence: The repair adds no unbounded loop, query, or dependency. Focused probes and the 150-test aggregate complete successfully; four runtime builds complete successfully.
- helper coverage: covered, level 3, confidence 0.56 (second pass)

## Verification Story

- command or inspection: `node /tmp/jev-controller-probe.mjs`; `node /tmp/jev-stop-probe.mjs`; `npm test`; four `scripts/build-runtimes.mjs` invocations; `node scripts/check-commits.mjs main..HEAD`; inspected current replacement receipt/media, standalone receipt/docs, and repaired source/tests
- result: probes pass with expected repaired behavior; aggregate tests report 150 passed and 0 failed; all runtime builds pass; commit validation reports 32 valid subjects. Current replacement evidence records Casey then Jordan under PID `81161`, same authorized simulator/app and verified two-assertion recording. Extracted frames show `Confirmed Casey via Email.` and `Confirmed Jordan via Email.`. The standalone rebuilt Codex receipt records independent confirmation with verified media and external plain `omp -p` setup. The original long refusal goal remains rejected because plain helper output was empty, not invented into a requirement.
- manual, screenshot, or before-and-after evidence: inspected `/tmp/repl55.png` and `/tmp/repl120.png`, showing Casey and Jordan respectively with independent status text; inspected `/tmp/jev-ios-current-replacement/report.md` and committed standalone report/receipt pointers. No Android/device action or upload was performed.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Native receipts omit direct helper-goal provenance

- type: Refactor suggestion
- severity: minor
- category: Data integrity and integration
- location: `skills/delivery/jev-ui/scripts/acceptance.mjs:19`
- evidence: Native receipts retain expected statuses and model decisions but do not include the literal helper goal, helper command, or a raw transcript. The accepted direct goals and plain `omp -p` contract are recorded in `11-repair-verification-jev-ios.md` and `12-repair-verification-jev-ios.md`, while current replacement media/receipt is external under `/tmp/jev-ios-current-replacement`.
- suggestion: Include a redacted goal and helper-command identity, or a checksum pointer to the raw helper transcript, in each acceptance receipt so future reviewers can verify provenance without relying on external paths.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: none

## Verdict

- decision: approve
- overall code-health change: The two previously blocking defects are repaired at their owning boundaries with durable regressions, and the current native acceptance evidence no longer relies on the rejected goal-rewriting wrapper.
- rationale: The exact probes, focused tests, aggregate suite, packaging builds, current media frames, and plain-helper receipts establish the requested behavior. The remaining receipt provenance omission is advisory and does not block the reviewed product change.

## Review Limits

- blocked or unavailable checks: None. Browser and Android live acceptance were not rerun, as task scope requires iOS continuation; Android preservation is covered by focused regression plus independent chooser probe.
- residual manual verification: None for the reviewed iOS repair; future acceptance receipts should carry helper provenance as advised.
