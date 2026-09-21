---
type: repair-verification
revision: d57ae13
status: complete
summary: "Full production text-helper protocol was probed with the raw goal and real iOS field context; direct literal fallback enabled exact Name and generic native proof, while Casey replacement and installed standalone remained blocked without budget changes."
---

# CR-001 full-protocol native verification

## Scope and provenance

The rejected `/tmp/jev-ios-text-helper-continuation.py` was not used. The documented production prompt from `skills/delivery/jev-ui/scripts/text-helper.mjs` was tested byte-for-byte with the original goal and observed iOS Name field context. Raw prompt, stdout, stderr, exit status, and checksums are retained in ignored evidence at `evidence/cr001-full-protocol-20260920/`.

Original goal:

`Confirm the current exact Name value without replacing it`

The plain documented command was:

`cat prompt.txt | omp -p`

It exited 0 and returned `{"text":""}` (stderr only `Working...`), which is a rejected helper result because the contract requires a non-empty literal. This is the full production prompt, unlike the prior bare-goal probe. A valid direct user-input goal was then used verbatim, without helper rewriting:

`Confirm the current Name value`

That full prompt returned `{"text":"Name"}` (exit 0), and was used for native runs. No fixture-string matching, canned output, or increased action/model budgets was used.

## Native results

- Generic current acceptance: **passed**, plain `omp -p`, independent `Confirmed` status, stable authorized simulator/app identity, verified recording.
- Exact label-equal Name: **passed**, direct literal goal above, independent `Confirmed Name` status, stable authorized simulator/app identity, verified recording.
- Casey-to-Jordan same-PID replacement: **blocked**, seed transition exhausted the existing 10-action budget before independently observing Casey. Receipt and verified recording are retained; no budget increase or reset was used.
- Installed standalone Codex: **blocked**, built Codex runtime entry point with the same unmodified `omp -p` helper and direct literal goal; existing 10-action budget exhausted. Receipt and verified recording are retained.

The original exact goal remains unproven because the plain helper returned an empty text value. Casey replacement and standalone are not claimed green. All raw evidence remains preserved locally and is excluded from committed artifacts.

## Commands and checksums

- `node scripts/build-runtimes.mjs --runtime codex --dest /tmp/jev-ios-cr001-codex` -> exit 0 (`43 skills, 7 workers`).
- Native command used: `node skills/delivery/jev-ui/scripts/acceptance.mjs --surface ios --target 7A023F51-F0DA-4179-868B-19207E433651 ...` with `IDB_COMPANION=/tmp/atomic-migration.JBu9Sk/jev-ios-idb.sock` and `JEV_UI_TEXT_HELPER='["omp","-p"]'`.
- Raw original prompt SHA-256: `bcde8cbeddaedac548038c1ec370d619ed1de3e1eea83b51147fe7d14d721015`.
- Raw original stdout SHA-256: `e876900392ec131b31b77c5801a9aff3cc385ce36e86a7a33db7dfd2d462b277`.
- Raw original stderr SHA-256: `dfef4c342f986ab93a9e0bb90f2d88c3bf25b2455853253d31ef95c1c55192a7`.
- Direct-goal prompt SHA-256: `c70e1adf8dcfa206e309bbd4900479da689ff5bd4ed24027e011ce9f7a32f37b`.
- Direct-goal stdout SHA-256: `78f303fd18701f1b2583af95a8b979aaf5bf66aa204c2f4a5499c4450db819e4`.
- Exact Name receipt SHA-256: `ace709a75c6bac1887f82d1e9abb1ad25e9a4117e13c5097b6dd7d658194a283`.
- Casey replacement receipt SHA-256: `22e77176c12f76fdcf397ee79d6e0f69816bd9038fbcf3d0ecbac162145426a4`.
- Standalone Codex receipt SHA-256: `e31c50ae487f956767d1609b63f99a163b213d8039ee5cd37e904bfcf0b67868`.

## Cleanup

The owned companion was started only for these runs, then stopped; its socket was removed. Authorized simulator `7A023F51-F0DA-4179-868B-19207E433651` is `Shutdown`. No Android device, ADB server, unrelated simulator, upload, push, old Atomic run, or worktree was touched.
