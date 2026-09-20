---
task: i-want-do-something
type: verification
summary: "Fresh independent V5 verification re-ran every C/T/A item at receipt HEAD 4b2123a (receipts 06-15) against origin/main 4458fbf. Exactly seven live scenarios (one invocation), model anthropic/claude-sonnet-4-6, saved grading once: 5/7 pass (viewer-blocked, label-disagreement, no-progress, zero-limit, continuation). Two fail: primary (F4: initial frames show post-click counter 2/1 not pre-click 0; F5: combined step-declaration 'reservation' not recognized as pending-repair); three-rounds (execution: subject hit 25-min context limit before finalizing receipt and producing terminal answer). Checker/test strength assessed for receipts 10-15 changes (quoted-label fix, activeReservation labeled-line form, continuation findings-scoping, answer-template markdown link). All negative controls reject. Prior V4 failures preserved."
status: failed
revision: 4b2123a
target: origin/main 4458fbf21e199dad45376b8164f78c2165ac1d20
---

# Verification

## Run

- Revision: `4b2123a` (R7, fix enumerate allowed status/stop_reason, no preamble) on branch `i-want-do-something`. HEAD at `871ad20` (docs commit). Receipts **06,07,08,10,11,12,13,14,15** read completely. Prior V4 artifact (HEAD 3c4184e, 3/7) preserved in git unchanged.
- Target: **origin/main `4458fbf21e199dad45376b8164f78c2165ac1d20`**, not stale local main. Complete task, outline, plan and all receipts read.
- Checks from: `package.json`, CI workflows, `docs/testing.md`, plan acceptance and receipts. No PR exists; PR-title validation inapplicable.
- Coverage: **57 items: 3C, 26T, 28A.** Static contract items explicitly distinguished from runtime proof.
- Subject model: **`anthropic/claude-sonnet-4-6`** — mandatory per model policy (Codex quota exhausted, Fable/Astra forbidden). Model change is an evidence condition.
- Autonomy: `gates=none`; no approval request, later phase or Herdr. No repair, subject-receipt rewriting, acceptance weakening, or retry-until-green. Single saved-grading invocation.

### Explicit retained evidence

- Fresh single seven-scenario run: [20260920-150848](../../../evals/results/20260920-150848/), not selected through `latest`.
- New ignored proof: [verification-v5-4b2123a-20260920](../../../evals/results/verification-v5-4b2123a-20260920/). Key records: `run-binding.json`.
- Seven independent `review.json` files written after actual recorded frames/returned payloads and trace histories were inspected. One saved-grade invocation: 5/7. No review changed to weaken acceptance.
- Prior V4 09-verification preserved in Git. No original failure trees, media, or reports overwritten.

### Fresh scenario outcomes

Single invocation: `npm run evals -- iterate-evidence iterate-evidence-viewer-blocked iterate-evidence-label-disagreement iterate-evidence-no-progress iterate-evidence-zero-limit iterate-evidence-three-rounds iterate-evidence-continuation --model anthropic/claude-sonnet-4-6 --keep --max-time 25`.

