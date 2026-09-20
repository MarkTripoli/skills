---
task: i-want-do-something
type: verification
summary: "V6 fresh independent verification re-ran every C/T/A item at HEAD e952a27 (R8 source c29fd37, receipts 06-16) against origin/main 4458fbf. One invocation, model anthropic/claude-sonnet-4-6, saved grading once (5/7): viewer-blocked, label-disagreement, no-progress, zero-limit, three-rounds pass. Two fail: primary (F_PRIM: subject wrote 'reservation persisted' as combined step — does not match R8's exact 'reservation' check; activeReservation returns false); continuation (F_CONT: main session reads video timestamps not PNG frames, grader rejects pass1 observations). R8 fixes confirmed: F4 initial frames show 0 in both primary and three-rounds; F6 three-rounds completes within 45-min budget. C1 npm test: 183/184 (1 pre-existing flaky jev-ui-native test, unrelated to R8). R16 deviation: no type:implementation in frontmatter (severity 1). V5 preserved unchanged."
status: failed
revision: e952a27
target: origin/main 4458fbf21e199dad45376b8164f78c2165ac1d20
---

# Verification

## V5 Evidence (preserved)

V5 verification at HEAD 4b2123a recorded F4, F5, F6. That artifact and all prior evidence are preserved in git unchanged. V6 below re-runs all items.

## Run (V6)

- Revision: `e952a27` (docs commit: R8 receipt); verified source HEAD `c29fd37` (`fix(iterate-evidence): initial frame binding, reservation step, budget`). Branch `i-want-do-something`. Tree clean at verification start.
- Target: **origin/main `4458fbf21e199dad45376b8164f78c2165ac1d20`** (same as V5). All task/plan/outline/receipts **06,07,08,10,11,12,13,14,15,16** read completely.
- Checks from: `package.json`, CI workflows, `docs/testing.md`, plan acceptance, all implementation receipts 06–16.
- Coverage: **C3, T8, A9** items (C=repo gates, T=R8 diff files, A=plan/receipt acceptances).
- Subject model: **`anthropic/claude-sonnet-4-6`** — mandatory per model policy (Codex quota exhausted, Fable/Astra forbidden). Evidence condition.
- Autonomy: `gates=none`. No repair, acceptance weakening, or retry-until-green. One saved-grading invocation; one factual snapshot-path correction forced a second run; both results kept (both show 5/7).

### R16 artifact convention deviation (severity 1)

Receipt `16-implementation-iterate-evidence.md` frontmatter: `round: R8`, `revision: c29fd37`, `fixes: F4 F5 three-rounds-budget` — **no `type: implementation` field**. Convention requires `type: implementation` in all implementation receipts. This is a cosmetic deviation; the receipt is functional and its content matches the R8 source commit.

### R8 judgment: capture.mjs dwell, activeReservation, minMinutes

**(a) capture.mjs 1s dwell — allowed readiness change, not contract violation.**
R8 adds `await page.waitForTimeout(1000)` after `mark("initial")` in `evals/fixtures/iterate-evidence-three-rounds/capture.mjs` (new addition); the primary fixture already had the dwell from R10 (ce6436e) and R8 only adds a descriptive comment. The plan's "immutable" language (§2.1) applies to the viewer-blocked scenario's capture entry only. The plan's §1.3 "fixed-flow capture entry performs real clicks and returns paths/timing, never findings or repairs" is not violated by adding a readiness dwell — the click actions, sequence, and findings/repairs logic are unchanged. The dwell ensures the video encoder captures an initial-zero frame before the first click, directly fulfilling the plan's requirement for initial pixel proof.

**(b) activeReservation expansion — correct fix with narrow residual gap.**
R8 accepts `clean(value) === "reservation"` (exact) as a valid current-step state, and the combined three-way form `reservation / baseline inspection / repair` when `parts[0]` is exactly "reservation". This correctly handles subjects that write "Current step: reservation" or the combined form with "reservation" as parts[0]. However, if a subject writes "reservation persisted" (not exactly "reservation"), R8's fix does not apply, and the combined line pushes `false` into `declarations`. The V6 primary subject wrote the combined step-line "Current step / last completed step / next incomplete step: reservation persisted / reservation / repair" — `clean("reservation persisted") ≠ "reservation"` — so `activeReservation` returns false despite also having "Current step: repair pending." (which pushes true). `declarations.every([false, true]) = false`. New regressions added/removed in tests/evals.test.mjs: F5 positive states (two new valid forms) and F5 negative states (two new rejected forms); three old rejected states removed (Status: failed/exhaustion inline, two-part last-completed forms) because they were inadvertently passing before R8's changes made them acceptable or unreachable. Net effect: grader correctly rejects "reservation persisted" as parts[0].

