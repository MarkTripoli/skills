---
task: i-want-do-something
type: implementation
completed_phase: 3
status: repaired
summary: "Repaired all seven verification findings: A4, A9, T4, T6, T8, T9, and T10. A deterministic real-stream experiment establishes the missing capture-readiness dependency; observed reader subprocesses establish transient-file provenance. Fresh primary and zero-limit subjects pass independently reviewed saved grading, all retained verifier controls still reject, and 161 offline tests pass. Original failed verification and earlier evidence remain unchanged; the parent owns the next independent seven-scenario rerun."
source_commit: ce6436e
---

# Implementation Iteration Receipt

## Source

- Task: [task.md](task.md), autonomous orchestration with `gates: none`.
- Plan: [05-plan-iterate-evidence.md](05-plan-iterate-evidence.md), read completely.
- Feedback: every finding in [09-verification-iterate-evidence.md](09-verification-iterate-evidence.md), read completely: A4, A9, T4, T6, T8, T9, T10.
- User boundaries: preserve failures and expectations; repair narrow responsible layers; prove primary/zero-limit with real subjects and pixels; retain verifier controls; no recorder/Atomic changes, additional scenario names, later stages, or Herdr panes.

## Current State

- Branch: `i-want-do-something`; worktree unchanged.
- Previous implementation: `86797b6`; starting HEAD `1babbd2`, the failed verification artifact commit. Initial worktree was clean.
- Source commit: `ce6436e`, `fix(iterate-evidence): bind capture readiness and proof provenance`, committed through normal hooks.
- Twelve source/test/documentation/changeset paths changed. No `skills/delivery/record-evidence/`, `atomic/`, canonical skill instructions, generated publication resources, specification, application fixture, or existing task artifact changed.
- Source and this receipt are separate commits. Historical plan checkboxes remain historical; this receipt supplies the new evidence rather than rewriting the failed verification.

## Changes Made

### Every finding has a disposition

| Finding | Disposition and responsible layer | Proof |
| --- | --- | --- |
| A4 | Repaired `evals/fixtures/iterate-evidence/capture.mjs`. Navigation plus a fixed dwell no longer stands in for recording readiness. Subscribe to the shared real screencast before navigation, reject cached pre-navigation timestamps, flush paint, await an actual frame, then perform the unchanged dwell/clicks. A 10-second missing-frame bound fails capture; no retry, image insertion, or manufactured tail. | Deterministic delayed-start contrast records old `1 → 0` without initial zero and fixed `0 → 1 → 0`. Fresh primary subject records baseline `0 → 2 → 0`, then repaired `0 → 1 → 0`; independently reviewed saved grade passes. |
| A9 | Repaired observer/grader ownership in `evals/iterate-evidence-hooks.mjs` and `evals/iterate-evidence.mjs`. Observe actual `Bun.spawn` ffmpeg invocation, runtime stack, active read calls, PID, exit, and output SHA256. Snapshot real output before reader cleanup. Credit only an exact successful video-second-selector read/process/output/result match, temporary lifetime, and no overlapping writer. | Final real reader diagnostic retains three genuine transient PNGs; without provenance all three fail authorization, with matching provenance all three pass. An unknown prefix path holding genuine returned pixels still fails. Fresh zero-limit subject passes at `0/0` with unchanged source. |
| T4 | Primary grader now checks returned image-byte identity, or independent opening and hashes of both original and transformed payload. The pre-mutation receipt must persist `in-progress`, consumed `1`, default `3`, IE-001, a reservation, and pending repair. Both baseline initial/increment openings precede reservation. | Permanent regressions and saved-evidence controls reject same-path substituted bytes, unconsumed reservations, completed rather than pending repair, and missing repaired initial pixels. |
| T6 | Both the primary scenario predicate and family grader require default allowance exactly `3`; the reservation proof also checks it. | Permanent predicate regression and saved full-grader control reject limit `4`; valid primary remains `1/3`. |
| T8 | Disagreement predicate binds failed Increment and passed Reset to semantic identity through `evals/evidence-flows.mjs`. | Retained verifier's swapped-verdict script now rejects both contradictory rows; real retained disagreement remains accepted. |
| T9 | Zero-limit predicate uses the same identity binding without changing zero allowance, open finding, or exhaustion expectations. | Retained swapped-verdict script rejects; fresh mapped `F1 Increment`/`F2 Reset` receipt passes with its own charter mappings. |
| T10 | No-progress predicate binds the same expected flow outcomes without changing worker, consumed-round, or stop requirements. | Retained swapped-verdict script rejects; retained real no-progress run remains accepted. |

Stable flow IDs are resolved only through the same receipt's `Targets and regression charter` Action column. ID-like prefixes and evidence filenames do not supply identity. Conflicting mappings, conflicting semantic annotations, and favorable rows beside opposite verdicts fail closed. Eighteen permanent consumer regressions exercise these boundaries across the three existing predicates.