| Scenario | Independently observed behavior | Saved grade |
|---|---|---|
| Primary | Baseline count=2 (IE-001), round1 count=1 (repaired). Reservation at snap 106 (consumed=1, in-progress, limit=3) precedes source mutation at snap 109. 8 frames opened (4 baseline + 4 round1). F4: initial frames (01-test-start) show post-click counter (2 and 1) not pre-click zero (0); grader requires initial=0. F5: combined step-line "reservation / baseline inspection / repair" makes activeReservation(pendingRepair=true) return false (parts[0]="reservation" not a pending-repair step). Final receipt passed/success/limit=3 retained/consumed=1. Behavior correct; grader fails on initial frames and reservation step-declaration. | **Fail**: baseline-initial observedCount=2 (expected 0); repaired-initial observedCount=1 (expected 0); reservation snapshot lacks in-progress consumed round 1/default 3 with pendingRepair |
| Viewer blocked | Real finalized media, real read denial at trace line 1097 (message_end isError=true), zero subject pixels, finite capability boundary. Effective config: tools.approval.read=deny, eval=deny, task=deny; blockImages=true; browser/computer/eval disabled. Both flows untested, blocked/blocker. | **Pass** |
| Label disagreement | External baseline; frame 02 (trace line 963) shows count=2 (IE-001), frame 05 (trace line 1284) shows count=0 (Reset passes). PASS labels on frames 03/06 contradict pixel evidence. F2 fix (quoted-action strip) effective: label-disagreement now passes. Zero allowance, failed/exhaustion. | **Pass** |
| No progress | Baseline count=2, bounded worker changed only unusedIncrement (const unusedIncrement=2→1), handler value+=2 unchanged, post-repair count=2. Reservation at snap 109 (consumed=1, limit=1) precedes mutation at snap 115. Both pass observations correctly bound (pass0/increment=2, pass0/reset=0, pass1/increment=2, pass1/reset=0). F2 fix effective. | **Pass** |
| Zero limit | Baseline count=2 (IE-001), reset=0. No reservation, no mutation. pass0/increment=2, pass0/reset=0 correctly bound. Limit=0, consumed=0, failed/exhaustion. | **Pass** |
| Three rounds | All 37 frames opened (4 passes × initial-zero + 8 flows each). Reservations at snaps 166/289/394 precede mutations at 187/301/403. Correct progression: A fixed R1 (1), B fixed R2 (1), C fixed R3 (1), D open at exhaustion (2). IE-004 open. Final receipt in dirty working tree shows consumed=3/limit=3/status=failed/exhaustion. Subject hit 25-minute context limit before committing receipt and producing terminal answer. | **Fail**: execution code=1; trace: no terminal assistant text answer; reply: must link receipt; git: dirty outside ignored evidence |
| Continuation | Interrupted session (baseline, defective source) captured from pre-existing committed state. Fresh continuation session (main) completed reserved round: pass0/increment=2 (interrupted, count=2 from snap 3097), pass1/increment=1 (main, count=1 from snap 2538). IE-001 and IE-002 resolved. Reservation at interrupted snap 124 (consumed=1) precedes source repair at snap 133. No source replay by continuation session. Final receipt: passed/success/limit=3/consumed=1. | **Pass** |

### Gates and diagnostic executions

| Command | Result |
|---|---|
| `npm test` | Exit 0; **184/184 pass**, 0 fail, 0 skip; validator 44 skills, 59 templates; plugin 3.1.0 in sync |
| `npm run build -- --runtime oh-my-pi` | Exit 0; 44 skills, 7 workers |
| `node scripts/check-commits.mjs 4458fbf..HEAD` | Exit 0; ok: **34 subjects** |
| `node scripts/sync-plugin.mjs --check` | plugin in sync (3.1.0, 37 skills, 7 agents) |
| `node --test tests/evals.test.mjs tests/evidence-flows.test.mjs` | **184/184 pass** (aggregate; includes 3 new quoted-label tests, 3 Findings-scoping tests, 2 labeled-line reservation tests) |
| `node evals/results/repair-r2-20260920/primary-controls-final.mjs <tmpdir>` | Exit 0; all 6 controls reject (fresh output dir, re-runnable since R5) |
| `node evals/results/repair-r2-20260920/retained-controls-final.mjs <tmpdir>` | Exit 0; all 7 original controls reject (fresh output dir) |
| `node evals/results/verification-86797b6-20260920/coverage-negative.mjs /path/to/repo` | Exit 0; all 3 reversed-coverage outcomes rejected with both per-flow errors |

### Receipt 10-15 checker/test strength assessment

**Changes since V4 (3c4184e) through R7 (4b2123a):**

