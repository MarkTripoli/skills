## Local handoff

- Title: `feat(jev-ui): complete iOS acceptance`
- Base: `main` at `4458fbf`
- Head: `feat/jev-ios` at the final reconciliation commit
- Publishing: intentionally not performed. No PR URL exists.

## Purpose

Complete the preserved iOS JEV adapter acceptance while retaining the released browser and Android behavior and repairing native cleanup on launch and controller failure.

## Acceptance criteria

- Fresh iOS-only verification uses the real adapter and JEV without resuming the old all-platform run: historical receipts identify `idb`/`jev-1.13.0`, and current repair receipts are under `evidence/repair-cb7b53a/`.
 - Generic, exact Name, and Casey-to-Jordan plain-helper reruns are independently observed and recorded; the original long refusal remains rejected because helper returned empty text.
- Device/app/PID identity, safe replacement, truthful failed/blocked outcomes, and owned cleanup are proven: current `cb7b53a` records a genuine `failed` receipt and cleanup regressions, while preserved blocked receipts remain non-green.
 - Installed standalone proof passes from rebuilt Codex with external `idb`, plain `omp -p`, credentials, and recording integration.
 - Aggregate tests, runtime packaging, and browser/Android offline boundaries pass: `npm test` is 150/150 and all four runtime builds pass. Independent review remains pending for the iOS-only WAIT repair.

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
