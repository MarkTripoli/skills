---
type: repair-verification
revision: bf603e1
status: pending-independent-review
summary: "Diagnosed repeated iOS WAIT decisions after text entry; iOS-only post-text confirmation now excludes WAIT while Android retains it. Plain omp -p replacement and rebuilt standalone Codex both pass with independent status observations."
---

# CR-001 native completion and WAIT repair

## Root cause and fix

The retained replacement and standalone receipts showed repeated `WAIT` decisions after successful `TYPE_TEXT` despite an available `TAP` target. `typesafe.mjs` treated attempted text as sufficient to keep WAIT available on iOS. The smallest behavioral repair adds an iOS-only `iosNeedsConfirmation` condition: after text is attempted, a TAP target exists, and the expected postcondition is not visible, WAIT is removed. Android's ordinary WAIT behavior is unchanged.

## Red/green proof

- Before the implementation edit, the new durable controller test failed (`true !== false`) for iOS post-text WAIT.
- After the edit, `node --test tests/jev-ui-controller.test.mjs` passed 47/47, including explicit Android WAIT preservation.
- `npm test` passed 150/150.

## Native acceptance

- Replacement: `/tmp/jev-ios-current-replacement`, plain `omp -p`, exact direct goals, exit 0. Seed independently observed `Confirmed Casey`, replacement independently observed `Confirmed Jordan`, stable authorized simulator/app/PID `81161`, same launch and recording verified (`passed:2`, failed 0).
- Standalone: rebuilt Codex runtime `/tmp/jev-ios-cr001-codex`; external `IDB_COMPANION`, plain `omp -p`, and absolute bundled record-evidence command. Exit 0 with independently observed `Confirmed Name`, stable PID `16750`, verified recording (`passed:1`, failed 0).
- No wrapper, goal rewriting, canned output, increased budget, reset, Android/ADB, old Atomic run, upload, push, or new worktree was used.

The original long refusal wording remains rejected because plain `omp -p` returned `{"text":""}`. The accepted direct literal goal `Confirm the current Name value` was passed byte-for-byte and is the documented contract used by the successful native runs.

## Cleanup

Acceptance cleanup stopped the fixture and recorder. The authorized simulator and owned IDB companion must be left shutdown/stopped after final reconciliation; historical failed and blocked receipts remain preserved and non-green.
