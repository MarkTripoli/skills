---
task: jev-ios
type: verification-continuation
summary: "Continuation matrix preserves historical and repair evidence; latest iOS WAIT repair and plain-helper native reruns pass, while independent review remains pending."
status: pending-independent-review
revision: bf603e1
---

# Phase 1 continuation notes

## Scope and preservation

This phase performs reconciliation and verification only. It does not implement product changes, run independent review, touch Android, upload recordings, resume the old Atomic run, create a worktree, push, or open a pull request.

Before editing `02-verification-jev-ios.md`, its exact bytes were archived at `evidence/phase1-20260920/02-verification-jev-ios.md.archive`.
SHA-256 for both the original and archive was `2bbed214cd0c7085e455538bf7abc4a00dd6a46b7c8ba4ae77c3b80ff774d649`.
All existing evidence directories and failed receipts remain in place. Video files remain local and unstaged; no recording is uploaded or added to a commit.

The implementation and test changes after `a108538` are limited to the latest review batch in `b95285c`; historical native and standalone receipts remain reusable where their execution paths were unchanged. The reconciled `02-verification-jev-ios.md` now reports pending affected reruns; A9 is untested for this latest batch.

## Acceptance matrix

| ID | Contract clause | Evidence and result | Verdict |
|---|---|---|---|
| P1 | Continue on existing `feat/jev-ios` checkout/worktree and preserve task metadata. | `git branch --show-current` is `feat/jev-ios`; task metadata and `task.md` are unchanged. | pass |
| P2 | Preserve original artifacts, failed evidence, recordings, and worktrees. | Byte archive above; prior `verification-8a45b9b`, `verification-20260920`, `repair-label-equal`, and `.atomic-delivery` remain present. Local evidence is unstaged. | pass |
| P3 | Reconcile verification status and item verdicts truthfully. | `02-verification-jev-ios.md` now distinguishes historical proof, latest offline repair proof, successful affected native reruns, preserved blocked attempts, and pending independent review. | pass |
| P4 | Exact implementation and test authorship remains Luna-fast; no product changes in this phase. | No implementation/test/diagnostic files changed. This phase changed only verification prose and the archival note. | pass |
| P5 | Fresh iOS-only proof uses real adapter and real JEV, without resuming old all-platform run. | Retained receipts identify `idb`, model `jev-1.13.0`, authorized simulator `7A023F51-F0DA-4179-868B-19207E433651`, and bundle `ai.typesafe.jevfixture`. No old run was resumed. | pass |
| P6 | Prove generic confirmation from independent UI status. | `evidence/continuation-20260920/generic/` receipt/report: passed, independent status `Confirmed`, stable PID, one assertion. Historical receipt remains preserved. | pass |
| P7 | Prove exact label-equal `Name` reaches `Confirmed Name`. | Plain `omp -p` direct literal goal; independent Status observation and verified recording. | pass |
| P8 | Prove Casey-to-Jordan replacement without relaunch. | Plain `omp -p` replacement receipt independently observes Casey then Jordan with stable PID `81161`; verified recording. | pass |
| P9 | Prove explicit device/app/PID identity and safe replacement. | Native receipts identify the authorized UDID, `ai.typesafe.jevfixture`, `idb`, simulator target, and stable PID. Replacement observations show Casey, then Jordan, before independent status changes. | pass |
| P10 | Prove truthful success, failed, and blocked outcomes. | `evidence/repair-cb7b53a/failed/jev-receipt.json` is a genuine failed controller outcome (`expected postconditions not observed independently`) with verified failed assertion media; `verification-20260920/zero-action/` and `generic-companion-unavailable/` remain blocked with explicit reasons. | pass |
| P11 | Prove owned app/recording/companion/simulator cleanup. | Controller tests prove cleanup executes after launch rejection and failed controller status. Existing zero-action receipt records app `pid: null`, no verifier recorder, stopped companion/socket, and simulator shutdown; failed proof retains recorder media and terminal status. | pass |
| P12 | Verify installed standalone iOS execution with external drivers, credentials, helper, and recording integration. | Rebuilt Codex entry point with external companion and plain `omp -p`; independent `Confirmed Name`, verified recording. | pass |
| P13 | Run aggregate tests. | `npm test`: exit 0; 150 tests, 150 pass, 0 fail, 0 skipped, 0 todo. | pass |
| P14 | Run all four runtime builds. | External destination `/tmp/jev-ios-risk-builds-1789902006`: claude-code 43 skills/7 workers; codex 43/7; oh-my-pi 43/7; pi 43/0. All exit 0. | pass |
| P15 | Run commit validation. | `node scripts/check-commits.mjs origin/main..HEAD`: exit 0 after the continuation artifacts (subject count recorded by final integration owner). | pass |
| P16 | Preserve browser/Android behavior and packaging. | Aggregate tests include browser/Android regressions; all four runtime builds pass. The new chooser regression explicitly preserves ordinary Android WAIT behavior; no Android device or emulator was touched. | pass (offline boundary) |
| P17 | Inspect CI/setup/docs and do not claim missing setup. | `package.json`, `docs/testing.md`, `.github/workflows/commits.yml`, `.github/workflows/release.yml`, `task.md`, and fixture docs were inspected. Node 26.8.1 and `node_modules` are present; no setup gap found. | pass |
| P18 | Complete independent code review only after verification. | Independent review of `b95285c` remains pending; this phase does not self-approve. | pending |
| P19 | Commit final task artifacts using repository conventions and prepare normal PR handoff, without submitting it here. | Latest repair receipt and reconciled artifacts are committed; normal handoff remains pending independent review. | pending |

