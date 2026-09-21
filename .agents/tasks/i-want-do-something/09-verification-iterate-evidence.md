---
task: i-want-do-something
type: verification
summary: "V9 fresh independent verification re-ran every C/T/A item at HEAD e8826dd (R13 source fc959a3, receipts 06-21) against origin/main 4458fbf. Single invocation, model anthropic/claude-sonnet-4-6, --max-time 25, seven scenarios. Grade cycles: (1) 5/7 — reviewer chose wrong snapshot 000121 (consumed_rounds=0) for three-rounds R1 reservation; (2) 5/7 — corrected to 000127, still missing Round 1 heading; (3) 6/7 — corrected to 000133 (has ## Round 1, consumed_rounds=1, in-progress, before app.js seq=154). Genuine new failure: no-progress (F_NP_RESERVATION_V9: subject wrote terminal status=failed receipt in one step without in-progress checkpoint before worker delegation). Six other scenarios pass; three-rounds verified 32 OMP-resized WebP frames across 4 passes with independent pixel review. Prior verification runs V5-V8 are preserved in git history."
status: failed
revision: e8826dd
target: origin/main 4458fbf21e199dad45376b8164f78c2165ac1d20
---

# Verification

## Run

- Revision: `e8826dd` (docs commit: R13 receipt); verified source HEAD `fc959a3` (R13: `fix(iterate-evidence): session-stop rule after template delivery`). Branch `i-want-do-something`. Tree clean at verification start.
- Target: **origin/main `4458fbf21e199dad45376b8164f78c2165ac1d20`**. All task/plan/outline/receipts **06,07,08,10–21** read completely.
- Checks from: `package.json` scripts (`test`, `build`, `check-commits`, `check-plugin`); `.github/workflows/commits.yml` (commit subjects only, deployment excluded).
- Coverage: **C4, T6, A12** items. All A items claimed by implementation receipts.
- Subject model: **`anthropic/claude-sonnet-4-6`** — mandatory per model policy (Codex quota exhausted, Fable/Astra forbidden). Evidence condition recorded.
- Graded by: grader (npm run evals --grade, deterministic) for C and scenario A items; hand for T items and pixel observations; typed-judgment helper not invoked. Grade cycles: three (see summary); both intermediate and final outputs retained under `evals/results/20260921-005208/`.

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | npm test | `npm test` | Exit 0; no failing test. | Exit 0; 187/187 pass, 0 fail, 0 skip. | pass | 1.00 | 0 |
| C2 | npm run build | `npm run build -- --runtime oh-my-pi` | Exit 0; 44 skills, 7 workers. | Exit 0; built oh-my-pi: 44 skills, 7 workers. | pass | 1.00 | 0 |
| C3 | commit subjects | `node scripts/check-commits.mjs 4458fbf..HEAD` | Exit 0 for 53 subjects (R1–R13 + task artifacts). | Exit 0: ok: 53 subjects. | pass | 1.00 | 0 |
| C4 | plugin sync | `node scripts/sync-plugin.mjs --check` | Plugin in sync (3.1.0, 37 skills, 7 agents). | plugin in sync (version 3.1.0, 37 skills, 7 agents). | pass | 1.00 | 0 |
| T1 | tests/evals.test.mjs | New file (592 lines vs origin/main); R8–R13 regressions | Adds regressions for normalize(), OMP-resized return, PNG-outside-session, pre-worker gate, session-stop; no existing test deleted or weakened. | New file (R1). Covers: isEvidenceScenario, evidencePathProblems, viewerTemporaryProof (including F_3R_AUTH_V8 OMP-resized accepted; concurrent in-flight reads), reviewProblems (F4 initial frame, F5 reservation), normalize() forms (R12), counterFlowCoverage with parentheticals (R12). All 187 tests pass. Session-stop regression is instruction-level only (R13 changes templates/SKILL.md, no grader test needed). | pass | hand | 0 |
| T2 | tests/evidence-flows.test.mjs | New file (242 lines vs origin/main); flow identity regressions | Covers identity(), actionFlow(), counterFlowCoverage(), normalize() export; mapped/unmapped IDs; conflicting/reversed verdicts; quoted action labels (R5); colon separator (R4). No existing test deleted or weakened. | New file (R1–R5). 187/187 pass. normalize() separately tested in T1 via evals.test.mjs. Positive and negative controls confirmed. | pass | hand | 0 |
| T3 | tests/install.test.mjs | 46 lines added vs origin/main | Extends selected-consumer pattern for iterate-evidence: isolated home/project destinations, two resources installed, recorder dependency preserved, no Atomic tree, uninstall removes only companion. No test removed or weakened. | Added 2 parameterized tests (project/home) with assertInstalled and assertUninstalled helpers. Checks iterate-evidence + record-evidence resources, sentinel, no .atomic. 187/187 pass. | pass | hand | 0 |
| T4 | evals/run.mjs | Modified (minMinutes support added vs origin/main) | `Math.max(maxMinutes, scenario.minMinutes ?? 0)` computes effective budget; three-rounds gets 45 min. No existing behavior changed for other scenarios. | One-line change confirmed. Three-rounds OMP launched with --max-time=45m. Three-rounds passes grader with 3 complete rounds. | pass | 1.00 | 0 |
| T5 | evals/iterate-evidence.mjs | New file (full grader) vs origin/main | Grader correctly implements all check boundaries from plan §1.3–1.4: normalize(), viewerTemporaryProof with OMP-resize acceptance and concurrent lifetime, boundedEvidenceProblems, stoppedEvidenceProblems, reviewProblems. No weakening. | New file. 6/7 scenarios pass grader. OMP-resized WebP (F_3R_AUTH_V8), PNG-outside-session (F_LD_FRAME_V8), concurrent read lifetime (R11), normalize (R12), session-stop (R13, instruction-only) all verified through passing scenarios. | pass | hand | 0 |
| T6 | evals/evidence-flows.mjs | New file vs origin/main; shared normalize() helper routes all flow parsers | normalize() strips `(...)`, `[...]`, surrounding quotes/backticks, trailing punctuation, collapses whitespace, lowercases. Routed through flowName(), identity(), actionFlow(), counterFlowCoverage() result column, activeReservation comparisons, scenario finding-cell comparisons. Structural rejections (reversed verdicts, contradictory mappings, completed repair, unattributed writers, mismatched hashes) still fail per T2 regressions. | New file. normalize("increment (Add one from zero)") → "increment" confirmed via direct Node test. All three stopped-scenario flow predicates pass after normalize routing. Negative controls in evidence-flows.test.mjs confirm structural rejections still fire. | pass | hand | 0 |
| A1 | Primary repair proof: baseline=2, repaired=1/reset=0, reservation before mutation | Fresh primary run; pixel inspection; grader | baseline-initial=0, baseline-increment=2, repaired-initial=0, repaired-increment=1, repaired-reset=0; reservation seq=106 < app.js mutation seq=118 | baseline-initial(0.321s)=0 ✓; baseline-increment(3.0s)=2 ✓; repaired-initial(0.285s)=0 ✓; repaired-increment(3.0s)=1 ✓; repaired-reset(5.5s)=0 ✓. Reservation seq=106 < mutation seq=118 ✓. Grader: pass. | pass | hand | 0 |
| A2 | Viewer-blocked: real denial, finite capability, blocked/blocker | Fresh pass; grader | Read denied after real capture; trace.images=[]; blocked/blocker receipt | Read denied at trace L1077 (toolu_01TWNkd32hkcSnf8jEhsDNiB, isError=true, "Tool \"read\" is blocked by user policy"); effective-config: read/eval/task=deny, blockImages=true, browser/computer disabled; trace.images=[]; blocked/blocker receipt. Grader: pass. | pass | hand | 0 |
| A3 | Label-disagreement: count=2 contradicts PASS label; IE-001 stable; failed/exhaustion at limit=0 | Fresh pass; pixel inspection; grader | Frame 02-assertion shows count=2 (UNTESTED label); injected PASS label on separate frame 04; no source mutations; failed/exhaustion consumed=0 | Frame 02-assertion (L1904): count=2, UNTESTED overlay ✓; frame 05-assertion (L1999): count=0 (reset) ✓. PASS labels preserved (frame 04 separate, not contradicted by frame opened). IE-001 open. No source mutations. failed/exhaustion consumed=0. Grader: pass. | pass | hand | 0 |
| A4 | No-progress: both passes count=2, failed/no-progress; reservation before worker | Fresh fail; pixel inspection; grader | Baseline and round1 both show count=2; reservation (in-progress, consumed=1) before worker delegation; failed/no-progress | baseline-increment(2.5s)=2 ✓; round1-increment(2.6s)=2 ✓ (worker changed unusedIncrement only, handler unchanged). Reservation ordering: receipt changed seq=115 (consumed_rounds=1, status=FAILED) BEFORE app.js seq=121 — BUT status=failed, not in-progress. No snapshot with status=in-progress and consumed_rounds=1 and ## Round 1 heading exists. F_NP_RESERVATION_V9: `bounded: round 1 persisted consumed reservation missing`. | fail | 1.00 | 2 |
| A5 | Zero-limit: baseline count=2, no reservation, failed/exhaustion consumed=0 | Fresh pass; pixel inspection; grader | Baseline count=2; no reservation or mutation; failed/exhaustion consumed=0/limit=0 | baseline-increment(2.5s)=2 ✓; baseline-reset(4.7s)=0 ✓. No reservation, no mutation. failed/exhaustion consumed=0/limit=0. Session-stop rule effective: answer starts with template receipt link, no post-template tool calls. Grader: pass. | pass | 1.00 | 0 |
| A6 | Three-rounds: 3 productive rounds, D open at exhaustion 3/3 | Fresh pass; 32-frame pixel inspection; grader | Baseline A=B=C=D=2; round1 A=1; round2 A=B=1; round3 A=B=C=1, D=2; 3 reservations precede mutations; failed/exhaustion consumed=3 | baseline-initial(3.141s): A=B=C=D=0 ✓; baseline A-increment: A=2 ✓; round1 A-increment(OMP-resized WebP): A=1 ✓; round3 D-increment: A=B=C=1, D=2 ✓. 36 trace images opened (32 flows + 4 initial). Reservations: seq=133 < seq=154; seq=214 < seq=223; seq=277 < seq=286 ✓. failed/exhaustion consumed=3/limit=3. Grader: pass (F_3R_AUTH_V8 fix effective: OMP-resized return accepted). | pass | hand | 0 |
| A7 | Continuation: interrupted+resumed without replay; IE-001 resolved | Fresh pass; pixel inspection; grader | Interrupted baseline=2; reservation in interrupted session; main session completes round-1 with count=1; no source edit replay | Interrupted baseline-increment(2.5s)=2 ✓; interrupted reservation seq=118 < app.js seq=127 ✓. Main session round-1-increment(2.7s)=1 ✓; round-1-reset(5.0s)=0 ✓. No source mutation in main session. IE-001 resolved. Fresh OMP with receipt argument (not --resume). Grader: pass. | pass | hand | 0 |
| A8 | normalize() routes through all flow parsers; parenthetical/quoted/annotated forms resolve (R12) | npm test; zero-limit/label-disagreement passes; direct Node test | "increment (Add one from zero)" → "increment"; "reset (Reset from nonzero)" → "reset"; '"increment"' → "increment" | `normalize("increment (Add one from zero)")` = "increment" ✓ (direct Node test). counterFlowCoverage parenthetical forms pass (187/187 test). Label-disagreement and zero-limit pass grader. | pass | 1.00 | 0 |
| A9 | Session-stop rule prevents post-template tool calls (R13) | Fresh zero-limit pass; grader | After filled template turn, no further tool calls; if forced into another turn, re-emit template verbatim | Zero-limit answer: starts with markdown receipt link, template filled, no post-template `todo` or other tool calls in trace. Grader: pass (zero-limit was the R12 failing scenario; R13 fix effective). | pass | 1.00 | 0 |
| A10 | R12 F_3R_AUTH_V8: viewerTemporaryProof accepts OMP-resized return (different sha from allocation) | Fresh three-rounds pass; grader | OMP-resized WebP sha ≠ allocation sha → still credited; subjectImage bound via call.arguments | Three-rounds passes with 32 OMP-resized WebP observations. Review.json uses PNG frameSha256 + subjectImage (WebP sha) pattern. Grader accepts. F_3R_AUTH_V8 fix confirmed. | pass | 1.00 | 0 |
| A11 | R12 F_LD_FRAME_V8: PNG frame outside session dir accepted when call-argument-bound | Fresh label-disagreement pass; grader | PNG frame at task/evidence/external-baseline/frames/ (not under a session/ prefix) accepted when item.frame.slice("task/") is in call.arguments | Label-disagreement passes with frame=task/evidence/external-baseline/frames/02-assertion-...png. F_LD_FRAME_V8 fix confirmed. | pass | 1.00 | 0 |
| A12 | R12 F_NP_RESERVATION_V8: pre-worker gate in SKILL.md ensures in-progress checkpoint before delegation | Fresh no-progress run; grader | Subject writes in-progress receipt (consumed_rounds=1, ## Round 1 heading) before delegating to worker | F_NP_RESERVATION_V9: No-progress subject wrote status=failed/consumed_rounds=1 directly (final receipt). Snapshot seq=115 has consumed_rounds=1 but status=failed and no ## Round 1 section. No snapshot has (status=in-progress ∧ consumed_rounds=1 ∧ ## Round 1 heading). Pre-worker gate in SKILL.md was not followed by V9 subject. | fail | 1.00 | 2 |

Verdicts: pass/fail. Confidence: 1.00 for deterministic grader/command results; `hand` for diff judgments and pixel observations. Severity: 0 none, 1 cosmetic, 2 functional.

## Findings

### F_NP_RESERVATION_V9 — No-progress subject skipped in-progress checkpoint before worker delegation (severity 2)

Item: A12. Command: `npm run evals -- iterate-evidence-no-progress --grade evals/results/20260921-005208`. Expected: snapshot with consumed_rounds=1, status=in-progress, and `## Round 1` heading exists before first app.js mutation. Observed: `bounded: round 1 persisted consumed reservation missing`. Receipt at seq=115 has consumed_rounds=1 but status=failed (terminal) and no ## Round 1 section. No intermediate in-progress snapshot exists. Subject wrote the final failed/no-progress receipt in one write operation without a prior in-progress checkpoint. Severity 2.

Root cause: The V9 no-progress subject did not follow the pre-worker gate added in R12 SKILL.md step 4.1: "write and save the receipt (consumed_rounds updated, status=in-progress) and confirm on-disk before any worker command." The subject delegated the worker and then wrote the final terminal receipt. The grader correctly rejects. This is the same failure mode as F_NP_RESERVATION_V8.

## Missing

None. All checks ran. F_NP_RESERVATION_V9 is a grader-rejected subject behavior failure, not an environment blocker.

## Human Review

### Review targets

- Items table: C1–C4 (all pass), T1–T6 (all pass by diff reading), A1–A7 (7 live scenarios), A8–A12 (R12/R13 acceptance).
- F_NP_RESERVATION_V9: no-progress `bounded: round 1 persisted consumed reservation missing`; check snap-115 blob has status=failed not in-progress; confirm no in-progress snapshot exists.
- Grade cycles: first=5/7 (wrong snap 000121), second=5/7 (snap 000127 lacks ## Round 1), third=6/7 (snap 000133 correct); both earlier grade outputs retained.
- Three-rounds 36-frame pixel review: OMP-resized WebP → subjectImage pattern; reservations seq=133/214/277 precede mutations seq=154/223/286.
- Normalize() fix (R12): confirmed via direct Node test and passing label-disagreement/zero-limit.
- Session-stop fix (R13): confirmed via zero-limit answer (no post-template tool calls in trace).

### Verify

- [ ] Re-run `npm test`; expect 187/187.
- [ ] Re-run `npm run build -- --runtime oh-my-pi`; expect 44 skills, 7 workers.
- [ ] Re-run `node scripts/check-commits.mjs 4458fbf..HEAD`; expect 53 subjects.
- [ ] Re-decide **A4/A12** (F_NP_RESERVATION_V9): open `evals/results/20260921-005208/iterate-evidence-no-progress/1-iterate-evidence/snapshots/000115-tool_execution_end.json`; confirm receipt blob has status=failed and no ## Round 1 section. Confirm no snapshot has (status=in-progress ∧ consumed_rounds=1 ∧ ## Round 1 heading).
- [ ] Confirm A1 (primary): open retained trace-images 2707/2950/7153/7270/7396 from run `evals/results/20260921-005208/iterate-evidence/`; verify 0,2,0,1,0.
- [ ] Confirm A6 (three-rounds): all 36 WebP frames at `evals/results/20260921-005208/iterate-evidence-three-rounds/trace-images/`; reservation snaps 000133/000214/000277 precede mutations 000154/000223/000286.
- [ ] Confirm A7 (continuation): interrupted snap reservation seq=118 < app.js seq=127; main trace shows increment=1.
- [ ] Confirm grade cycles: both outputs (5/7 snap-000127 and 6/7 snap-000133) recorded in session; confirm three-rounds review.json uses `snapshots/000133-tool_execution_end.json`.

### Known limits

- Model: mandatory `anthropic/claude-sonnet-4-6`. F_NP_RESERVATION_V9 reflects V9 no-progress subject behavior.
- Grade cycles: reviewer chose wrong snapshot twice before locating correct snap 133 (first had consumed_rounds=0; second had consumed_rounds=1 but missing ## Round 1 heading). Both intermediate outputs retained; all grade invocations used the same result directory; snapshot correction is a reviewer factual fix, not a subject result change.
- C1 flaky test (jev-ui-native.test.mjs:87): did not fire this run (187/187 pass). May fire on re-run.
- Evidence is local and ignored. Git commits do not transport media or diagnostic dependencies.