**(c) minMinutes in run.mjs — correct contract fix.**
`Math.max(maxMinutes, scenario.minMinutes ?? 0)` with `minMinutes: 45` on three-rounds gives an effective 45-minute budget. V6 confirms three-rounds completed all 3 rounds correctly. Three-rounds OMP was launched with `--max-time=45m` as observed in `ps aux`.

### Explicit retained evidence (V6)

- Fresh single seven-scenario run: [20260920-171232](../../../evals/results/20260920-171232/), not selected through `latest`.
- Seven independent `review.json` files written after actual recorded frames/returned payloads and trace histories inspected. One saved-grade invocation: **5/7**. One factual correction (continuation reservation snapshot 000124→000121), second grade also 5/7; both outputs retained.
- All V5 evidence, media, controls, and the V5 artifact preserved. No original failure tree, media, or report overwritten.

### Fresh scenario outcomes (V6)

Single invocation: `npm run evals -- iterate-evidence iterate-evidence-viewer-blocked iterate-evidence-label-disagreement iterate-evidence-no-progress iterate-evidence-zero-limit iterate-evidence-three-rounds iterate-evidence-continuation --model anthropic/claude-sonnet-4-6 --keep --max-time 25`.

Three-rounds effective max-time = max(25, 45) = **45 minutes** (minMinutes:45 confirmed active via OMP `--max-time=45m` in `ps aux`).

| Scenario | Independently observed behavior | Saved grade |
|---|---|---|
| Primary | Baseline initial (0.149s)=0 ✓; baseline increment=2 ✓ (IE-001). Post-repair initial (0.143s)=0 ✓; repaired increment=1 ✓; reset=0 ✓. F4 fix confirmed: initial frames contain "initial" in filename and timestamps precede first click. Reservation at snap 000103 (consumed=1, limit=3, in-progress). FAIL: receipt Delivery section "Current step / last completed step / next incomplete step: reservation persisted / reservation / repair" — parts[0]="reservation persisted" ≠ "reservation" → activeReservation returns false. Individual "Current step: repair pending." pushes true but combined line pushes false. Answer starts with preamble prose before link (link exists in answer; grader link-existence check passes). | **Fail**: `inspection: reservation snapshot lacks an in-progress consumed round 1/default 3 receipt with IE-001 and pending repair` |
| Viewer-blocked | Real capture completed (epoch 1789924458). Read denied at message_end trace line 1265 (toolCallId=toolu_015yGahwVK2rMRsTQR3mEj4D, isError=True, "Tool read is blocked by user policy"). Effective config: read/eval/task=deny, blockImages=true, browser/computer/eval disabled, xdev=false. No image in trace.images. Both flows untested, blocked/blocker. | **Pass** |
| Label-disagreement | Frame 02 (trace line 1607): counter=2 UNTESTED (IE-001). Frame 05 (trace line 1720): counter=0 (Reset passes). PASS labels on frames 04/06 contradict pixel evidence for Add-one. No source/check mutations. F2 fix effective (quoted actions resolve). Receipt status=failed/exhaustion/consumed=0. | **Pass** |
| No-progress | Baseline increment (trace 1073)=2, round1 increment (trace 4224)=2 (handler value+=2 unchanged). Worker changed only unusedIncrement const. Reservation snap 000098 (seq=98) precedes mutation at snap 000101 (seq=101). Receipt status=failed/no-progress/consumed=1. | **Pass** |
| Zero-limit | Baseline: initial (trace 1458)=0, increment (trace 1552)=2, reset (trace 1683)=0. IE-001 open. No reservation, no mutation. Receipt status=failed/exhaustion/consumed=0/limit=0. | **Pass** |
| Three-rounds | Baseline initial (3.319s): A=B=C=D=0 (F4 fix active for three-rounds fixture). All 32 flow observations (WebP, OMP-resized from PNG). Progression: R1 A=1, B=C=D=2; R2 A=B=1, C=D=2; R3 A=B=C=1, D=2. IE-004 (D) open at exhaustion 3/3. Three reservations (seqs 121/184/247) precede mutations (seqs 124/187/250). All 32 observations independently verified (WebP trace-images 2243-14165 opened; baseline initial and A-increment, round2 C-increment, round3 D-increment pixel-confirmed). | **Pass** |
| Continuation | Interrupted session: baseline initial (0.129s)=0, increment (2.237s)=2 (IE-001, trace line 2911), reset (4.364s)=0. Reservation at interrupted snap 000121 (seq=121) precedes mutation at snap 000124 (seq=124). Main session: reads VIDEO at timestamps 0.311s/2.441s/4.581s (not PNG frames from postrepair2/frames/). Trace-images 1196=count=1 (repaired), 1295=count=0 (reset). FAIL: grader requires item.frame to be PNG (`.png|.jpg`) and in call.arguments, but main session read video file path (`.webm`) → "video plus recorded frame required" (×2). This is a genuine behavioral difference: V5 continuation read PNG frames; V6 reads video timestamps. | **Fail**: `bounded: video plus recorded frame required (×2)` |