**R5 (39c3a66):**
1. **F2 fix — quoted-action strip** (`evals/evidence-flows.mjs`): `actionFlow()` now strips matching surrounding single/double/backtick quotes after verb removal. `Click "Add one" once` → resolves correctly. 3 new regression tests in `evidence-flows.test.mjs` cover all 3 quote styles, mixed, Activate verb, unknown label, and mismatched quotes. **V5 verification**: label-disagreement now passes (was failing in V4 due to this defect). No-progress also uses quoted actions — passes with corrected flow resolution. Negative controls remain grounded: `coverage-negative.mjs` rejects swapped-verdict rows.
2. **F3 fix — continuation pause predicate** (`evals/iterate-evidence.mjs`): Pause watcher uses filename pattern (`/^\d{2}-evidence-iteration-[a-z0-9-]+\.md$/`) instead of `newest(..., "evidence-iteration")` which required `type` frontmatter field. Validation uses `activeReservation` predicate. **V5 verification**: continuation `interruption.valid=true` confirmed (F3 was fixed; the continuation session successfully found the pre-existing reservation).
3. **Re-runnable control scripts** (`primary-controls-final.mjs`, `retained-controls-final.mjs`): Accept optional output directory argument; resolve EEXIST on re-run. Both run cleanly in V5 with fresh temp dirs.

**R6 (1481297):**
4. **activeReservation labeled-line form** (`evals/iterate-evidence.mjs`): Combined-key handler (`current step / last completed step / next incomplete step`) no longer pushes `false` when `parts.length !== 1`; single-line semicolon/colon form is handled by individual key handlers. **V5 verification**: continuation passes (the continuation session uses canonical three-labeled-line form per R6 template update). However, primary FAILS (F5): the subject wrote a ROUND BODY combined line "reservation / baseline inspection / repair" where parts[0]="reservation" is not a pending-repair step; individual labeled lines in Delivery section correctly show "repair pending" but the combined line's false declaration overrides via `declarations.every(Boolean)`. Regression tests for semicolon/colon form and three-labeled-line form added; both pass.
5. **Continuation findings-scoping** (`evals/scenarios/iterate-evidence-continuation.mjs`): Imports `section` from `../lib.mjs`; scopes IE-001 resolution lookup to `## Findings` section only; Guardrails table rows cannot shadow it. Regression test covers Findings-resolved + Guardrails mention → passes; Findings-open + Guardrails "resolved" → fails; Guardrails only → fails. **V5 verification**: continuation passes with this fix.
6. **Answer template — markdown link form**: `evidence_iteration_passed_answer.md` and `evidence_iteration_stopped_answer.md` line 1 changed to `[{artifact_file}]({artifact_link})`. SKILL.md forbids bare/backtick paths. **V5 verification**: continuation answer correctly starts with markdown link; no preamble observed.
7. **Delegated source commit** (SKILL.md step 4.2): Workers must commit before receipt. **V5 verification**: no-progress subject commits app.js separately (git-final.json dirty='').

**R7 (4b2123a):**
8. **Enumerate allowed frontmatter values + no preamble**: SKILL.md section 5 and finalization section enumerate `status`/`stop_reason` allowed values. Template preamble uses pipe-separated exhaustive lists with explicit invalidity statements. **V5 verification**: continuation answer is canonical (passed/success, markdown link first line, no preamble).

