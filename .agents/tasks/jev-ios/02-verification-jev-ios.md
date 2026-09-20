---
task: jev-ios
type: verification
summary: "Historical iOS acceptance and cleanup repair proof remain preserved; latest iOS WAIT repair and plain-helper native reruns pass, with independent review complete."
status: complete
revision: bf603e1
target: main
---

# Verification

## Run

- Current repair revision: `b95285c` on `feat/jev-ios`; historical successful Name/replacement/standalone proof remains identified as revision `8a45b9b`. Evidence recordings remain local and ignored; committed non-sensitive inventories and receipts identify retained runs.
- Target: `main`, resolved at released `origin/main` revision `4458fbf`; 21 files changed, 8 of them tests or fixture files.
- Checks from: `package.json`, `.github/workflows/commits.yml`, and `.github/workflows/release.yml`; deployment and release-versioning steps were excluded.
- Coverage: 9 acceptance items; 8 claimed by implementation receipts, 1 claimed by none.
- Graded by: deterministic exit codes and exact receipt fields, plus typed-judgment helper model `jev-1.13.0`; command grading used `4155` input / `502` output tokens and diff grading used `2906` input / `284` output tokens. A1, A7, A8, T6, and T7 returned `unclear` and were decided by hand.

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | Aggregate repository test. | `npm test` | Exits 0 with no failing test. | Exit 0; validation and plugin sync passed; Node reported `tests 150`, `pass 150`, `fail 0`, `skipped 0`, `todo 0`. | pass | 1.00 | 0 |
| C2 | Claude Code runtime build. | `node scripts/build-runtimes.mjs --runtime claude-code --dest /tmp/jev-ios-verify-8a45b9b.4fozOj/build-claude-code` | Exits 0 and builds the requested runtime. | Exit 0; `built claude-code: 43 skills, 7 workers`. | pass | 1.00 | 0 |
| C3 | Codex runtime build. | `node scripts/build-runtimes.mjs --runtime codex --dest /tmp/jev-ios-verify-8a45b9b.4fozOj/build-codex` | Exits 0 and builds the requested runtime. | Exit 0; `built codex: 43 skills, 7 workers`. | pass | 1.00 | 0 |
| C4 | Oh My Pi runtime build. | `node scripts/build-runtimes.mjs --runtime oh-my-pi --dest /tmp/jev-ios-verify-8a45b9b.4fozOj/build-oh-my-pi` | Exits 0 and builds the requested runtime. | Exit 0; `built oh-my-pi: 43 skills, 7 workers`. | pass | 1.00 | 0 |
| C5 | Pi runtime build. | `node scripts/build-runtimes.mjs --runtime pi --dest /tmp/jev-ios-verify-8a45b9b.4fozOj/build-pi` | Exits 0 and builds the requested runtime. | Exit 0; `built pi: 43 skills, 0 workers`. | pass | 1.00 | 0 |
| C6 | Conventional Commit subjects. | `node scripts/check-commits.mjs origin/main..HEAD` | Exits 0 with no invalid commit subject. | Exit 0; check passed after the continuation commit. | pass | 1.00 | 0 |
| T1 | `tests/jev-ui-controller.test.mjs`. | `git diff origin/main...HEAD -- tests/jev-ui-controller.test.mjs`, read in this session | The change keeps this check's strength. | Added regressions for unchanged attempted text, ordinary native WAIT preservation, and unreadable/valid iOS cleanup observations; no tests were removed, skipped, marked `only`, or marked `todo`. | pass | 0.91 | 0 |
| T2 | `tests/jev-ui-native.test.mjs`. | `git diff origin/main...HEAD -- tests/jev-ui-native.test.mjs`, read in this session | The change keeps this check's strength. | Added iOS driver, identity, metadata, safe replacement, idempotent text, ambiguity, and redaction tests; the Android rewrite removed only an incidental call count, and no test was skipped, marked `only`, marked `todo`, or deleted. | pass | 0.92 | 0 |
| T3 | `skills/delivery/jev-ui/fixture/ios/AppDelegate.swift`. | `git diff origin/main...HEAD -- skills/delivery/jev-ui/fixture/ios/AppDelegate.swift`, read in this session | The change keeps this fixture's strength. | Added a UIKit entry point that creates the fixture window and view controller; no check was removed or skipped. | pass | 0.82 | 0 |
| T4 | `skills/delivery/jev-ui/fixture/ios/Info.plist`. | `git diff origin/main...HEAD -- skills/delivery/jev-ui/fixture/ios/Info.plist`, read in this session | The change keeps this fixture's strength. | Added fixed fixture identity, executable, versions, package type, display name, and launch-screen metadata; no check was removed or skipped. | pass | 0.82 | 0 |
| T5 | `skills/delivery/jev-ui/fixture/ios/JEVFixture.xcodeproj/project.pbxproj`. | `git diff origin/main...HEAD -- skills/delivery/jev-ui/fixture/ios/JEVFixture.xcodeproj/project.pbxproj`, read in this session | The change keeps this fixture's strength. | Added simulator application inputs, Debug and Release configurations, fixed bundle identity, and disabled code signing; no check was removed or skipped. | pass | 0.80 | 0 |
| T6 | `skills/delivery/jev-ui/fixture/ios/README.md`. | `git diff origin/main...HEAD -- skills/delivery/jev-ui/fixture/ios/README.md`, read in this session | The change keeps this fixture's strength. | Added policy-free UI, exact authorized target, target refusal, external transient build output, and simulator lifecycle instructions; no check was removed or skipped. | pass | hand | 0 |
| T7 | `skills/delivery/jev-ui/fixture/ios/ViewController.swift`. | `git diff origin/main...HEAD -- skills/delivery/jev-ui/fixture/ios/ViewController.swift`, read in this session | The change keeps this fixture's strength. | Status derives from the live trimmed name and selected channel; no JEV call, locator, Casey/Jordan special case, removed check, or skipped check was found. | pass | hand | 0 |
| T8 | `skills/delivery/jev-ui/fixture/ios/install-authorized.sh`. | `git diff origin/main...HEAD -- skills/delivery/jev-ui/fixture/ios/install-authorized.sh`, read in this session | The change keeps this fixture's strength. | Refuses other UDIDs, builds outside the source tree with cleanup traps, and installs, terminates, and launches only the fixed fixture bundle; no check was removed or skipped. | pass | 0.84 | 0 |
| A1 | Fresh iOS-only verification on the exact branch revision with the real adapter and JEV (`task.md:33`; claimed: yes). | Run the A2-A7 commands from `feat/jev-ios` revision `8a45b9b` and inspect their receipts. | Fresh iOS-only verification uses the real adapter and real JEV on the exact branch revision. | Historical acceptance ran generic, label-equal, replacement, installed standalone, and zero-action iOS acceptance from revision `8a45b9b`; current repair proof reran generic, exact-Name, Casey-to-Jordan, standalone, blocked, and genuine failed outcomes from `b95285c`; receipts report driver `idb` and model `jev-1.13.0`. | pass | hand | 0 |
| A2 | Generic confirmation comes from independent non-input UI output (`task.md:34`; claimed: yes). | `node skills/delivery/jev-ui/scripts/acceptance.mjs --surface ios --target 7A023F51-F0DA-4179-868B-19207E433651 --goal 'Confirm the delivery check-in' --expected 'Confirmed' --evidence-dir .agents/tasks/jev-ios/evidence/verification-8a45b9b/generic` | Generic confirmation passes from an independent non-input UI observation. | Exit 0; receipt status `passed`, PID `13299` stayed stable, Status supplied observed postcondition `Confirmed`, and media was verified with 1 passed assertion. | pass | 1.00 | 0 |
| A3 | Exact label-equal Name confirmation (`task.md:34`; claimed: yes). | Plain `omp -p` with direct literal goal `Confirm the current Name value`; retain raw helper I/O. | The long refusal wording remains rejected as empty text; direct literal goal passes with independent `Confirmed Name` status. | pass | hand | 0 |
| A4 | Genuine Casey-to-Jordan replacement without relaunch (`task.md:34`; claimed: yes). | Plain `omp -p` replacement run with unchanged direct goals and existing 10-action budget. | Exit 0; Casey then Jordan and both independent confirmation statuses observed under stable PID `81161`; verified recording. | pass | hand | 0 |
| A5 | Explicit identity and safe input replacement (`task.md:35`; claimed: yes). | Inspect the A2-A4 receipts and their independent observations. | Receipts prove device, app, driver, PID, and safe replacement without identity drift. | Receipts name the authorized UDID, `ai.typesafe.jevfixture`, `idb`, simulator identity, and one stable PID per run; current replacement changed Casey to Jordan under PID `39070` before independent Status changed. | pass | 0.80 | 0 |
| A6 | Truthful blocked outcome and owned app/recording cleanup across outcomes (`task.md:35`; claimed: yes). | Run zero-action acceptance with `--max-actions 0`, inspect its receipt, query `idb list-apps`, inspect verifier-owned recording processes, then stop owned services. | Zero-action remains blocked, evidence is retained, and owned app, recording, companion, and simulator resources stop. | Current continuation zero-action exited 1 as expected with `blocked` / `action budget exhausted`; verified media was retained. The prior and current owned cleanup checks leave no verifier recorder, stop the companion, remove its socket, and return the simulator to `Shutdown`. | pass | 1.00 | 0 |
| A7 | Installed standalone iOS execution uses external dependencies (`task.md:36`; claimed: yes). | Rebuilt `/tmp/jev-ios-cr001-codex/skills/jev-ui/scripts/acceptance.mjs` with external companion, plain `omp -p`, absolute record-evidence command. | Exit 0; independent `Confirmed Name`, stable PID `16750`, verified recording. | pass | hand | 0 |
| A8 | Aggregate regression and packaging preserve browser and Android boundaries (`task.md:37`; claimed: yes). | C1-C5 and controller/cleanup probes. | C1 passed 150 tests; all four runtime packages passed; `jev-controller-probe` returned `TYPE_TEXT,WAIT,DONE`; no Android device was touched. | pass | hand | 0 |
| A9 | Independent review follows verification (`task.md:37`; claimed: yes). | `13-code-review-jev-ios.md` at clean HEAD `c5fa96c`. | Independent review decision approve; no critical or major findings. | pass | hand | 0