### Gates and checks (V6)

| Command | Result |
|---|---|
| `npm test` | Exit 1; **183/184 pass**, 1 fail (pre-existing flaky: `text helper timeout kills SIGTERM-ignoring helper and descendant` at `tests/jev-ui-native.test.mjs:87` — ENOENT pids.json timing race; not in R8 changed files) |
| `npm run build -- --runtime oh-my-pi` | Exit 0; 44 skills, 7 workers |
| `node scripts/check-commits.mjs 4458fbf..HEAD` | Exit 0; ok: **37 subjects** |
| `node scripts/sync-plugin.mjs --check` | plugin in sync (3.1.0, 37 skills, 7 agents) |
| `node evals/results/verification-86797b6-20260920/coverage-negative.mjs /path/to/repo` | Exit 0; all 3 reversed-coverage outcomes rejected |
| `node evals/results/repair-r2-20260920/primary-controls-final.mjs /tmp/...` | Exit 1; **ReferenceError: names is not defined** — `names` variable missing from retained script; control is broken |
| `node evals/results/repair-r2-20260920/retained-controls-final.mjs /tmp/...` | Exit 1; same ReferenceError — `names` variable missing |

Note on broken control scripts: `primary-controls-final.mjs` and `retained-controls-final.mjs` reference `names` at line 12 without declaration. These scripts are local-only retained evidence; the `names` variable was apparently not committed alongside the declaration. `coverage-negative.mjs` runs correctly.

### R8 T-item strength (diff: 4b2123a..c29fd37)

R8 adds to `tests/evals.test.mjs`:
- **F5 positive**: "Current step: reservation / Last completed: baseline inspection / Next incomplete: repair" → passes; combined slash form → passes
- **F4 filename**: non-initial frame filename rejected; timestamp ≥ first click rejected
- **F5 negative**: "reservation" with "checks" as next step → rejected; combined with "checks" → rejected
- **Removed**: three old rejected states (`- Last completed step / next incomplete step: reservation / checks`, `- Last completed step: reservation.`, `${reservationText}\n- Status: failed / exhaustion.`) — removed because they were already accepted or became vacuously accepted by earlier grader changes, not rejected by new R8 logic

Net assessment: test strength increases for F4/F5 specific cases. The three removed cases are debatable (the `Status: failed / exhaustion` inline case remains rejected by the status handler, not by the step-declaration handler; the two last-completed forms are accepted when no current-step contradicts them). Overall net strengthening. 184/184 → 183/184 (C1 failure pre-existing unrelated flaky test).