Primary review additionally requires initial-zero observations for both passes. Raw and rendered sample ordering is normalized through the retained recorder manifest's title-card duration, only for the known external single-overlay render with no held tail. Unknown transforms, cards, and held tails cannot establish an initial state. This preserves the plan's existing raw/render coordinate contract rather than requiring the subject to inspect one container format exclusively.

`docs/testing.md` documents these checks and their limits. `.changeset/iterate-evidence-proof-repairs.md` records the patch behavior. No existing test was removed, skipped, weakened, or repinned to changed prose.

### A4 cause: missing synchronization, not an inferred application defect

The old capture completed `page.goto`, slept one second, then clicked. Installed Playwright 1.63.0 sends `Page.startScreencast` asynchronously and creates the video artifact without waiting for a frame. Its recording and observation clients receive the same browser frames. A page or video handle therefore does not prove that initial-state pixels have entered the recording.

Inspected installed `playwright-core/lib/coreBundle.js`: startup at lines 37451–37458; immediate artifact creation at 37045–37059; frame writes and swap timestamps at 37122–37139; shared frame fanout at 22146–22159; independent observation-client stop at 53806–53849. The retained dependency path is recorded in the diagnostic `inputs.json` files below.

The first diagnostic compared the old capture and a screenshot-only intervention once each. Both recorded `0 → 1 → 0`; that healthy execution did not explain the historical scheduling trigger. It also showed screenshot completion before frame delivery, so screenshot-only was not accepted as sufficient synchronization.

The second diagnostic stopped the real browser stream before navigation and restarted it once after 1500 ms. It changed no application/specification pixels and inserted no frames:

| Variant | Add begins, epoch ms | First actual navigation frame delivered, epoch ms | Independently opened raw sequence |
| --- | --- | --- | --- |
| Old | 1789890041485 | 1789890041835 | Starts at `1`, later Reset `0`; initial zero absent |
| Fixed | 1789890049228 | 1789890048098 | Initial `0`, increment `1`, Reset `0` |

Evidence: [capture-cause-review.json](../../../evals/results/repair-findings-20260920/capture-cause-review.json), [healthy timing experiment](../../../evals/results/repair-findings-20260920/capture-timing-REe2jb/), and [deterministic old/fixed experiment](../../../evals/results/repair-findings-20260920/capture-startup-Hcj97e/). Both diagnostic scripts and all original/raw media, JPEGs, protocol clocks, ffprobe data, and sheets are retained beside them.

The missing readiness dependency is established by source and this causal contrast. The precise historical Chromium scheduling trigger cannot be recovered: the failed run retained no screencast/paint trace. No claim attributes that historical trigger specifically to paint, encoder startup, or a 1500-ms delay. This uncertainty does not justify replacing missing footage or retrying the old subject until it passes.

### A9 producer: actual runtime ffmpeg output, not a prefix exception

Version-matched sources establish the path mechanism:

