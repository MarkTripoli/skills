---
task: jev-ios
type: repair-verification
summary: "CR-001 and CR-002 repaired: native cleanup ownership now begins before authorized fixture setup, regression tests cover launch rejection and failed controller outcomes, and a real authorized iOS/JEV failed receipt is retained."
status: passed
revision: cb7b53a
---

# Repair verification

## Findings repaired

- CR-001: `runAcceptance` marks the authorized native fixture as verifier-owned before the pre-launch stop and launch operations. A rejected launch now enters the existing verified cleanup path. Authorization is checked before ownership is set, so unrelated targets are never cleaned up.
- CR-002: A genuine failed controller outcome was exercised with the authorized iOS simulator, real `idb` adapter, real JEV model, and an impossible independent status. The retained receipt is `evidence/repair-cb7b53a/failed/jev-receipt.json`; it has `status: failed`, reason `expected postconditions not observed independently`, and verified recording with one failed assertion. It is not relabeled blocked or passed.

## Durable regression evidence

- Before fix: the launch-rejection test failed because `stopped` was `1` (only pre-launch stop); final cleanup was skipped.
- After fix: `node --test --test-name-pattern='native launch rejection' tests/jev-ui-controller.test.mjs` passed with final cleanup, and `node --test --test-name-pattern='failed controller outcome' tests/jev-ui-controller.test.mjs` passed with terminal `failed` status and cleanup.
- `npm test`: exit 0, 147 tests, 147 pass, 0 fail, 0 skipped, 0 todo.

## Live iOS proof

- Authorized target: `7A023F51-F0DA-4179-868B-19207E433651`; bundle: `ai.typesafe.jevfixture`; driver: `idb`; model: `jev-1.13.0`.
- Generic success rerun: `evidence/repair-cb7b53a/generic2/jev-receipt.json`, exit 0, status `passed`, independent `Confirmed`, stable PID `89934`, verified media and one passed assertion.
- Genuine failed outcome: `evidence/repair-cb7b53a/failed/jev-receipt.json`, exit 1 as required for failed acceptance, status `failed`, stable PID `86724`, verified media and one failed assertion. Cleanup ran and no app remained running after the acceptance process.
- Existing Name, Casey-to-Jordan, and standalone receipts remain preserved and were not overwritten. Existing blocked attempts remain preserved.

## Commands and limits

- `npm test` passed as above.
- Final integration reran all four runtime builds to `/tmp/jev-ios-final-builds/`; each exited 0. Final commit validation also passed with 11 valid subjects.
- `qlty` was checked (`command -v qlty`, `$HOME/.qlty/bin/qlty`) but is unavailable in this environment; no qlty check ran. Repository validation remains authoritative.
- No Android device, ADB server, old Atomic run, upload, reset, or unrelated app was touched. Final inspection found the authorized simulator Shutdown, the owned IDB socket absent, and no verifier-owned acceptance process remaining. A visible unrelated process was not touched.

## Evidence reconciliation

`04-verification-continuation-jev-ios.md` now points P8 at current-revision replacement evidence and records the genuine failed receipt under P10, while preserving the older receipt as historical evidence. Independent review is complete in `07-code-review-jev-ios.md` (commit `a108538`) with approval and no critical or major findings.