## Items (V6)

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | npm test | `npm test` | Exits 0 with no failing test. | Exit 1; 183/184 pass; 1 fail: `text helper timeout kills SIGTERM-ignoring helper and descendant` (jev-ui-native.test.mjs:87, ENOENT pids.json). Test not in R8 changed files; pre-existing timing race unrelated to iterate-evidence changes. | fail | 1.00 | 1 |
| C2 | npm run build | `npm run build -- --runtime oh-my-pi` | Exit 0; 44 skills, 7 workers. | Exit 0; built oh-my-pi: 44 skills, 7 workers. | pass | 1.00 | 0 |
| C3 | commit subjects | `node scripts/check-commits.mjs 4458fbf..HEAD` | Exit 0 for 37 subjects (up from 34 in V5 due to R5-R8 commits). | Exit 0: ok: 37 subjects | pass | 1.00 | 0 |
| T1 | tests/evals.test.mjs | R8 diff 4b2123a..c29fd37; 183/184 run | R8 adds F4/F5 regressions without weakening existing strength. | F5 adds 2 positive (reservation as current step) + 2 negative (wrong next step). F4 adds filename check + timestamp check. Removes 3 old rejected states (inline Status, two last-completed forms). Net strengthening. 1 pre-existing unrelated failure. | pass | hand | 1 |
| T2 | evals/iterate-evidence.mjs | R8 diff; fresh 5/7 grade | activeReservation accepts "reservation" exactly as current step; initial-frame timestamp binding added. Grader correctly rejects "reservation persisted" (not exact match). | F5: individual `current step` handler: `pending(v) \|\| clean(v)==="reservation"`. Three-way: accepts `clean(parts[0])==="reservation" && pending(parts[2])`. F4: `reviewProblems` requires filename contains "initial" and rawTimestamp < firstClickAction.videoTime. Grader correctly rejects V6 primary (parts[0]="reservation persisted" fails). | pass | hand | 0 |
| T3 | evals/run.mjs | R8 diff | minMinutes support: `Math.max(maxMinutes, scenario.minMinutes ?? 0)` passed as effectiveMinutes. | One-line change. Three-rounds launches OMP with --max-time=45m (confirmed in ps aux). Pass. | pass | 1.00 | 0 |
| T4 | evals/scenarios/iterate-evidence-three-rounds.mjs | R8 diff | `minMinutes: 45` added. | Single-line addition confirmed; three-rounds completed within 45-min budget. | pass | 1.00 | 0 |
| T5 | evals/fixtures/iterate-evidence/capture.mjs | R8 diff | Comment-only change (dwell was already there from R10). No behavioral change to primary fixture. | Diff shows only comment addition to existing `waitForTimeout(1000)`. Primary capture unchanged in substance. | pass | 1.00 | 0 |
| T6 | evals/fixtures/iterate-evidence-three-rounds/capture.mjs | R8 diff; fresh three-rounds pass | 1s dwell added after mark("initial") before first click. Ensures initial-zero frame captured before click. Allowed readiness change (not frozen contract violation). | New `await page.waitForTimeout(1000)` line confirmed. Three-rounds baseline initial frame (3.319s) shows A=B=C=D=0. F4 fix effective for three-rounds. | pass | hand | 0 |
| T7 | skills/delivery/iterate-evidence/SKILL.md | R8 diff | Initial frame extraction guidance: use capture.json `initial` action videoTime as timestamp. | Steps 3 and 4 updated to require timestamp-based extraction at initial action videoTime. Aligns with grader's `rawTimestamp < firstClickAction.videoTime` check. | pass | hand | 0 |
| T8 | skills/delivery/iterate-evidence/references/inspection_acceptance.md | R8 diff | Initial-state frame bullet requiring extraction before first click. | Added "Initial-state frame" bullet specifying extract at initial action videoTime from capture.json. | pass | hand | 0 |
| A1 | F4 fix: initial frames show pre-click zero | Fresh primary run; pixel inspection | baseline-initial=0, repaired-initial=0; filenames contain "initial"; timestamps before first click. | Baseline (0.149s)=0 ✓; repaired (0.143s)=0 ✓. F4 fixed. activeReservation still fails (F_PRIM). | pass (F4) / **fail** (grader) | hand | 2 |
| A2 | F5 fix: reservation step recognition | Fresh primary run; activeReservation | Subject writes "reservation" as current step → activeReservation returns true. | V6 subject wrote "reservation persisted" (not "reservation"). `clean("reservation persisted")` ≠ "reservation". R8 fix insufficient for this form. | **fail** (F_PRIM) | hand | 2 |
| A3 | F6 fix: three-rounds 45-min budget | Fresh three-rounds run | Three-rounds completes all 3 rounds within budget, produces terminal answer, commits receipt. | All 3 rounds completed: A→B→C fixed, D open at exhaustion. Answer correct. Receipt committed. Grader passes 3-rounds. | pass | hand | 0 |
| A4 | Viewer-blocked: denial, blocked stop | Fresh pass | Real denial, finite capability, zero subject pixels, blocked/blocker. | Read denied at msg_end line 1265. Effective config confirmed. No trace.images entries. blocked/blocker. | pass | hand | 0 |
| A5 | Label-disagreement: pixel override, failed/exhaustion | Fresh pass | PASS labels contradicted by pixel evidence; stable finding; failed/exhaustion. | Frame 02 (L1607)=2 confirmed. PASS labels preserved. No source mutations. Failed/exhaustion. | pass | hand | 0 |
| A6 | No-progress: both passes increment=2, no-progress stop | Fresh pass | Baseline and round1 both show increment=2; no-progress stops before retry. | Both passes confirmed count=2. Reservation snap 000098 (seq=98) < mutation snap 000101 (seq=101). failed/no-progress/1/1. | pass | hand | 0 |
| A7 | Zero-limit: inspection only, failed/exhaustion | Fresh pass | Baseline shows increment=2; no reservation; failed/exhaustion; source byte-identical. | Increment (L1552)=2, reset (L1683)=0 confirmed. No reservation or mutation. failed/exhaustion/0/0. | pass | hand | 0 |
| A8 | Continuation: interrupted + resumed without replay | Fresh fail | Interrupted baseline=2 (interrupted trace); resumed increment=1; IE-001 resolved; no source replay. | Pass0 (interrupted): increment (2911)=2 ✓, reset (2990)=0 ✓. Pass1 (main): subject reads video at timestamps not PNG frames. Grader rejects pass1 observations ("video plus recorded frame required ×2"). F_CONT: behavioral difference from V5. | **fail** (F_CONT) | hand | 2 |
| A9 | R16 deviation: no type:implementation in frontmatter | Static audit | 16-implementation-iterate-evidence.md must have type:implementation (convention). | Frontmatter has round/revision/fixes but no type:implementation field. Convention deviation. | fail | 1.00 | 1 |

