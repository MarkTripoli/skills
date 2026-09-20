## Local handoff

- Title: `feat(jev-ui): complete iOS acceptance`
- Base: `main` at `4458fbf`
- Head: `feat/jev-ios` at the final reconciliation commit
- Publishing: intentionally not performed. No PR URL exists.

## Purpose

Complete the preserved iOS JEV adapter acceptance while retaining the released browser and Android behavior and repairing native cleanup on launch and controller failure.

## Acceptance criteria

- Fresh iOS-only verification uses the real adapter and JEV without resuming the old all-platform run: historical receipts identify `idb`/`jev-1.13.0`, and current repair receipts are under `evidence/repair-cb7b53a/`.
- Generic confirmation, exact label-equal `Name`, and Casey-to-Jordan replacement are independently observed without relaunch: historical `8a45b9b` receipts record `Confirmed`, `Confirmed Name`, then `Confirmed Casey` and `Confirmed Jordan` under stable fixture identity.
- Device/app/PID identity, safe replacement, truthful failed/blocked outcomes, and owned cleanup are proven: current `cb7b53a` records a genuine `failed` receipt and cleanup regressions, while preserved blocked receipts remain non-green.
- Installed standalone iOS execution uses external drivers, helper, credentials, and recording integration: the historical standalone receipt records the installed Codex entry point and external dependencies without exposing credentials here.
- Aggregate tests, runtime packaging, and browser/Android offline boundaries pass: `npm test` is 149/149 and all four runtime builds pass. Independent review of the latest `b95285c` repair batch and affected native reruns remain pending.

## Special things to note

- Historical successful native and standalone proof remains attributed to `8a45b9b`; the cleanup repair and affected proof are attributed to `cb7b53a`.
- Native recordings, screenshots, logs, credentials, and helper configuration remain local ignored evidence. No video binary is committed or linked.
- Qlty was run from a temporary installation and found one existing shellcheck advisory; authoritative repository checks pass.

## Evidence

- Final checks: `final-checks.md` records 147 passing tests, four packaging builds, commit validation, qlty limitation, and final simulator/socket state.
- Receipt inventory and SHA-256 archive record: `evidence-inventory.md`.
- Historical and repair receipts are retained under the ignored local evidence directory; this handoff links no local video files.

## Change outline

```text
skills/delivery/jev-ui/scripts/acceptance.mjs
  authorized native setup -> ownership registration -> launch/observe -> verified finally cleanup

tests/jev-ui-controller.test.mjs
  launch rejection regression + failed terminal outcome regression

.agents/tasks/jev-ios/
  reconciled verification -> acceptance matrix -> repair review -> local PR description
```

The prior independent review was clean before the latest repair batch. A fresh independent review is required before handoff; no external write was performed in this run.

## Human Review

### Review targets

- Inspect the repaired native ownership boundary, regression tests, reconciled acceptance tables, and independent review artifact.

### Verify

- [x] `npm test` exits 0 with 147 passing tests.
- [x] Four runtime builds exit 0.
- [x] `node scripts/check-commits.mjs origin/main..HEAD` exits 0.
- [x] Authorized simulator is Shutdown and the owned IDB socket is absent.

### Known limits

- Browser and Android live acceptance were not repeated; offline regressions and packaging pass, and Android was not touched.
- Qlty's one shellcheck advisory remains outside this task's scope.