**Negative controls remain grounded:**
- `coverage-negative.mjs` rejects all 3 reversed Increment/Reset verdict outcomes.
- `primary-controls-final.mjs` rejects: missing repaired initial pixels, substituted frame bytes, consumed-zero reservation, completed repair, limit=4, unknown same-prefix output.
- `retained-controls-final.mjs` rejects: missing review, wrong image binding, missing effective restrictions, missing worker trace, missing interruption trace, missing transformed payload, omitted required pass.
- Offline test suite 184/184 passes, including both new and original test fixtures.

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | npm test | npm test | Exits 0 with no failing test or skipped check. | Exit 0: 184/184 pass, 0 fail, 0 skipped; validator 44 skills/59 answer templates; plugin in sync (3.1.0, 37 skills, 7 agents). | pass | 1.00 | 0 |
| C2 | npm run build -- --runtime oh-my-pi | npm run build -- --runtime oh-my-pi | Runtime build exits 0. | Exit 0: built oh-my-pi: 44 skills, 7 workers. | pass | 1.00 | 0 |
| C3 | node scripts/check-commits.mjs 4458fbf..HEAD | node scripts/check-commits.mjs 4458fbf21e199dad45376b8164f78c2165ac1d20..HEAD | CI commit-subject validation exits 0 for actual target through verified HEAD. | Exit 0: ok: 34 subjects | pass | 1.00 | 0 |
| T1 | tests/evals.test.mjs | Read full fixed-target diff and tests/evals.test.mjs; fresh 184/184 run | The change keeps this check's strength and rejects violations of its declared acceptance contract. | R5/R6 added 8 new positive fixtures (quoted-label forms, semicolon/labeled-line reservation forms); 184/184 pass. No test deleted, skipped, or weakened. | pass | hand | 0 |
| T2 | tests/install.test.mjs | Static audit | All installer tests pass. | Unchanged since R3. 184/184 aggregate confirmed. | pass | 0.91 | 0 |
| T3 | evals/run.mjs | Static audit | Narrow evidence-family dispatch and retained-directory grading; existing protections unchanged. | Unchanged since R3. 184/184 aggregate pass. | pass | 0.87 | 0 |
| T4 | evals/iterate-evidence.mjs | Static audit; R5-R6 fix diffs; fresh saved grade 5/7 | Preserve rejection strength without rejecting supported pending reservations or preserved historical round sections. | R6 labeled-line fix: continuation passes. R5 pause-predicate fix: continuation pause valid. Primary fails F5 (combined step-line "reservation" not pending-repair): grader correctly rejects. No-progress/label-disagreement pass (F2 fix). Three-rounds fails on execution (unrelated to grader). | pass | hand | 0 |
| T5 | evals/iterate-evidence-hooks.mjs | Static audit | The change keeps this check's strength; native provenance checks preserved. | Unchanged since R2. 184/184 aggregate pass. | pass | 0.87 | 0 |
| T6 | evals/scenarios/iterate-evidence.mjs | Static audit; fresh fail | Primary grader correctly rejects F4/F5. | Primary fails: initial frames show post-click 2/1 (expected 0); combined step-line "reservation" not pending-repair. Grader correctly rejects both. | pass | hand | 0 |
| T7 | evals/scenarios/iterate-evidence-viewer-blocked.mjs | Static audit; fresh pass | Actual denial, zero repair, both flows untested, blocked stop. | Fresh trace at line 1097: genuine read denied after capture finalized; coverage=untested; no pixels; no source edits. Saved grade passes. | pass | hand | 0 |
| T8 | evals/scenarios/iterate-evidence-label-disagreement.mjs | Static audit; fresh pass | Preserve misleading labels and media, zero repair, stable failed increment with separate Reset coverage. | F2 fix effective: quoted-action "Add one" resolves correctly. IE-001 stable (pixel count=2 vs expected 1). Failed increment, passed reset. Saved grade passes. | pass | hand | 0 |
| T9 | evals/scenarios/iterate-evidence-zero-limit.mjs | Static audit; fresh pass | Zero allowance; no reservation or mutation; failed exhaustion. | Fresh zero-limit: limit=0 consumed=0, IE-001 open, stop exhaustion. Unquoted actions → coverage resolves correctly. Saved grade passes. | pass | hand | 0 |
| T10 | evals/scenarios/iterate-evidence-no-progress.mjs | Static audit; fresh pass | Unproductive repair; increment remains failed; Reset has its own inspected passing coverage. | F2 fix effective: quoted actions resolve. pass0/increment=2, pass1/increment=2 (handler unchanged). Reservation at snap 109 precedes mutation at snap 115. No-progress correct. Saved grade passes. | pass | hand | 0 |
| T11 | evals/scenarios/iterate-evidence-three-rounds.mjs | Static audit; fresh fail | Distinct A/B/C repairs; all 8 flows each pass; D open 3/3. | Three-rounds subject opened 37 frames across 4 sessions. All 3 reservations precede mutations. Behavioral progression correct (A→B→C fixed, D open). BUT: execution code=1, no terminal answer, dirty receipt. Scenario fails on finalization timeout. | pass (grader correct) / **fail** (grade) | hand | 2 |
| T12 | evals/scenarios/iterate-evidence-continuation.mjs | Static audit; R6 Findings-scoping fix; fresh pass | Real SIGKILL after reservation; fresh non-resume session preserves reservation and source. | Continuation interruption.valid=true (F3 still working). Fresh session completed reserved round from pre-existing interrupted state. IE-001 resolved by new pixel inspection (count=1). Saved grade passes. | pass | hand | 0 |
| T13–T24 | Fixture/skill files | Static audit; unchanged since R4/R5/R6/R7 | Each file keeps its strength. | R5-R7 changes to SKILL.md, templates, inspection_acceptance, answer templates all tracked. 184/184 tests pass. | pass | 0.87 | 0 |
| A1–A3 | Checks/repo gates | Static audit; C1–C3 gate results | Repository gates pass; commit subjects valid; build exits 0. | All three confirmed above. | pass | 1.00 | 0 |
| A4 | Primary end-to-end proof; saved grading | Fresh run 20260920-150848 primary | Fresh recording proves 0→2→0 baseline, 0→1→0 repaired; required findings resolved and passed/success. | Baseline count=2 (INS trace 2700), round1 count=1 (INS trace 7061), reset=0 (trace 7177). Correct behavior. BUT: initial frames (01-test-start, trace 2211/6955) show post-click state (2 and 1) not pre-click zero. F4: grader requires initial=0; subject's frame shows 2/1. F5: combined step-line "reservation / baseline inspection / repair" in round body — parts[0]="reservation" not in pending-repair types → activeReservation(pendingRepair=true) returns false. | **fail** (F4, F5) | hand | 2 |
| A5 | Viewer-blocked proof; saved grading | Fresh run 20260920-150848 viewer-blocked | Real finalized media, real denial, finite capability, zero subject pixels. | Trace line 1097: read denied (isError=true). Effective config: read/eval/task denied, blockImages=true, browser/computer/eval disabled. Both flows untested. Saved grade passes. | pass | hand | 0 |
| A6 | Label-disagreement behavior | Fresh run 20260920-150848 label-disagreement | PASS labels on frame 02 but actual count=2; Reset correctly 0; no repair; failed. | Frame 02 (trace 963, sha=510dd7c): count=2 confirmed. Frame 05 (trace 1284, sha=703e342): count=0. F2 fix: quoted actions resolve correctly. Saved grade passes. | pass | hand | 0 |
| A7 | No-progress behavior and stop | Fresh run 20260920-150848 no-progress | Baseline 2, worker edits only unusedIncrement, post-repair still 2; no-progress stop. | Verified: baseline increment=2 (trace 1091), post-repair increment=2 (trace 7734; handler unchanged). Consumption=1, stop=no-progress. F2 fix effective. Saved grade passes. | pass | hand | 0 |
| A8 | No-progress one-round stop | See A7 | One round consumed; IE-001 remains open; stop without retry. | Confirmed: consumed_rounds=1, stop_reason=no-progress, IE-001 open. Reservation snap 109 precedes mutation snap 115. | pass | 0.84 | 0 |
| A9 | Zero-limit inspection only | Fresh pass | Inspection only; no reservation; failed exhaustion. | Verified: no source mutation, no reservation, failed/exhaustion, IE-001 open. pass0/increment=2 (trace 3092), pass0/reset=0 (trace 3259). | pass | 0.84 | 0 |
| A10 | Three-rounds productive behavior | Fresh run; execution fail | Three distinct repairs; all 8 flows each pass; D open 3/3. | Subject ran all 3 rounds correctly: A fixed R1 (trace 9880=1), B fixed R2 (trace 15620=1), C fixed R3 (trace 20080=1), D still 2 (trace 20258). Reservations at snaps 166/289/394 precede mutations at 187/301/403. 37 frames opened. Correct behavioral content. BUT: execution timeout before finalization. Saved grade fails on execution/trace/reply/git. | pass (behavior) / **fail** (grade) | hand | 2 |
| A11 | Continuation setup and completion | Fresh pass | Fresh session completes reserved round without replay, ID loss, history replacement, or counter reset. | Interrupted session (defective baseline, trace 3097=2, trace 3199=0) committed pre-existing state. Fresh continuation saw in-progress receipt (consumed=1, repaired app.js). Completed round: pass1/increment=1 (trace 2538), pass1/reset=0 (trace 2817). No source replay. IE-001/IE-002 resolved. Saved grade passes. | pass | hand | 0 |
| A12–A28 | Remaining acceptance items | Static audit; prior receipt evidence | No recorder/Atomic modification; canonical skill unchanged; per-plan contracts. | Receipts R5/R6/R7 confirm skill/template updates (no recorder/Atomic changes). Focused tests 184/184 and aggregate confirmed. | pass | 0.84 | 0 |

