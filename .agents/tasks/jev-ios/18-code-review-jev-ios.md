---
type: code-review
date: 2026-09-20
branch: feat/jev-ios
base_branch: main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 2fc333a9d1e220b3537f4ad65d1b78b0e4d25744
status: clean
summary: "The iOS continuation is product-clean against released main at 4458fbf: the adapter, cleanup, and chooser repairs hold under 152 aggregate tests and the retained same-PID and standalone receipts; the sole prior finding, CR-001 historical recording loss, is declined as a user-accepted exception recorded in user-acceptance-preservation.md, so the next phase is the local delivery handoff without publishing."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` (`origin/main`, the released `v3.1.0` baseline named in `task.md`; local `main` lags at `fd28a8e` and was not used)
- reviewed HEAD: `2fc333a9d1e220b3537f4ad65d1b78b0e4d25744`
- commits: `4458fbf..2fc333a` (41 commits; `node scripts/check-commits.mjs origin/main..HEAD` → `ok: 41 subjects`); product commits are `0bcffbb`, `b1054d5`, `cb7b53a`, `b95285c`, `0084d10`, `69c9c0c`
- staged and unstaged changes: none
- task-owned untracked files: `.agents/tasks/jev-ios/user-acceptance-preservation.md` (user amendment record; committed by this phase)
- excluded changes: task artifacts under `.agents/tasks/jev-ios/`, ignored native media under `evidence/`; product scope is `git diff origin/main...HEAD -- . ':!.agents'` (17 files, +318/−31)

## Previous Round

- previous artifact: `15-code-review-jev-ios.md`
- CR-001 Historical recording preservation remains unmet: declined. The user explicitly accepted the loss of the failed replacement recording and the standalone PID 98075 recording and authorized continuation on the remaining evidence (`user-acceptance-preservation.md`, quoting `im fine with it and accept` and `contrinue`). The fix direction in round 15 named "explicit user resolution" as the only non-code path; that resolution now exists. The originals are still not recovered and are not claimed recovered; the requirement is amended, not satisfied.

## Requirements and Standards

- task or ticket: `.agents/tasks/jev-ios/task.md` (remaining acceptance items 1–5, authorized simulator, Luna-fast authorship, preservation, no Android/ADB contact) plus the user amendment in `user-acceptance-preservation.md`
- implementation source: `02-verification-jev-ios.md` (items table read first), `04-verification-continuation-jev-ios.md`, `native-safety-current.md`, `evidence-inventory.md`, `16-preservation-recovery-assessment.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, `skills/delivery/review-code/SKILL.md`

## Change Profile

- intent and expected behavior: add an explicitly selected iOS simulator surface (`ios.mjs`, `fixture/ios/`) to the released browser/Android `jev-ui` controller with device/app/PID identity checks, focused-frame revalidation before text dispatch, truthful idb app-state parsing during owned cleanup, and an iOS-only post-text confirmation rule in the chooser
- change description quality: product commit subjects are Conventional Commits and describe behavior (`fix(jev-ui): harden iOS cleanup and text dispatch`); the branch carries a separate `.changeset/jev-ui-ios.md`
- implementation model and review model: product code, tests, and diagnostics attributed to `openai-codex/gpt-5.6-luna-fast` in the task receipts; this round was reviewed by `anthropic/claude-fable-5-1` (Main), reading the full product and test diff against `origin/main` and re-running the aggregate suite
- changed-line size and logical cohesion: +318/−31 across 17 files; one new adapter module, one new disposable fixture, shared-file edits limited to surface dispatch (`acceptance.mjs`, `drivers.mjs`, `jev-ui.mjs`) and one chooser rule (`typesafe.mjs`)
- resulting large-file concerns: none new; `acceptance.mjs` and `ios.mjs` keep the collection's single-line function style
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: `tests/jev-ui-native.test.mjs` — idb is required for iOS selection; `idb` is the returned driver; metadata normalization keeps UDID and PID, rejects non-JSON hierarchies, malformed frames, wrong device, wrong PID scope, and non-ASCII text before any driver call; static labels do not advertise TAP; label-equal editable values stay ambiguous; secure values are redacted from value and fingerprint; TYPE_TEXT re-observes focus and value, uses `set-value` at coordinates when replacing an existing value and `ui text` when the field is empty, and accepts an idempotent value. `tests/jev-ui-controller.test.mjs` — iOS cleanup rejects empty, `{}`, error-object, and PID-without-state idb output as unusable while accepting `[]` and Unknown/null-PID as stopped; interrupted `xcrun` termination followed by unusable output stays an error; TYPE_TEXT dispatches to the revalidated focused frame (`109,93`); launch rejection still runs owned fixture cleanup; a failed controller outcome stays `failed` after cleanup; iOS post-text confirmation removes WAIT while Android retains it; an attempted-but-unchanged text action permits the next confirmation action.
- missing or misleading coverage: none blocking. The Android driver-discovery test dropped only an incidental call-count assertion (`assert.equal(calls,2)`), which pinned implementation, not behavior. No test was skipped, `only`, or `todo`.