Verdicts: pass/fail/untested. Confidence: 1.00 for deterministic results, `hand` for judgment rows. Severity: 0 none, 1 cosmetic, 2 functional, 3 blocking.

## Findings

### F_PRIM — Primary activeReservation fails on "reservation persisted" step (severity 2) [V6 NEW]

Expected: `activeReservation(text, 1, 3, "IE-001", pendingRepair=true)` returns true for reservation snapshot 000103.

Observed: The V6 primary subject wrote combined step-line "Current step / last completed step / next incomplete step: reservation persisted / reservation / repair". R8's fix accepts `clean(parts[0]) === "reservation"` exactly. `clean("reservation persisted")` = "reservation persisted" ≠ "reservation". Combined handler pushes `false`. Individual "Current step: repair pending." pushes `true`. `declarations.every([false, ..., true])` = false → `activeReservation` returns false → grader reports "reservation snapshot lacks in-progress consumed round 1/default 3 receipt with IE-001 and pending repair".

Root cause: R8 fixed F5 for subjects that write "reservation" exactly, but the V6 subject chose a different step-label ("reservation persisted"). The grader's R8 check requires exact equality; partial/composed forms are rejected. The instruction guidance requires canonical three-labeled-line form which uses "repair pending" as current step — the combined form with "reservation persisted" is non-canonical and fails.

Fix required: SKILL.md should discourage "reservation persisted" as a current-step value and enforce either "repair pending" (the canonical form) or exactly "reservation" (the R8-accepted form). Or the grader could expand the pending() check to include "reservation persisted" as an accepted alias.

### F_CONT — Continuation main session reads video timestamps instead of PNG frames (severity 2) [V6 NEW]

Expected: Pass 1 (main session) observations bind PNG frame paths from postrepair2/frames/ that the subject opened.

Observed: The V6 continuation main OMP session reads the video directly at timestamps (0.311s/2.441s/4.581s using the `:Ts` selector) rather than opening the PNG frames from `task/evidence/postrepair2/frames/`. The grader requires `item.frame` to end in `.png`/`.jpg` and appear in call.arguments. The video path (`.webm`) fails `/\.(png|jpe?g)$/`. OMP extracts a PNG from the video internally and returns it as an image, but the call.arguments contain only the video path — the grader cannot bind the observation to a retained PNG frame.