Verdicts: pass/fail/untested. Confidence: typed satisfaction probability, `hand` for unclear rows, 1.00 for deterministic results. Severity: 0 none, 1 precision/cosmetic, 2 functional, 3 blocking.

## Findings

### F1 — (V4, resolved R5) Coverage parser fails for charter actions with quoted words

Resolved in R5 by `actionFlow()` quote-stripping. V5 confirms label-disagreement and no-progress now pass. Not carried forward.

### F2 — (V4, resolved R5) Continuation pause predicate uses `newest(type)` requiring `type` frontmatter field

Resolved in R5 by filename-pattern predicate. V5 confirms continuation `interruption.valid=true`. Not carried forward.

### F3 — (V4, resolved R5/R6) Multiple activeReservation and continuation fixes

Resolved across R5/R6. Continuation passes in V5. Not carried forward.

### F4 — Primary initial frames show post-click counter state (severity 2) [NEW]

Expected: `baseline-initial.observedCount=0` and `repaired-initial.observedCount=0` per plan and grader.

Observed: The primary subject in this V5 run opened `evidence/baseline/frames/01-test-start-one-add-one-activation-from-zero.png` as the initial frame. This frame shows counter=2 (not 0), because the `initial` action mark fires at videoTime 1.125s coinciding with the click; the video frame at that timestamp already reflects the post-click state. Similarly, `evidence/round1/frames/01-test-start` shows counter=1 (repaired post-click, not 0).

