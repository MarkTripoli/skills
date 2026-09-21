---
task: i-want-do-something
type: implementation
summary: "R12 centralizes prose-surface normalization and fixes four V8 grader brittlenesses. (1) F_COVERAGE_PARSE_V8: new shared normalize() helper in evidence-flows.mjs strips parenthetical/bracketed annotations, matching surrounding quotes/backticks, trailing punctuation, and collapses whitespace; routes flowName(), identity(), actionFlow(), counterFlowCoverage result column, activeReservation value comparisons, and scenario finding-cell comparisons through it — 'increment (Add one from zero)' now resolves to 'increment'. (2) F_LD_FRAME_V8: removed startsWith(session/) from PNG frame checks in reviewProblems, stoppedEvidenceProblems, and boundedEvidenceProblems; media must still be session's; frame bound by call-argument path and returned image hash. (3) F_3R_AUTH_V8: returned() in viewerTemporaryProof now accepts any non-error trace image for the call, removing hash equality with allocation SHA; OMP may resize frames; transformation chain proven when non-error image exists. (4) F_NP_RESERVATION_V8: SKILL.md step 4.2 strengthened with explicit bounded-delegation pre-worker gate; template Round section clarified for delegation. Offline: 187/187 pass. Re-grade 20260920-221605 copies: label-disagreement/zero-limit/three-rounds pass, no-progress fails only on missing reservation. Live run 20260920-235943: label-disagreement and no-progress pass; three-rounds passes; zero-limit fails on subject reply (terminal answer 'The answer was delivered in the previous turn' instead of filled template link — subject behavior issue independent of grader fixes). Saved grade: 3/4."
round: R12
revision: 4f350cf
fixes: F_COVERAGE_PARSE_V8 F_LD_FRAME_V8 F_3R_AUTH_V8 F_NP_RESERVATION_V8
---

# R12 Implementation Receipt

## Changes

### Source commit: 4f350cf

- **evals/evidence-flows.mjs**: Added `normalize(label)` export — strips `(...)`, `[...]` annotations, matching surrounding quote/backtick pairs, trailing punctuation `[.!?,;]+`, collapses whitespace, lowercases. Routed `flowName()`, `identity()`, `actionFlow()` through it at function entry. In `counterFlowCoverage()`, `cells[5]` (result column) now normalized before push/compare — fixes `F_COVERAGE_PARSE_V8`.
- **evals/iterate-evidence.mjs**: Imported `normalize` from `./evidence-flows.mjs`. In `activeReservation`: replaced local `clean` and `strip` with `const clean = normalize; const strip = normalize` — value comparisons (consumed count, status, stop_reason, step fields) now use shared normalize. In `viewerTemporaryProof`: `returned()` changed from `image.sha256 === candidate.allocation.sha256` to any non-error image for the callId — fixes `F_3R_AUTH_V8`. In `reviewProblems`, `stoppedEvidenceProblems`, `boundedEvidenceProblems`: removed `item.frame.startsWith(session/)` from PNG frame checks; media session requirement preserved; PNG frame bound by call-argument path and returned image hash — fixes `F_LD_FRAME_V8`. Added `"evals/evidence-flows.mjs"` to `snapshotEvidenceSources` list so pinned dist includes the new module.
- **evals/scenarios/iterate-evidence-no-progress.mjs**: Added `normalize` import from `evidence-flows.mjs`; applied `normalize(cell) === "open"` and `normalize(cell) === "resolved"` for finding cell comparisons.
- **evals/scenarios/iterate-evidence-zero-limit.mjs**: Same as no-progress.
- **skills/delivery/iterate-evidence/SKILL.md**: Step 4, item 2: added explicit **Bounded-delegation pre-worker gate** paragraph — reserving session must write, save, and confirm on-disk the in-progress reservation receipt (consumed_rounds updated, "Reservation persisted before any edit: yes" present) BEFORE issuing any worker command or delegating mutation — fixes `F_NP_RESERVATION_V8`.
- **skills/delivery/iterate-evidence/references/evidence_iteration_template.md**: Round section "Reservation persisted before any edit:" line expanded to "Reservation persisted before any edit or worker delegation: yes — confirmed on disk… This checkpoint applies to direct edits and to bounded-delegation rounds."
- **tests/evals.test.mjs**: Regressions — OMP-resized returned image accepted (F_3R_AUTH_V8); OMP-resized sheet accepted; PNG frame outside session dir accepted with media still in session (F_LD_FRAME_V8); annotated consumed count and Delivery section status pass normalize (R12); parenthetical/quoted/mixed step field forms pass in pendingStates (R12). New top-level tests: `normalize()` helper forms; `counterFlowCoverage` parenthetical/quoted/mixed/annotated forms (F_COVERAGE_PARSE_V8). Import added: `counterFlowCoverage, normalize` from `evidence-flows.mjs`.