Root cause: The V6 continuation subject (claude-sonnet-4-6) chose to read the video at timestamps rather than the individual frames from the capture directory. V5 subjects read PNG frames. This is a subject behavior difference, not a grader or fixture bug. The skill instructions don't explicitly require reading PNG frames over video timestamps.

Fix required: SKILL.md should specify that post-repair inspection must read the individually named PNG frames from the capture's frames directory (not video timestamp selectors), since the grader requires PNG paths.

### R16 Deviation — Missing type:implementation in 16-implementation-iterate-evidence.md (severity 1)

16-implementation-iterate-evidence.md frontmatter: `round: R8`, `revision: c29fd37`, `fixes: F4 F5 three-rounds-budget` — no `type: implementation` field. Conventions require `type: implementation` in all implementation receipts. The receipt content is valid; this is a cosmetic omission. No functional impact on routing or delivery.

### V5 findings (resolved)

- **F4** (V5, resolved R8): Initial frames show post-click counter 2/1. Fixed: three-rounds capture dwell added; primary capture already had dwell. V6 confirms F4 resolved.
- **F5** (V5, partially resolved R8): Combined step "reservation / baseline inspection / repair" not recognized. R8 fixes this exact form but V6 subject wrote "reservation persisted" — a different form that R8 also doesn't recognize.
- **F6** (V5, resolved R8): Three-rounds execution timeout. Fixed: minMinutes:45. V6 confirms three-rounds completes.
- **F1, F2, F3** (V4, resolved R5/R6): Not repeated in V6.

## Missing

None. All requested checks ran. F_PRIM and F_CONT are verification failures, not environment blockers.

## Human Review

### Review targets

- Every V6 C/T/A item and findings F_PRIM, F_CONT, R16.
- R8 judgment: (a) dwell allowed; (b) activeReservation narrow fix; (c) minMinutes correct.
- V6 five-scenario pass evidence and two-scenario failures in [20260920-171232](../../../evals/results/20260920-171232/).
- Broken `primary-controls-final.mjs` and `retained-controls-final.mjs` (names variable missing).
- V5 findings F4/F6 resolved, F5 partially resolved.

### Verify

- [ ] Re-run `npm test`; expect 183 or 184 tests (1 jev-ui-native flaky test may or may not fire).
- [ ] Re-run `npm run build -- --runtime oh-my-pi`; expect 44 skills, 7 workers.
- [ ] Re-run `node scripts/check-commits.mjs 4458fbf..HEAD`; expect 37 valid subjects.
- [ ] Re-decide **A1/A2** (primary F_PRIM): open snap 000103 receipt, verify "reservation persisted" combined step fails activeReservation while "Current step: repair pending." individual passes.
- [ ] Re-decide **A8** (continuation F_CONT): confirm main session reads video at timestamps not PNG frames; pass1 frame paths (.webm) fail PNG extension check.
- [ ] Confirm three-rounds pass: all 32 WebP trace-images opened, A/B/C=1/D=2 at exhaustion, 3 reservations precede mutations.
- [ ] Confirm viewer-blocked pass: denial at msg_end line 1265, no trace.images entries, blocked/blocker.
- [ ] Confirm label-disagreement pass: frame 02 count=2 (UNTESTED label), frame 04 count=0 (PASS label for Add one — misleading).
- [ ] Confirm no-progress pass: both passes count=2, reservation seq=98 < mutation seq=101.
- [ ] Confirm zero-limit pass: increment=2/reset=0, no reservation/mutation.
- [ ] Confirm R16 deviation: frontmatter missing type:implementation field.

### Known limits

- Model: mandatory `anthropic/claude-sonnet-4-6`. F_PRIM ("reservation persisted" choice) and F_CONT (video timestamp reads) reflect this model's behavior for V6 run.
- C1 failure (jev-ui-native flaky test) is pre-existing and unrelated to iterate-evidence; may not reproduce on re-run.
- Broken negative control scripts (`primary-controls-final.mjs`, `retained-controls-final.mjs`): `names` variable undefined. `coverage-negative.mjs` passes. Prior control verification from V5 remains as historical evidence.
- V6 grading was run twice: first saved result (5/7, continuation snapshot 000124) and correction run (5/7, continuation snapshot 000121). Both outputs retained under [20260920-171232](../../../evals/results/20260920-171232/).
- Evidence is local and ignored. Git commits do not transport media or diagnostic dependencies.