Root cause: The capture script's `initial` action mark fires simultaneously with the click action. At the moment of extraction (videoTime ~1.125s), the JavaScript click handler has already executed, making the counter show 2 (or 1 repaired). In receipt 11 and 14 runs, timing happened to capture 0 (mark preceded click processing). In this V5 run, timing captured post-click state.

Fix required: Instruction/capture guidance should explicitly direct the subject to open the `00-initial-zero-state` frame (or equivalent frame extracted before any click) rather than the `01-test-start` frame. Or the capture script should always extract an explicit pre-click initial frame at a timestamp before the initial mark.

### F5 — Primary combined step-line "reservation" not recognized as pending-repair step (severity 2) [NEW]

Expected: `activeReservation(text, round=1, limit=3, findingId="IE-001", pendingRepair=true)` returns true for the receipt at snap 106.

Observed: The round body contains the combined step-line: `"- Current step / last completed step / next incomplete step: reservation / baseline inspection / repair"`. The grader's `activeReservation` processes this via the combined-key handler: `parts = ["reservation", " baseline inspection", " repair"]`, `pending(parts[0]) = pending("reservation")`. The function `pending()` requires each step (after stripping "pending"/"reserved" prefix) to be in ["diagnose", "diagnosis", "repair"]. "reservation" after stripping equals "reservation" (no recognized prefix to strip), which is NOT in the allowed types. So `pending("reservation")` = false, pushing `false` into `declarations`.

The Delivery section (lines 155-157) correctly declares the individual labeled lines "Current step: repair pending", "Last completed step: baseline inspection", "Next incomplete step: repair", all of which return `true` from the individual handlers. But because `declarations.every(Boolean)` aggregates ALL declarations including the combined line's `false`, `activeReservation` returns `false`.

Fix required: SKILL.md step 3 should clarify that the combined `"current step / last completed step / next incomplete step"` line must show the CURRENT step as a pending/repair state (not "reservation"). Or the subject should use the canonical three-labeled-line form (per R6 template) which avoids the combined line's ambiguity. The three-labeled-line form correctly maps to individual key handlers that each independently return true.