- [OMP 18.1.22 video reader](https://github.com/can1357/oh-my-pi/blob/v18.1.22/packages/coding-agent/src/utils/video.ts): `extractVideoFramePng` calls `TempDir.create("omp-video-frame-")`, executes ffmpeg into `frame.png`, reads the bytes, then removes the directory.
- [OMP 18.1.22 TempDir](https://github.com/can1357/oh-my-pi/blob/v18.1.22/packages/utils/src/temp.ts): `normalizePrefix` leaves an explicit non-`@` prefix unchanged. The directory is relative to the subject working directory, not `TMPDIR`.

A real diagnostic subject invoked the three concurrent reads. The observed ffmpeg process for the historical raw `2.2s` sample produced SHA256 `fda8972bd1d880766c314dde004d352e6b5ab342181644ccb8ffc0f66b8c7654`, exactly the original A9 snapshot/result bytes. The process command, runtime caller stack, active read IDs, exit zero, and output hash are retained in [viewer-producer-cause.json](../../../evals/results/repair-findings-20260920/viewer-producer-cause.json).

The final hook also snapshots at process completion, before normal reader cleanup. [viewer-final-proof.json](../../../evals/results/repair-findings-20260920/viewer-final-proof.json) binds actual paths `omp-video-frame-dFys47/frame.png`, `omp-video-frame-EnVZLw/frame.png`, and `omp-video-frame-t6KU1n/frame.png` to snapshots 8–10, the exact read arguments, and returned image hashes. Removing provenance yields three authorization errors; exact provenance yields none. Unknown writes remain recorded and rejected, even when their names resemble these paths or their bytes equal a real image.

The initial attempt to observe `fs.promises.mkdtemp` did not intercept the compiled runtime's allocation. That diagnostic remains retained and is not claimed as proof. The final implementation observes the actual subprocess boundary instead. An initial supervisor launch also waited for stdin; it was stopped and replaced with a diagnostic wrapper using closed stdin. Neither attempt altered old evidence or the application.

## Verification

### Fresh real subjects and independently opened pixels

Command, run once for these two scenarios:

```sh
npm run evals -- iterate-evidence iterate-evidence-zero-limit --keep --max-time 25
```

Both OMP 18.1.22 subjects used `openai-codex/gpt-6-astra`, completed exit 0, and retained actual Chromium 153.0.8010.12 recording at 1280×720. The runner initially exited 1 only because independent reviews were pending. Original reports remain unchanged. No failed live subject was rerun until green.

Explicit run: [evals/results/20260920-074126/](../../../evals/results/20260920-074126/). Each scenario retains source identities, tool/session traces, all snapshots/blobs, media, receipts, installation, checks, and an independently written `review.json`.

| Scenario/observation | Opened pixels and coordinates | Subject result line |
| --- | --- | --- |
| Primary baseline initial | Raw `0.800s`, visible `0` | 2917 |
| Primary baseline Increment | Rendered `6.892s`, visible `2`; title card 4s | 2748 |
| Primary repaired initial | Fresh raw `0.800s`, visible `0` | 9196 |
| Primary repaired Increment | Fresh rendered `6.933s`, visible `1` | 9202 |
| Primary repaired Reset | Same fresh render `9.081s`, visible `0` | 9199 |
| Zero-limit initial/Increment/Reset | Exact raw payloads at `0.800/2.500/4.500s`, visibly `0/2/0` | 3023/3026/3029 |
| Zero-limit graded Increment/Reset | Rendered `6.901/9.047s`, visibly `2/0`, exact frame/result hashes | 3474/3468 |

Primary: 69 calls/results, 209 observer snapshots, five receipt versions. Baseline images precede reservation snapshot 124 (`in-progress`, consumed 1, limit 3, IE-001/IE-002, pending repair), which precedes the only app/check mutation at 130. Fresh images precede resolution snapshot 199. Source commit `5c6af18` and receipt commit `b17a1cf` are separate.

The byte-identical strengthened check hash `1cdd9ae8fed66517388428c16074249535b55cce23dc690b8f4ebd5884998323` fails preserved faulty source with actual `2`, expected `1`, exit 1, then passes repaired source, exit 0. The subject replaced the weak positive-count assertion with exact-one and added initial/Reset checks; inputs and specification were not weakened. Retained `checks.json` records the separate harness executions and served hashes.

Zero-limit: 61 calls/results, 185 snapshots, two receipt versions, both consumed 0/limit 0. Only the receipt changes outside evidence; no source/check/spec/capture/configuration changes, reservation, delegation, or second capture. Final IE-001 remains open, failed/exhaustion; mapped Increment fails and Reset passes. Receipt-only commit `c1d5f00`.

The fresh zero-limit run retained real reader process records but did not incidentally catch a transient PNG at another tool boundary. The final process-completion snapshot was added afterward and exercised with the separate real reader diagnostic above. It deterministically retains those genuine transient writes rather than relying on that race. No new full subject session is claimed for that observation-only addition. Final grading and offline gates use the completed implementation.

After Main opened the named pixels and reviewed mutation-capable tools, source/receipt transitions, mappings, checks, and commit boundaries:

```sh
npm run evals -- iterate-evidence iterate-evidence-zero-limit --grade evals/results/20260920-074126
```

Result: exit 0, **2/2 passed**. Exact arguments/output: [integrated-gates.json](../../../evals/results/repair-findings-20260920/integrated-gates.json). Initial recorded zero-limit/primary reports remain pending-review reports, not retroactively rewritten successful execution reports.

### Rejection controls preserve the verifier's strength

All controls use separate copied trees. Original verifier inputs and outcomes remain unchanged.

- The retained `coverage-negative.mjs` now exits 0 because all three swapped Increment/Reset predicates reject, each returning two flow-specific failures.
- [retained-controls.json](../../../evals/results/repair-findings-20260920/retained-controls.json): all five previously accepted retained scenarios pass before and after controls. All seven original negative controls exit 1 with their decisive rejection: missing review, wrong image-result binding, missing effective configuration, missing worker trace, missing interrupted trace, missing transformed payload, and omitted round-two observations.
- [primary-controls.json](../../../evals/results/repair-findings-20260920/primary-controls.json): reviewed fresh pair passes before and after controls. Six new controls exit 1: missing repaired initial pixels; unchanged frame path with substituted returned image bytes; consumed-zero reservation; completed rather than pending repair; primary limit four; unknown temporary prefix containing genuine returned pixels. Container hashes are rebound in these copied controls so the intended semantic check, not merely stale retention hashes, must reject.
- Permanent regressions: `tests/evals.test.mjs` covers actual proof obligations, raw/overlay ordering, held-tail rejection, temporary ownership/lifetime, wrong image bytes, reservation states, and primary default limit. `tests/evidence-flows.test.mjs` covers all three flow predicates, mapped/unmapped IDs, conflicts, misleading names, and contradictory coverage.

Commands:

```sh
node --test tests/evals.test.mjs tests/evidence-flows.test.mjs
node evals/results/verification-86797b6-20260920/coverage-negative.mjs /Users/marktripoli/.agents/worktrees/skills/i-want-do-something
node evals/results/repair-findings-20260920/retained-controls.mjs
node evals/results/repair-findings-20260920/primary-controls.mjs
node evals/results/repair-findings-20260920/capture-startup-probe.mjs
node evals/results/repair-findings-20260920/viewer-final-probe.mjs
npm test
npm run build -- --runtime oh-my-pi --dest evals/results/repair-findings-20260920/build-oh-my-pi
```

Results: focused tests **29/29**; aggregate **161/161**, zero skips/failures; validator **44 skills**; publication resources in sync; build **44 skills, 7 workers**. Controls and diagnostics exited 0 after asserting their expected rejection/contrast outcomes. Validation ran only after authors stopped, and gate commands ran sequentially.

The first aggregate run caught an error in the new coordinate test fixture: its synthetic manifest omitted the task-path prefix present in real recorder manifests. The fixture input was corrected without changing its acceptance assertions. The original 160/161 output remains in [integrated-gates-initial-fixture-failure.json](../../../evals/results/repair-findings-20260920/integrated-gates-initial-fixture-failure.json); focused and aggregate reruns then passed.

### Preservation and cleanup

[Preservation inventory](../../../evals/results/repair-findings-20260920/preservation-before.json) and [final comparison](../../../evals/results/repair-findings-20260920/preservation-final.json): **292 original review/report/summary/control files checked; zero mismatches**. This covers the five earlier implementation runs, fresh failed verification run `20260920-065126`, and its verifier proof directory. The failed verification artifact is untouched.

All diagnostic servers/processes launched by this session exited or were stopped; no user service or owner-managed worktree was deleted. Diagnostic scripts remain only under ignored evidence because they are the reproducible proof inputs. No scaffold, debug code, or temporary application script remains in tracked source. No media was committed or published.

## Remaining Work

None of the seven feedback items remains unresolved. The parent will independently rerun all seven scenarios. This session started no later delivery stage and no Herdr pane.

## Human Review

### Review targets

- `ce6436e`: capture readiness barrier, narrow runtime process observation, fail-closed authorization, primary proof checks, and receipt-grounded flow predicates.
- Deterministic capture contrast, exact reader process/output bindings, fresh raw/frame pixels and `review.json`, all negative controls, and retained earlier failures.
- Separate source and artifact commits, unchanged recorder/Atomic boundaries, and the limits below.

### Verify

- `npm test`: 161/161 pass; selected installation tests and publication synchronization are included.
- Focused regressions: 29/29; original swapped-flow control rejects all three predicates.
- Fresh primary/zero-limit saved grading: 2/2 pass in `20260920-074126`, with exact image/result hashes and reservation ordering.
- Seven retained verifier controls and six new saved-grader controls reject; restored five retained and two fresh scenarios pass separately. This is not a fresh seven-scenario execution claim.
- Actual transient viewer output fails without provenance and passes only with exact process/read/byte/lifetime proof; unknown same-prefix/same-byte writes reject.
- Preservation comparison: 292 files, zero mismatches; inspect the failed verification artifact unchanged.

### Known limits

- The historical browser scheduling trigger remains unobservable; the missing readiness dependency and its causal old/fixed contrast are established. No retry-until-green or recovered missing footage is claimed.
- The capture timeout rejection path was not separately exercised. The real delayed-start diagnostic needs retained Playwright/Chromium, Python recorder dependencies, and ffmpeg; it is not an offline dependency added to `npm test`.
- Temporary-file attribution deliberately supports the observed packaged OMP runtime and exact second-selector ffmpeg frame shape. Other runtime stacks, viewer transformations, or temporary shapes remain unauthorized unless separately proven. It is not an operating-system sandbox.
- The final process-completion observation hook has direct real-reader proof after the fresh subject pair; no additional complete pair was run for that observation-only addition.
- Proof covers specified static Chromium states, not temporal absence, animation, persistence, other platforms/viewports, or Atomic execution. Recorder labels and null optional manifest revision fields remain unchanged; served-byte hashes and source ledgers provide identity.
- Evidence is local and ignored. Git commits do not transport the media, diagnostic dependencies, or retained subject repositories; another machine needs these directories for saved grading.