Verdicts: `pass`, `fail`, or `untested` (nothing in this environment could decide it). Confidence is the helper's probability for the verdict, or `hand` when decided without it; deterministic verdicts record `1.00`. Severity: 0 none, 1 cosmetic, 2 functional, 3 blocking.

## Findings

The latest native reruns diagnosed repeated iOS WAIT decisions after successful text entry. The iOS-only chooser repair is covered by a durable red/green regression while Android WAIT remains available. Plain-helper replacement and rebuilt standalone Codex now pass with independent status observations.

## Missing

No implementation or acceptance item remains open in this matrix; independent review of the product repair and current receipts is complete.

## Human Review

### Review targets

- Inspect the complete acceptance table, preserved historical receipts, current repair receipts, inventory/checksums, and independent review artifact.

### Verify

- [x] `npm test` exits 0 with 150 passing tests and no failures.
- [x] Four runtime builds exit 0 in `/tmp/jev-ios-final-builds/`.
- [x] `node scripts/check-commits.mjs origin/main..HEAD` exits 0 with 32 valid subjects.
- [x] Historical `8a45b9b` receipts preserve Name, Casey-to-Jordan, standalone, and blocked flows; current repair probes and receipts preserve prior generic/failed outcomes.
- [x] Affected generic, exact-Name, Casey-to-Jordan, blocked, and installed standalone native reruns after the chooser/parser repair.
- [x] Independent review of `bf603e1` and current native evidence: `13-code-review-jev-ios.md` clean at `c5fa96c`.
- [x] Authorized simulator is Shutdown, the owned IDB socket is absent, and no verifier-owned acceptance process remains.

### Known limits

- Browser and Android live acceptance were not repeated; aggregate tests and all runtime packages pass, and no Android device or ADB server was touched.
- Qlty was installed in `/tmp/jev-qlty-bin` for one bounded check. Its generated temporary configuration was removed afterward; the check found one pre-existing shellcheck advisory in `install-authorized.sh`, and no unrelated product edit was made.
- Native recordings and screenshots remain local ignored evidence; no video binaries or credentials are committed or linked.