## Stateful transitions and invariants

- Native acceptance state transitions are `initial observation -> bounded action -> fresh observation -> independent postcondition -> passed`, or `initial observation -> budget/companion failure -> blocked/failed`; terminal non-green states remain non-green.
- Replacement transitions are `Casey observed -> TYPE_TEXT -> Jordan observed -> TAP -> Confirmed Jordan observed` in the same PID and fixture launch. A PID/device/app identity change would invalidate the transition.
- Label-equal text remains an observed ambiguous editable value until the successful text action metadata and fresh observation permit confirmation. The blocked pre-repair run remains evidence of the illegal/unproven path.
- Cleanup is an invariant for every terminal outcome: verifier-owned app/recorder/companion resources are stopped, evidence is retained, and unrelated devices are untouched.
- Independent status must come from non-input UI output. Editable field echoes, fixture assumptions, model assertions, or stale reports cannot establish a pass.

## Completion notes

- Latest implementation repair and affected native proof are complete; independent review remains pending.
- Native proof includes plain-helper exact Name, Casey-to-Jordan, rebuilt standalone, blocked, and genuine failed scenarios; historical evidence remains preserved.
- Final local PR handoff remains provisional until independent review.

## Commands and outcomes

- `npm test` -> exit 0, 149/149 passing.
- `node scripts/build-runtimes.mjs --runtime {claude-code,codex,oh-my-pi,pi} --dest /tmp/jev-ios-final-builds/{runtime}` -> all exit 0 with counts above.
- `node scripts/check-commits.mjs origin/main..HEAD` -> exit 0, `ok: 13 subjects`.
- Final scope includes `b95285c` and explicit task artifacts; continuation receipts under `continuation-20260920` prove affected current behavior, while historical receipts remain provenance for earlier runs.


## Latest consolidated repair batch

- Root cause 1: `typesafe.mjs` previously removed WAIT after any text attempt with a TAP target. `node /tmp/jev-controller-probe.mjs` reproduced `TYPE_TEXT,TAP,TAP` and blocked before repair; after `b95285c` it produced `TYPE_TEXT,WAIT,DONE` and passed, matching the origin baseline.
- Root cause 2: `stopNativeFixture` previously treated empty or malformed IDB output as stopped. `node /tmp/jev-stop-probe.mjs` reproduced false verification before repair; after repair empty/malformed output and interrupted termination followed by empty output remain unusable errors, while valid empty arrays and Unknown/null-PID observations remain verified stopped.
- Durable regression evidence: `tests/jev-ui-controller.test.mjs` adds ordinary WAIT preservation plus unreadable, valid-empty, Unknown, and interrupted-cleanup cases. `npm test` passes 149/149.
- Affected native reruns used a goal-rewriting wrapper and are not accepted for exact Name, Casey seed, or standalone. The unchanged helper returned non-contract output/usage failure for the original exact goal; those blocked attempts and wrapper-backed receipts remain preserved. Generic/blocked evidence remains valid.
- Independent review is pending for this repair batch.