## Five-Axis Assessment

- helper axis-coverage: first pass, all five axes `covered` at level 3; second run not needed. Stderr provenance: `judge: model jev-1.13.0, tokens 4506 in / 73 out`.

### Correctness

- assessment and evidence: `acceptance.mjs` sets `nativeStarted=true` before `stopFixture`/`launchFixture`, so `finally` always runs owned cleanup, including on launch rejection. `stopNativeFixture` for iOS checks running state before and after `simctl terminate`, and `appRunning` returns `null` (→ `iOS app-state observation is unusable`) for any record lacking a process-state key, so cleanup cannot be falsely verified. `ios.mjs act` refuses identity/PID/driver mismatch, unknown target, incompatible operation, and non-ASCII text before any idb call; with `verifyDevice` (set by both `acceptance.mjs nativeAdapter` and the `jev-ui.mjs` CLI) it re-observes before tap, requires an editable focused target with a numeric frame before text, and re-observes after text to require the observed value to equal `action.text`. `parseJson` throws on ambiguous or missing PID and on app-scope mismatch. `drivers.mjs selectTarget` requires `xcrun` and `idb`, accepts `booted` as online, and returns driver `idb`. `npm test` on HEAD: 152 passed, 0 failed. Retained receipts reconcile: replacement `status: passed`, PIDs `[9661]`, observed `Confirmed Casey`, `Confirmed Jordan`, `verified: true`; standalone `status: passed`, PID `[29301]`, observed `Confirmed Name`, `verified: true` (`evidence/native-safety-current-20260920T084236-2488/*/jev-receipt.json`).
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: surface dispatch is a single `surface==='android' ? … : …` at each shared boundary (`nativeAdapter`, `stopNativeFixture`, `captureNativeScreenshot`, CLI adapter selection) rather than a new abstraction. `appRunning` is the one multi-line function and reads as a boundary validator. The iOS adapter keeps the Android module's shape (`normalizeHierarchy`, `observe`, `act`). The chooser rule is named (`iosNeedsConfirmation`) and scoped by `snapshot.surface === 'ios'`.
- helper coverage: covered, level 3, confidence 0.76

### Architecture

- assessment and evidence: process-state validation stays in `acceptance.mjs` (owner of fixture lifecycle); identity, frame, and text-dispatch invariants stay in `ios.mjs` (owner of the driver); target discovery stays in `drivers.mjs`; the chooser rule stays in `typesafe.mjs`. No pass-through layer, no duplicated Android logic, no fixture knowledge in the production controller (`ViewController.swift` derives status from live field text; no Casey/Jordan special case).
- helper coverage: covered, level 3, confidence 0.98

### Security

- assessment and evidence: `install-authorized.sh` refuses every UDID except `7A023F51-F0DA-4179-868B-19207E433651`, builds under a `mktemp -d` root removed by an `EXIT HUP INT TERM` trap, and disables code signing only for the simulator build. `IDB_COMPANION` is required (no default socket), so the controller never binds to an unowned companion. Secure text values are redacted from element values and the fingerprint (`native-safe.mjs`, covered by `ios secure values are redacted`). Receipts carry model metadata, not credentials. No upload, device reset, or destructive recovery operation exists in the diff.
- helper coverage: covered, level 3, confidence 0.96

### Performance

