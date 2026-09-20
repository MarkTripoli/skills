---
task: jev-ios
type: repair-verification
summary: "The latest review batch is repaired as two root causes: ordinary native WAIT preservation and truthful iOS cleanup-state parsing. Offline regressions and probes pass; affected live iOS reruns were attempted but blocked by the external helper, so independent review remains pending."
status: pending-independent-review
revision: b95285c
---

# Repair verification

## Root causes and fixes

1. `typesafe.mjs` now removes `WAIT` only while a relevant ambiguous editable value still requires text establishment. Ordinary native text entry retains asynchronous WAIT choices. Exact label-equal Name ambiguity remains constrained.
2. `acceptance.mjs` now distinguishes unusable empty/malformed IDB output from valid stopped observations. Valid `[]` and valid `Unknown`/null-PID records remain stopped; malformed/empty observations and interrupted termination followed by an unreadable post-check cannot verify cleanup.

## Red/green evidence

Before editing, the retained commands were:

- `node /tmp/jev-controller-probe.mjs` -> current `TYPE_TEXT,TAP,TAP`, `blocked`; origin baseline `TYPE_TEXT,WAIT,DONE`, `passed`.
- `node /tmp/jev-stop-probe.mjs` -> empty, malformed, and interrupted-empty outputs incorrectly returned `verified:true`.

After `b95285c`:

- `node --test --test-name-pattern='ordinary native text|iOS cleanup rejects' tests/jev-ui-controller.test.mjs` -> 2 passed.
- `node /tmp/jev-controller-probe.mjs` -> `TYPE_TEXT,WAIT,DONE`, `passed`; origin baseline unchanged.
- `node /tmp/jev-stop-probe.mjs` -> empty/malformed/interrupted-empty report `iOS app-state observation is unusable`; valid Unknown remains verified stopped.
- `npm test` -> 149 passed, 0 failed, 0 skipped, 0 todo.

The durable tests are in `tests/jev-ui-controller.test.mjs`; no test is skipped or source-text-only.

## Affected live proof

The authorized simulator `7A023F51-F0DA-4179-868B-19207E433651` and real `idb` companion were used. Commands attempted generic, exact Name, and Casey-to-Jordan acceptance with the external recorder and configured helper under `evidence/repair-risk-20260920065808/`. The simulator initially reported Shutdown, was booted, and the owned companion was restarted. Each run then blocked before actions because the external JEV text helper returned invalid JSON. These are retained blocked attempts, not passes. Existing successful Name, replacement, standalone, generic, failed, and blocked receipts remain preserved and were not overwritten.

No Android device or ADB server, unrelated process, old Atomic run, upload, push, PR, reset, or new worktree was used.

## Other checks

- Four runtime builds into `/tmp/jev-ios-risk-builds-1789902006/` passed: 43 skills/7 workers for claude-code, codex, oh-my-pi; 43 skills/0 workers for pi.
- `node scripts/check-commits.mjs origin/main..HEAD` passed before this artifact commit with 16 valid subjects.
- Bounded qlty check ran from `/tmp/jev-qlty-bin/qlty` and found one existing medium ShellCheck advisory at `skills/delivery/jev-ui/fixture/ios/install-authorized.sh:6:6`; no unrelated edit was made.
- Simulator and companion cleanup state must be checked by the final integration owner; this phase does not self-approve.

## Next

A fresh independent review must inspect `b95285c`, this receipt, the reconciled verification matrix, and retained blocked evidence. Only then may final native proof and local PR handoff be claimed.
