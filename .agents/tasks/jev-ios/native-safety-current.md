---
task: jev-ios
type: native-verification
status: complete
---

# Current native safety verification (2026-09-20)

This is bounded native proof of the current safety fixes only. The existing preservation-loss blocker remains unchanged; this report does not claim overall readiness.

## Environment and provenance

- Authorized simulator: `7A023F51-F0DA-4179-868B-19207E433651` (`JEV Skill Acceptance`, iOS 26.5).
- Fixture bundle: `ai.typesafe.jevfixture`.
- Evidence root (unique, retained; no prior evidence was removed or overwritten): `/tmp/jev-ios-native-safety-current-20260920T084236-2488`.
- Dedicated evidence directories: `replacement-corrected-1789908188-8659` and `standalone-1789908337-26043`; the first argument-validation attempt also retained its unique empty evidence directory `replacement-1789908176-2488`.
- Companion: owned `/opt/homebrew/bin/idb_companion` on `/tmp/jev-ios-native-safety-current-20260920T084236-2488/idb.sock`, stopped after verification. Unrelated processes were not touched.
- Helper: unchanged plain `JEV_UI_TEXT_HELPER='["omp","-p"]'`; no wrapper, goal rewriting, reset, or increased budget. Model diagnostics/authorship requirement was Luna-fast; receipts retain the JEV model metadata.
- Installed standalone build: `/tmp/jev-ios-native-safety-current-20260920T084236-2488/codex-installed` (Codex runtime build exited 0).
- Config reference used without printing secrets: `/tmp/atomic-migration.JBu9Sk/acceptance-environment.json`.

## Exact native commands

```sh
mkdir /tmp/jev-ios-native-safety-current-20260920T084236-2488
/opt/homebrew/bin/idb_companion --udid 7A023F51-F0DA-4179-868B-19207E433651 --grpc-domain-sock /tmp/jev-ios-native-safety-current-20260920T084236-2488/idb.sock --log-level info
xcrun simctl boot 7A023F51-F0DA-4179-868B-19207E433651
skills/delivery/jev-ui/fixture/ios/install-authorized.sh 7A023F51-F0DA-4179-868B-19207E433651
IDB_COMPANION=/tmp/jev-ios-native-safety-current-20260920T084236-2488/idb.sock JEV_UI_TEXT_HELPER='["omp","-p"]' node skills/delivery/jev-ui/scripts/acceptance.mjs --surface ios --target 7A023F51-F0DA-4179-868B-19207E433651 --seed-goal 'Confirm the current Casey value' --seed-expected 'Confirmed Casey' --goal 'Replace the current Name with Jordan and confirm it' --expected 'Confirmed Jordan' --evidence-dir /tmp/jev-ios-native-safety-current-20260920T084236-2488/replacement-corrected-1789908188-8659
node scripts/build-runtimes.mjs --runtime codex --dest /tmp/jev-ios-native-safety-current-20260920T084236-2488/codex-installed
IDB_COMPANION=/tmp/jev-ios-native-safety-current-20260920T084236-2488/idb.sock JEV_UI_TEXT_HELPER='["omp","-p"]' JEV_UI_EVIDENCE_COMMAND=/Users/marktripoli/.agents/worktrees/skills/jev-ios/skills/delivery/record-evidence/scripts/evidence.py JEV_UI_EVIDENCE_CWD=/Users/marktripoli/.agents/worktrees/skills/jev-ios node /tmp/jev-ios-native-safety-current-20260920T084236-2488/codex-installed/skills/jev-ui/scripts/acceptance.mjs --surface ios --target 7A023F51-F0DA-4179-868B-19207E433651 --goal 'Confirm the current Name value' --expected 'Confirmed Name' --evidence-dir /tmp/jev-ios-native-safety-current-20260920T084236-2488/standalone-1789908337-26043
```

The initial replacement invocation with unsupported `--initial-name Casey` was retained as a non-run argument-validation attempt (`replacement.stderr`); it did not touch the simulator or overwrite evidence. The accepted corrected invocation above ran the same-launch seed and replacement.

## Results

### Same-launch Casey → Jordan replacement

- Receipt: `/tmp/jev-ios-native-safety-current-20260920T084236-2488/replacement-corrected-1789908188-8659/jev-receipt.json`.
- Status: `passed`; reason: `both transitions independently observed`; verified recording; 2 passed assertions, 0 failed.
- Independent UI observations: `Confirmed Casey via Email.` then `Confirmed Jordan via Email.`
- Identity: simulator UDID above, app `ai.typesafe.jevfixture`, driver `idb`, stable PID `9661` across seed and replacement; same launch (no relaunch between transitions).
- Media/report: verified `evidence.mp4`, `manifest.json`, `report.md` in that directory.

### Installed Codex standalone exact Name

- Receipt: `/tmp/jev-ios-native-safety-current-20260920T084236-2488/standalone-1789908337-26043/jev-receipt.json`.
- Status: `passed`; reason: `expected postconditions independently observed`; verified recording; 1 passed assertion, 0 failed.
- Independent UI observation: `Confirmed Name via Email.`
- Identity: simulator UDID above, app `ai.typesafe.jevfixture`, driver `idb`, PID `29301`; receipt model metadata is retained.
- Media/report: verified `evidence.mp4`, `manifest.json`, `report.md` in that directory.

## Cleanup and checksums

- Post-run `idb list-apps` output is retained at `postrun-list-apps.txt`.
- Owned fixture was terminated, owned companion stopped, socket absent, and authorized simulator shut down. Post-cleanup status is retained at `post-cleanup-status.txt`.
- SHA-256 inventory for this run's unique root and directories only: `/tmp/jev-ios-native-safety-current-20260920T084236-2488/SHA256SUMS`.
- No old evidence was removed, moved, or overwritten. No Android/ADB, uploads, PR/push, old workflow, or new worktree was used.

## Acceptance status

These native safety reruns are green. Overall acceptance remains **NOT READY** solely retaining the already-recorded preservation-loss blocker (and any independently pending review), not because native proof was skipped.