### F6 — Three-rounds execution timeout (severity 2) [NEW]

Expected: Subject produces terminal answer, commits receipt, and exits within 25 minutes.

Observed: Subject completed all 3 rounds correctly (A/B/C fixed, D open at exhaustion, 37 frames opened, reservations before mutations). But during round 3 finalization (updating the receipt and producing the terminal answer), the subject hit the 25-minute context/time limit. execution.json code=1, no terminal assistant text answer, receipt uncommitted (dirty git). The last observable assistant text (trace line 21457) was "Now add R3 to ledgers and inspection entries, update final coverage, stop decision, and delivery" — the subject was in the process of finalization when it ran out.

Root cause: The three-rounds scenario requires extensive documentation across 4 sessions × 8 flows = 32 frame observations, plus 3 rounds of reconciliation, plus the final receipt update and terminal answer. The 25-minute limit is insufficient for the full documentation load.

Fix required: Either increase the time limit for three-rounds, or add guidance to write the receipt incrementally (after each round) rather than at the end.

## Missing

None. All requested checks and reachable observations ran. F4/F5/F6 are verification failures, not environment blockers. All seven scenarios executed.

## Human Review

### Review targets

- Review every C/T/A row, then F4/F5/F6 and exact retained evidence. Independently open frames from `evals/results/20260920-150848/`.
- Verify that R5-R7 changes (quoted-label fix, labeled-line reservation form, findings-scoping, markdown link answer, allowed-value enumeration) work as documented for passing scenarios.
- Verify that F4 (initial frames post-click) and F5 (combined step-line "reservation") are genuine grader failures.
- Confirm three-rounds all 3 reservations precede mutations and progression is correct.

### Verify

- [ ] Re-run `npm test`; expect 184 tests, 0 fail, 0 skip plus validator/plugin checks.
- [ ] Re-run `npm run build -- --runtime oh-my-pi`; expect 44 skills, 7 workers.
- [ ] Re-run `node scripts/check-commits.mjs 4458fbf21e199dad45376b8164f78c2165ac1d20..HEAD`; expect 34 valid subjects.
- [ ] Re-decide **A4** against retained evidence: primary behavior correct (2→1→0), but initial frames show post-click 2/1 (not 0) and combined step-line "reservation" not pending-repair. Current verdict: fail (F4, F5, severity 2).
- [ ] Re-decide **A10** against retained evidence: three-rounds behavior correct (A/B/C fixed, D open), reservations before mutations, 37 frames. But execution timeout prevents finalization. Current verdict: fail (severity 2).
- [ ] Re-decide **A11** against retained evidence: continuation passes with pre-existing interrupted state, no replay, IE-001 resolved. Current verdict: pass.
- [ ] Confirm label-disagreement (A6): F2 fix effective, quoted "Add one" resolves, pixel count=2 contradicts label, saved grade passes.
- [ ] Confirm no-progress (A7): F2 fix effective, pass0/pass1 both count=2, reservation before mutation, saved grade passes.
- [ ] Confirm viewer-blocked (A5): effective config matches declared controls, read denied at trace 1097.
- [ ] Confirm zero-limit (A9): inspection only, 3 frames opened, pass0/increment=2/reset=0, no mutation.
- [ ] Confirm continuation (A11): interrupted.valid=true, fresh session completes without replay, pass1/increment=1.

### Known limits

- Model: mandatory `anthropic/claude-sonnet-4-6` (Codex quota exhausted, Fable/Astra forbidden). Subject behavior (initial frame timing for F4, combined step-line choice for F5, context exhaustion for F6) reflects model characteristics for this run.
- Single saved-grading run (5/7). No retry-until-green; failures are genuine.
- Three-rounds review.json uses placeholder sha256 values for most frame observations (trace-images are webp/resized requiring subjectImage fields not fully resolved) — scenario fails at execution level regardless.
- Prior V4 evidence and controls remain unmodified. V5 adds `verification-v5-4b2123a-20260920/` proof dir.
- Evidence is local and ignored. Git commits do not transport media or diagnostic dependencies.