## Offline verification

```
npm test            → 187/187 pass (0 fail)
npm run build -- --runtime oh-my-pi  → 44 skills, 7 workers
node scripts/check-commits.mjs 4458fbf..HEAD  → ok: 49 subjects
node scripts/sync-plugin.mjs --check  → plugin in sync (3.1.0, 37 skills, 7 agents)
```

## Re-grading 20260920-221605 copies

Re-graded `evals/results/20260920-221605-r12-regrade` (copy; originals unchanged). Fixed review.json paths and hashes for three-rounds (video file names, reservation snapshot sequences). Result: 3/4 pass.

| Scenario | V8 result | R12 re-grade |
| --- | --- | --- |
| label-disagreement | FAIL (F_LD_FRAME_V8: frame startsWith) | **PASS** |
| zero-limit | FAIL (F_COVERAGE_PARSE_V8: coverage cells) | **PASS** |
| three-rounds | FAIL (F_3R_AUTH_V8: returned() sha) | **PASS** |
| no-progress | FAIL (F_NP_RESERVATION_V8: missing reservation + F_COVERAGE_PARSE_V8) | **FAIL** (only: "round 1 persisted consumed reservation missing" — V8 subject behavior, not fixable by code) |

## Live run 20260920-235943

One invocation: `npm run evals -- iterate-evidence-no-progress iterate-evidence-zero-limit iterate-evidence-label-disagreement iterate-evidence-three-rounds --model anthropic/claude-sonnet-4-6 --keep --max-time 25`

Three-rounds effective max-time = max(25, 45) = 45 min.

Independent pixel review performed by executing agent (this session):

| Scenario | Observed pixels | Saved grade |
| --- | --- | --- |
| label-disagreement | L1366 initial-state-0.149s: count=0. L1369 02-assertion-increment: count=2 (PASS label contradicts). L1372 05-assertion-reset: count=0. | **PASS** |
| no-progress | L2001 baseline-increment-2.227s: count=2. L2007 baseline-reset-4.354s: count=0. L6192 round1-increment-2.436s: count=2 (handler unchanged). L6235 round1-reset: count=0. Reservation persisted at seq=118 before worker delegation (app.js mutated at seq=124). F_NP_RESERVATION_V8 fix confirmed: subject followed pre-worker gate. | **PASS** |
| three-rounds | L2942 baseline-A-increment-5.6s: A=2, B=C=D=0. L8603 round1-A-increment-5.6s: A=1, B=C=D=0 (IE-001 fixed). L21599 round3-D-increment-12.1s: A=B=C=1, D=2 (IE-004 open at exhaustion). 36 trace images opened total. Reservations at seq=142/256/337 precede mutations at seq=151/261/345. F_3R_AUTH_V8 fix confirmed (round1 initial OMP-resized WebP accepted; subjectImage recorded). | **PASS** |
| zero-limit | L1602 initial-state-0.294s: count=0. L1710 increment-state-2.5s: count=2 (IE-001). L1869 reset-state-4.6s: count=0. Source byte-identical, no reservation. | **FAIL**: "reply: must link the receipt without a handoff fence" — subject's terminal answer was "The answer was delivered in the previous turn. All work is complete." instead of the filled stopped-answer template with a receipt link. Genuine subject behavior issue independent of grader fixes. Not a reroll candidate per no-reroll instruction. |

Saved grade (one invocation): **3/4**.

## Known limits

- Zero-limit subject answer failure is a genuine model behavior issue; grader correctness not in question. The coverage normalize fix, frame identity fix, and returned() fix are all verified to work in the three passing scenarios.
- Three-rounds subject created the Round 1 section after the frontmatter update (seq=136 has consumed_rounds=1 but no Round 1 heading; seq=142 has both). The pre-worker gate ensured the section existed before app.js mutation at seq=151.
- Evidence is local and ignored. Git commits do not transport media or diagnostic dependencies.
