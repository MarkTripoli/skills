---
task: jev-ios
type: final-checks
status: not-ready
---

# Final checks

- Branch/worktree: `feat/jev-ios`; base verified as `origin/main` at `4458fbf21e199dad45376b8164f78c2165ac1d20` (not a stale local `main`). No new worktree, push, PR, upload, old Atomic resume, recording upload, or Android interaction.
- Independent review is complete in `15-code-review-jev-ios.md`; product safety is clean. Overall acceptance remains NOT READY solely for CR-001 preservation loss.
- `npm test`: exit 0; 152 tests, 152 pass, 0 fail, 0 skipped, 0 todo.
- Runtime packaging for current product revision `69c9c0c`: four fresh `node scripts/build-runtimes.mjs` commands exited 0 into `/tmp/jev-ios-repair-0084d10-1789906894/`: claude-code 43 skills/7 workers; codex 43/7; oh-my-pi 43/7; pi 43/0.
- Commit validation: `node scripts/check-commits.mjs origin/main..HEAD` exited 0 with valid subjects. Final commit subject was checked against repository conventions.
- Luna-authored table validation: `python3` Markdown pipe-count check over `02-verification-jev-ios.md` reported `rows=24, expected_cells=8, invalid=[]`.
- Native evidence: current replacement remains under ignored `evidence/native-safety-current-20260920T084236-2488/replacement-corrected-1789908188-8659/`; passing standalone PID29301 bytes were copied from `/tmp/jev-ios-native-safety-current-20260920T084236-2488` into unique ignored task evidence. Historical `current-standalone` old blocked copy remains untouched. Source paths and SHA-256 values are in `source-sha256.txt`. Plain `omp -p` direct goals are recorded verbatim in `11`/`12`; the long goal's empty output and rejected rewriting wrapper remain failed historical evidence, not passing proof.
- Preservation status: **NOT MET (sole unresolved requirement)**. Earlier avoidable worker `rm -rf` commands deleted failed replacement and PID98075 standalone original media; PID98075 video is irrecoverable, and reconstructed JSON/transcript is not video recovery.
- Historical truth: genuine failed outcome remains `evidence/repair-cb7b53a/failed/` (cb7b53a provenance); blocked and cleanup regressions remain preserved and non-green.
- Cleanup observed after latest runs: authorized simulator `7A023F51-F0DA-4179-868B-19207E433651` was `Shutdown`; owned `/tmp/atomic-migration.JBu9Sk/jev-ios-idb.sock` was absent; owned companion/recorder processes were stopped. Unrelated processes were not touched.
- Qlty's existing shellcheck advisory remains deferred; no prose-only rerun was needed.
- All pre-edit artifacts were byte-archived under `evidence/final-sync-20260920/originals/` before synchronization; this correction pass also preserved copies under `evidence/final-sync-20260920/originals-repair/`. `task.md` was not edited.

## Reproducibility commands recorded

```sh
npm test
node scripts/build-runtimes.mjs --runtime claude-code --dest /tmp/jev-ios-repair-0084d10-1789906894/claude-code
node scripts/build-runtimes.mjs --runtime codex --dest /tmp/jev-ios-repair-0084d10-1789906894/codex
node scripts/build-runtimes.mjs --runtime oh-my-pi --dest /tmp/jev-ios-repair-0084d10-1789906894/oh-my-pi
node scripts/build-runtimes.mjs --runtime pi --dest /tmp/jev-ios-repair-0084d10-1789906894/pi
node scripts/check-commits.mjs origin/main..HEAD
xcrun simctl list devices | grep '7A023F51-F0DA-4179-868B-19207E433651'
test ! -S /tmp/atomic-migration.JBu9Sk/jev-ios-idb.sock
pgrep -af 'idb|record-evidence'  # inspected only; verifier-owned processes were already stopped
```sh
npm test
node scripts/build-runtimes.mjs --runtime claude-code --dest /tmp/jev-ios-risk-builds-1789902006/claude-code
node scripts/build-runtimes.mjs --runtime codex --dest /tmp/jev-ios-risk-builds-1789902006/codex
node scripts/build-runtimes.mjs --runtime oh-my-pi --dest /tmp/jev-ios-risk-builds-1789902006/oh-my-pi
node scripts/build-runtimes.mjs --runtime pi --dest /tmp/jev-ios-risk-builds-1789902006/pi
node scripts/check-commits.mjs origin/main..HEAD
xcrun simctl list devices | grep '7A023F51-F0DA-4179-868B-19207E433651'
test ! -S /tmp/atomic-migration.JBu9Sk/jev-ios-idb.sock
pgrep -af 'idb|record-evidence'  # inspected only; verifier-owned processes were already stopped
```

## Final synchronization status

- Product safety: **PASS** on revision `69c9c0c`; independent review is complete and clean.
- Preservation: **FAIL / NOT MET** solely because the deleted replacement and PID 98075 original recordings remain unavailable. The reconstructed transcript/receipt is not restoration.
- Overall objective: **ACTIVE / NOT READY**; `stop_review_loop=false`. No claim that three controller observations were met, and no premature controller block.