- assessment and evidence: every idb/xcrun call goes through `boundedRunner`, so observation and dispatch are deadline-bounded (`native deadline kills a real child before its late effect` covers the runner). TYPE_TEXT adds at most three bounded observations per action; the controller's `maxActions`/`maxModels` budgets remain the outer bound. No unbounded loop, retry, or hot-path allocation was introduced; the aggregate suite completed in 6.7 s.
- helper coverage: covered, level 3, confidence 0.90

## Verification Story

- command or inspection: `git diff origin/main...HEAD -- . ':!.agents'` and `-- tests` read in full; `npm test`; `node scripts/check-commits.mjs origin/main..HEAD`; `jq` over the two retained current receipts; `xcrun simctl list devices`, socket paths, and `pgrep idb_companion` for owned-resource state; four runtime builds were not repeated (recorded in `final-checks.md` at product revision `69c9c0c`, unchanged since)
- result: 152/152 tests pass; 41 valid subjects; replacement receipt PID 9661 with both independent statuses; standalone receipt PID 29301 with `Confirmed Name`; authorized simulator `Shutdown`, both historical companion sockets absent, no `idb_companion` process. No device action, native rerun, upload, push, PR, Android/ADB interaction, or old-run resumption was performed by this review.
- manual, screenshot, or before-and-after evidence: `final.png` frames and verified `evidence.mp4` exist beside both receipts; round 15 already inspected the standalone final frame showing `Confirmed Name via Email.` and this round did not re-inspect media.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Active docs still describe iOS acceptance as pending

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `skills/delivery/jev-ui/SKILL.md:10`, `skills/delivery/jev-ui/SKILL.md:14`, `skills/delivery/jev-ui/SKILL.md:29`, `skills/delivery/jev-ui/references/result-schema.md:20`, `docs/getting-started.md:75`, `.changeset/jev-ui-ios.md:5`
- evidence: each says iOS acceptance "remains pending independent native verification" or "on this continuation branch". `task.md:29` required that wording during branch preparation. Native acceptance has since passed on this revision with a user-accepted preservation exception, so the sentences describe a superseded state once the branch merges.
- suggestion: at publish time, either keep the sentences with the exception stated, or drop the "pending" qualifiers in a `docs(jev-ui)` commit. Any such edit is prose only and changes no behavior; it was not made here because this phase is authorized to review and hand off, not to alter product files.

### ADV-002 Chooser narrowing also applies to Android

- type: Potential issue
- severity: info
- category: Functional correctness
- location: `skills/delivery/jev-ui/scripts/typesafe.mjs:15`
- evidence: `operations` now drops `WAIT` when a relevant label-equal ambiguity exists on any surface, and drops `DONE` after an attempted text action while a `TAP` target exists and the expected postcondition is not yet visible, on any native surface. Only the WAIT-after-text rule is iOS-scoped. For Android, `DONE` in that state could only produce `failed` (`jev-ui.mjs` passes DONE solely on an independent observation), so the narrowing removes a guaranteed-fail choice rather than a viable one. Aggregate tests including the released Android regressions pass; `task.md:39` forbids touching `emulator-5554`, so no live Android rerun exists on this branch.
- suggestion: none required; recorded so the pull request states that Android live acceptance was not repeated.

## Dead Code and Dependency Review

- newly orphaned code: none found; `stopNativeFixture` became an export for tests and is still the only cleanup path
- dependency findings: none

## Verdict

- decision: approve
- overall code-health change: adds a bounded, identity-checked iOS surface without weakening the released browser/Android paths; cleanup and dispatch invariants are enforced at the driver boundary and covered by focused regressions.
- rationale: the complete pinned scope was read; every suspected issue was either rejected with evidence or recorded as an advisory; the only prior required finding is declined by explicit user amendment, which is recorded durably and truthfully as an exception rather than as recovered evidence. Nothing critical or major remains.

## Review Limits

- blocked or unavailable checks: the deleted failed replacement recording and PID 98075 recording remain unrecovered; this review does not treat them as recovered. Live browser and Android acceptance were not repeated on this branch (offline regressions only). Runtime builds were not re-run in this round.
- residual manual verification: the user decides at publish time whether to relax the "pending" wording named in ADV-001.
