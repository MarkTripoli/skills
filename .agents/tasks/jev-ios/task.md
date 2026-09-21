---
slug: jev-ios
title: Complete preserved JEV iOS support after browser and Android release
workflow: oneshot
created: 2026-09-20
base: main
status: pending-native-verification
---

# iOS continuation

The user authorized shipping browser/Android first, merging after checks, publishing a release, and creating a fresh local branch for remaining iOS work.

## Released baseline

- Feature PR: https://github.com/MarkTripoli/skills/pull/26, merged as `8cb65bc5a1cc98a7b87195ad05d938dfa261184d`.
- Version PR: https://github.com/MarkTripoli/skills/pull/27, merged as `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- Published release: https://github.com/MarkTripoli/skills/releases/tag/v3.1.0; tag points to that version commit.
- Feature and version PR Conventional Commits checks passed. The versioned release passed all 130 tests; final product passed four runtime builds, real browser/Android acceptance, independent reviews, and copied standalone execution without Atomic.

Branch `feat/jev-ios` starts from released main at `4458fbf`. Worktree: `/Users/marktripoli/.agents/worktrees/skills/jev-ios`. Keep it local and unpublished until its separate acceptance is complete. This branch does not change or qualify the published browser/Android release.

## Preserved implementation

The full integrated pre-split snapshot is `ccedd485635fc5ac89e82b99160bc0deae313901`. Its original worktree is `/Users/marktripoli/.agents/worktrees/skills/build-a-new-independently-1cea3ccc`; preservation branch `jev-ui-all-platform-preserved` retains the earlier checkpoint `891ef37`. Preserve all original artifacts, failed/interrupted runs, recordings, and worktrees.

Only the iOS adapter, `fixture/ios/`, and shared iOS integration in `acceptance.mjs`, `drivers.mjs`, and `jev-ui.mjs` are carried forward. Those three shared files had no later release safety edits after the initial extraction. Keep the released browser timeouts, origin interception, redaction, awaited process cleanup, Android XML decoding, checkable/Spinner normalization, isolated acceptance tests, and Node 22+ browser prerequisite. Never restore whole old shared tests or docs over these repairs.

All new implementation, tests, regressions, and diagnostic programs must be authored by `openai-codex/gpt-5.6-luna-fast`. Main may inspect, run existing programs, manage git, and write prose/configuration/evidence. Restore relevant observable iOS regressions into current tests; preserve the released regressions and avoid canned state, source-text, or forwarding-only tests. Add an iOS-specific Changeset. Mark iOS as pending independent acceptance in active docs rather than claiming readiness.

## Remaining acceptance

1. Run a fresh iOS-only verification on the exact branch revision, using the real adapter and real JEV. Do not resume the old all-platform Atomic workflow automatically.
2. Prove generic confirmation, exact label-equal Name, and genuine Casey-to-Jordan replacement without relaunch between transitions. Expected statuses must come from independent non-input UI observations, not model assertions or fixture-state echoes.
3. Prove explicit device/app/PID identity, safe input replacement, truthful failed/blocked outcomes, and owned app/recording cleanup across success and failure. Preserve evidence for every run; do not reset devices to hide failures or increase budgets to manufacture green.
4. Verify installed standalone iOS execution with the documented external drivers, credentials, helper command, and recording integration; do not assume Atomic or repository-relative helpers.
5. Run current aggregate tests and runtime packaging, then independent review. Browser/Android behavior and packaging must remain intact.

Authorized simulator: `7A023F51-F0DA-4179-868B-19207E433651`; fixture bundle: `ai.typesafe.jevfixture`. The prior observation service used `/tmp/atomic-migration.JBu9Sk/jev-ios-idb.sock`; start the documented owned companion when needed, rather than assuming an old process is still alive. Existing helper configuration is in `/tmp/atomic-migration.JBu9Sk/acceptance-environment.json`; do not print credentials. Do not touch Android `emulator-5554` or kill the ADB server.

The original Atomic run `3a9f5147-f685-4d42-acfb-322bcb5f520f` remains paused at stage 039. Its interrupted iOS attempt is not a passing result. The current handoff prepares the branch; it does not claim completion of the native acceptance above.

## Branch preparation proof

The preserved iOS adapter, fixture, shared entry points, observable native regressions, pending-acceptance docs, and separate iOS Changeset are integrated on this branch. Released browser, Android, helper, and origin-safety implementations remain unchanged.

Main ran the frozen branch contents: `npm test` passed all 144 tests, mechanical validation and plugin synchronization passed at version 3.1.0, and both the production iOS CLI help and acceptance CLI help exited zero. An initial selective-test restoration syntax error was repaired before this final run; the incidental driver-discovery call-count assertion was removed rather than repinned. These checks prove an offline integration baseline, not live iOS operation.

No new iOS live acceptance was performed during branch preparation. The owned release fixture server, Android verification emulator, and idle iOS companion were stopped after release proof; unrelated browser sessions and devices were left alone. Restart only the explicitly owned services needed for the next native verification. The original paused run and all prior evidence remain preserved.
