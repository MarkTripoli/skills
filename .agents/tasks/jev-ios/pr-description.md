Task: `jev-ios`

Pull request: https://github.com/MarkTripoli/skills/pull/29 (#29). Title: `feat(jev-ui): complete iOS acceptance` (`node scripts/check-commits.mjs --title` → ok). Base: `main` at `4458fbf21e199dad45376b8164f78c2165ac1d20` (released `v3.1.0`). Head: `feat/jev-ios`. Only committed prose, code, tests, and receipts are pushed; native recordings, screenshots, and helper configuration stay local and ignored.

## Purpose

The released `jev-ui` controller drives browser and Android surfaces only; this adds the explicitly selected iOS simulator surface that was split out before the `v3.1.0` release, with the same identity, cleanup, and independent-observation guarantees.

## Acceptance criteria

- Fresh iOS-only verification on the exact branch revision with the real adapter and real JEV: same-launch Casey → Jordan replacement and installed standalone `Confirmed Name` ran on product revision `69c9c0c` through `idb` and model `jev-1.13.0`; receipts under ignored `evidence/native-safety-current-20260920T084236-2488/` (`02-verification-jev-ios.md` A1–A4).
- Generic confirmation, exact label-equal `Name`, and genuine Casey → Jordan replacement without relaunch, with statuses from independent non-input UI observations: replacement receipt observes `Confirmed Casey` then `Confirmed Jordan` under one PID `9661`; standalone observes `Confirmed Name` under PID `29301`; generic `Confirmed` under PID `13299` (A2–A4).
- Explicit device/app/PID identity, safe input replacement, truthful failed/blocked outcomes, owned cleanup, and evidence preserved for every run: receipts name the authorized UDID, `ai.typesafe.jevfixture`, `idb`, and one stable PID; a genuine `failed` receipt (`repair-cb7b53a/failed/`) and blocked receipts remain non-green; owned app, companion, recorder, and simulator were stopped after each run (A5–A6). **Exception:** two earlier historical recordings (the failed replacement attempt and the standalone PID 98075 run) were deleted by an avoidable worker command and are irrecoverable; the user explicitly accepted this loss and authorized continuation (`.agents/tasks/jev-ios/user-acceptance-preservation.md`). Nothing is claimed recovered.
- Installed standalone iOS execution with documented external drivers, credentials, helper command, and recording integration: a Codex runtime build ran `acceptance.mjs` with an external companion socket, plain `omp -p` text helper, and an absolute `record-evidence` command; `Confirmed Name`, PID `29301`, verified recording (A7).
- Aggregate tests, runtime packaging, and independent review with browser/Android intact: `npm test` 152/152; four runtime builds exit 0 (43 skills; Pi 0 workers); `18-code-review-jev-ios.md` approves with no critical or major findings (A8–A9). Browser and Android live acceptance were not repeated; their released regressions pass offline and no Android device or ADB server was touched.

## Special things to note

- Preservation is a user-accepted exception, not a pass: see the third criterion. All other failed, blocked, and passing receipts remain preserved; recordings stay local and ignored; nothing was uploaded.
- The chooser narrowing in `typesafe.mjs` also touches Android: `DONE` is withheld after an attempted text action while a `TAP` target exists and the expected status is not yet visible (a state in which `DONE` could only fail). Only the WAIT-after-text rule is iOS-scoped (`18-code-review-jev-ios.md` ADV-002).
- Active docs (`skills/delivery/jev-ui/SKILL.md`, `references/result-schema.md`, `docs/getting-started.md`, `.changeset/jev-ui-ios.md`) no longer say iOS acceptance "remains pending"; `baeb980` dropped that branch-preparation wording after review approval (`18-code-review-jev-ios.md` ADV-001).

## Change outline

Shared entry points dispatch on surface; the new adapter owns iOS invariants.

```text
skills/delivery/jev-ui/
  scripts/ios.mjs            new: normalizeHierarchy / observe / act over idb (UDID, app, PID identity; frame + focus revalidation; ASCII-only text)
  scripts/drivers.mjs        listTargets('ios') merges simctl + idb; selectTarget requires xcrun+idb, accepts 'booted', returns driver 'idb'
  scripts/acceptance.mjs     AUTHORIZED.ios; nativeAdapter(surface); iOS screenshot via simctl; stopNativeFixture verifies idb app state before/after terminate
  scripts/jev-ui.mjs         --platform ios; iOS adapter with verifyDevice; native snapshots sanitized for ios
  scripts/typesafe.mjs       attemptedTextTargets; iOS-only WAIT removal after text; DONE withheld until expected visible
  fixture/ios/               disposable UIKit fixture (Name field, Email/Phone, Confirm, Status) + install-authorized.sh (single authorized UDID)
tests/jev-ui-native.test.mjs, tests/jev-ui-controller.test.mjs   iOS identity, cleanup parsing, dispatch, chooser regressions
.changeset/jev-ui-ios.md     minor
```

TYPE_TEXT on iOS is an observe-tap-observe-type-observe sequence; every step can refuse.

```diff
 act(identity, snapshot, {operation:'TYPE_TEXT', target, text})
   reject: device/app/PID mismatch, unknown target, incompatible op, non-ASCII text
+  fresh = observe()            // target must still exist with same name and frame
+  tap(fresh.frame)
+  focused = observe()          // must be editable, focused, same PID, numeric frame
+  focused.value ? idb ui set-value --value text x y : idb ui text -- text
+  after = observe()            // after.value must equal text, else throw
```

Cleanup never trusts an empty or shapeless idb reply.

```diff
 stopNativeFixture('ios', udid)
+  running = idb list-apps --fetch-process-state --json  → appRunning()
+    no process-state key on any record → throw 'iOS app-state observation is unusable'
+    not running → {stopped, verified}
   xcrun simctl terminate udid ai.typesafe.jevfixture
+  exit≠0 → re-check running; still running → throw
```

Before reading the diff: `IDB_COMPANION` is mandatory and there is no default socket, so the controller can only act through a companion the caller started.

## Human Review

### Review targets

- `skills/delivery/jev-ui/scripts/ios.mjs` `act`: the three observations around text dispatch and the identity/PID checks between them.
- `skills/delivery/jev-ui/scripts/acceptance.mjs` `stopNativeFixture` / `appRunning`: what counts as a usable app-state observation.
- `skills/delivery/jev-ui/scripts/typesafe.mjs` operation filtering and its effect on Android choice sets.
- `.agents/tasks/jev-ios/user-acceptance-preservation.md` and `18-code-review-jev-ios.md`: the accepted exception and the review that declines CR-001 on it.

### Verify

- [ ] `npm test` exits 0 with 152 passing tests on the head commit.
- [ ] Hosted `Commits` check passes on this title and every subject in `main..HEAD` (`node scripts/check-commits.mjs origin/main..HEAD` → `ok: 45 subjects` locally).
- [ ] `.changeset/jev-ui-ios.md` is a `minor` bump for the new iOS surface.

### Known limits

- Two historical failed-run recordings are irrecoverable and are recorded as a user-accepted exception; they are not claimed preserved.
- Browser and Android live acceptance were not repeated on this branch; offline regressions and four runtime builds pass.
- Native recordings, screenshots, and helper configuration are local ignored evidence; nothing binary or credential-bearing is committed or uploaded.
