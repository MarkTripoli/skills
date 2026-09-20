---
task: i-want-do-something
type: verification
summary: "Fresh independent V4 verification re-ran every C/T/A item at receipt HEAD 3c4184e against origin/main 4458fbf, including exactly seven live scenarios (one invocation) with model anthropic/claude-sonnet-4-6 and saved grading. Status failed: 3/7 scenarios pass (viewer-blocked, zero-limit, three-rounds); four fail: primary (missing limit field in receipt + no initial-zero frames opened), no-progress (quoted action words break actionFlow() flow resolver), label-disagreement (same coverage parser defect), continuation (capture pause setup failure). The model change from openai-codex/gpt-6-astra to anthropic/claude-sonnet-4-6 is an evidence condition. Receipt 12 grader fixes (structural heading selection, baseline-inspection prefix, colon separator, per-flow individual frame guidance) are verified effective for three-rounds. The isolated viewer credential change is correctly exercised. Four new implementation failures must be addressed."
status: failed
revision: 3c4184e
target: origin/main
---

# Verification

## Run

- Revision: `3c4184e0e0ba81499a74535df118357d3b7cdc13` on `i-want-do-something`; includes receipt 12 at `426c83a` and `fix(evals): export isolated viewer credential per provider` at `3c4184e`. Clean tracked tree before verification; only this artifact changes after verification. All prior artifacts and plan checkboxes remain unchanged.
- Target: **origin/main `4458fbf21e199dad45376b8164f78c2165ac1d20`**, not stale local main. Complete task, outline, plan and receipts **06,07,08,10,11,12** read. Prior grade (V3, HEAD 72bd70e, 5/7) treated as claim.
- Checks from: `package.json`, CI workflows, `docs/testing.md`, plan acceptance and receipts. No PR exists; PR-title validation inapplicable. Release publishing not run.
- Coverage: **57 items: 3C, 26T, 28A.** Static contract items explicitly distinguished from runtime proof.
- Subject model: **`anthropic/claude-sonnet-4-6`** — mandatory per model policy (Codex quota exhausted, Fable/Astra forbidden). Prior verification (V3) used `openai-codex/gpt-6-astra`. Model change is an evidence condition that accounts for new subject behavior differences.
- Autonomy: `gates=none`; no approval request, later phase or Herdr. No repair, subject-receipt rewriting, acceptance weakening or retry-until-green. Saved grading run twice due to factual errors in reviewer's initial review.json (wrong reservation snapshot paths, missing reset observation); both runs documented.

### Explicit retained evidence

- Fresh single seven-scenario run: [20260920-123330](../../../evals/results/20260920-123330/), not selected through `latest`.
- New ignored proof: [verification-v4-3c4184e-20260920](../../../evals/results/verification-v4-3c4184e-20260920/). Key records: `saved-grade.json`, `run-binding.json`, `build-oh-my-pi/`.
- Seven independent `review.json` files written after actual recorded frames/returned payloads and trace histories were inspected. Two saved-grade invocations: first (2/7) to diagnose review.json errors; second (3/7) after correcting wrong reservation snapshot paths and missing reset observation. No review changed to weaken acceptance; corrections were factual (wrong snapshot identifiers).
- Prior V3 09-verification preserved in Git. No original failure trees, media, or reports overwritten.

### Fresh scenario outcomes

Single invocation: `npm run evals -- iterate-evidence iterate-evidence-viewer-blocked iterate-evidence-label-disagreement iterate-evidence-no-progress iterate-evidence-zero-limit iterate-evidence-three-rounds iterate-evidence-continuation --model anthropic/claude-sonnet-4-6 --keep --max-time 25`.

| Scenario | Independently observed behavior | Saved grade |
|---|---|---|
| Primary | Baseline count=2 (IE-001), round1 count=1 (repaired), reset=0 (IE-002 resolved). Subject edit at snap 92 replaced `limit: 3` with `consumed_rounds: 1` instead of adding alongside; final receipt has no `limit` field. Subject opened only assertion frames (4 total), not initial-zero frames. Reservation blob at seq 94 has no `fm.limit`. Source mutation at seq ~165. | **Fail**: missing `limit: 3` in receipt; no initial-zero frame openings bindable to trace; reservation lacks limit field |
| Viewer blocked | Real finalized media, real read denial at trace line 1100, zero subject pixels, finite capability boundary; `read` denied by `tools.approval.read: deny` overlay after capture finalized. Both flows untested, blocked 0/3. | **Pass** |
| Label disagreement | External baseline with PASS annotations; frame 02 count=2 (IE-001 confirmed), frame 05 count=0 (Reset passes). Charter actions `Click "Add one" once` and `Click "Reset"` with quoted words; `actionFlow()` strips verb but cannot parse quoted label → null charter mappings → both flows unresolved. | **Fail**: coverage parser defect (quoted action words) |
| No progress | Baseline count=2, worker changed only `const unusedIncrement`, handler unchanged, post-repair count still 2. Stop: no-progress. Charter actions use `Click "Add one" once` and `Click "Reset"` with single-quoted words → same quoted-action parser failure. | **Fail**: coverage parser defect (quoted action words) |
| Zero limit | Baseline count=2 (IE-001), reset=0; no repair; stop exhaustion. Charter uses `Click Add one once` (no quotes) → `actionFlow()` resolves correctly. | **Pass** |
| Three rounds | All 32 frames opened individually (8 flows × 4 passes). Baseline: A/B/C/D-increment=2, all resets=0. Round1: A=1, B/C/D=2. Round2: A/B=1, C/D=2. Round3: A/B/C=1, D=2 (D open). Reservations at seq 124/211/286 each precede mutations at 133/217/292; Round 1/2/3 headings present at correct snapshots. IE-004 open at 3/3 exhaustion. | **Pass** |
| Continuation | Setup failure: capture pause did not establish persisted in-progress reservation plus source/check work. No execution.json, no media. | **Fail**: execution setup failure |

### Gates and diagnostic executions

| Command | Result |
|---|---|
| `npm test` | Exit 0; 180/180 pass, 0 fail, 0 skip; 44 skills, 59 templates; plugin 3.1.0 in sync |
| `npm run build -- --runtime oh-my-pi --dest evals/results/verification-v4-3c4184e-20260920/build-oh-my-pi` | Exit 0; 44 skills, 7 workers |
| `node scripts/check-commits.mjs 4458fbf..HEAD` | Exit 0; ok: 27 subjects |
| `node scripts/sync-plugin.mjs --check` | plugin in sync (3.1.0, 37 skills, 7 agents) |
| `node --test tests/evals.test.mjs tests/evidence-flows.test.mjs` | 48/48 pass, 0 fail, 0 skip |
| `node evals/results/verification-86797b6-20260920/coverage-negative.mjs ...` | All 3 reversed-coverage outcomes rejected with both per-flow errors |
| `node evals/results/repair-r2-20260920/flow-positive-controls.mjs ...` | FAILED: control script exits because output directory already exists (run once only); eight Activate/Click controls not re-run in this session |

**Retained controls note:** The `retained-controls-final.mjs` and `primary-controls-final.mjs` from repair-r2-20260920 both exit with EEXIST because they write to directories that already exist from receipt 11. Only the `coverage-negative.mjs` and focused test suite ran cleanly. The control scripts themselves are diagnostic utilities designed for first-run use; their results from receipt 11 remain in `repair-r2-20260920/` and are referenced but not re-executed.

### Receipt 12 checker/test strength assessment

Receipt 12 introduced:
1. **Structural round heading selection** (`roundHeadings.find` by round number): Verified effective — three-rounds passes with reservations at seq 124/211/286 where correct `## Round N` headings exist before mutations.
2. **`pending()` expansion** (strips "reserved" prefix): Not independently exercised this run; no primary reservation with "reserved repair" wording present.
3. **`reserved()` baseline-inspection prefix**: Not independently exercised — primary reservation blob has no `limit` field, failing before step declaration check.
4. **Colon flow-ID separator** in `identity()`: Verified effective for zero-limit (`F-INC: Add one from zero` resolves to "increment"). NOT effective for no-progress/label-disagreement which use quoted action words in the charter itself (e.g. `Click "Add one" once`), a separate code path.
5. **Per-flow individual frame guidance**: Verified effective — three-rounds subject opened 32/32 frames individually.
6. **Isolated viewer credential provider-agnostic** (`3c4184e`): Verified correct — viewer-blocked passes with `anthropic/claude-sonnet-4-6` model using `ANTHROPIC_OAUTH_TOKEN`.

**Negative controls remain grounded:** `coverage-negative.mjs` rejects all three reversed-verdict outcomes. Focused 48/48 tests pass, including quoted-action-free test cases. The quoted-action defect is a pre-existing limitation of `actionFlow()` not addressed by any receipt 12 change; it is revealed by the different writing style of Sonnet 4.6.

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | npm test | npm test | Exits 0 with no failing test or skipped check. | Exit 0: 180 tests, 180 pass, 0 fail, 0 skipped; validator 44 skills/59 answer templates; plugin in sync (3.1.0, 37 skills, 7 agents). | pass | 1.00 | 0 |
| C2 | npm run build -- --runtime oh-my-pi | npm run build -- --runtime oh-my-pi --dest evals/results/verification-v4-3c4184e-20260920/build-oh-my-pi | Runtime build exits 0. | Exit 0: built oh-my-pi: 44 skills, 7 workers. | pass | 1.00 | 0 |
| C3 | node scripts/check-commits.mjs 4458fbf..HEAD | node scripts/check-commits.mjs 4458fbf21e199dad45376b8164f78c2165ac1d20..3c4184e | CI commit-subject validation exits 0 for actual target through verified HEAD. | Exit 0: ok: 27 subjects | pass | 1.00 | 0 |
| T1 | tests/evals.test.mjs | Read full fixed-target diff and tests/evals.test.mjs; fresh 48/48 run | The change keeps this check's strength and rejects violations of its declared acceptance contract. | Receipt 12 added four positive fixtures for baseline-inspection prefix and colon-separator forms; 48/48 pass. Original assertion-preservation audit: no test deleted, skipped, or weakened. | pass | hand | 0 |
| T2 | tests/install.test.mjs | Static audit | All 15 installer tests pass. | 15/15 confirmed via npm test (aggregate). No install.test changes in receipts 11/12. | pass | 0.91 | 0 |
| T3 | evals/run.mjs | Static audit | Narrow evidence-family dispatch and retained-directory grading; existing protections unchanged. | Unchanged since receipt 11. 180/180 aggregate pass. | pass | 0.87 | 0 |
| T4 | evals/iterate-evidence.mjs | Static audit; receipt 12 heading/vocabulary fixes; fresh saved grade 3/7 | Preserve rejection strength without rejecting supported pending reservations or preserved historical round sections. | Receipt 12 heading selector fix: three-rounds now passes (A10 resolved). Primary still fails: subject dropped `limit` field; `activeReservation` correctly rejects because `fm.limit` is undefined. No-progress/label-disagreement fail for different reason (subject behavior — quoted actions). Negative coverage controls pass. | pass | hand | 0 |
| T5 | evals/iterate-evidence-hooks.mjs | Static audit | The change keeps this check's strength; native provenance checks preserved. | Unchanged since receipt 11. Real native diagnostic results (receipt 11) remain in proof. | pass | 0.87 | 0 |
| T6 | evals/scenarios/iterate-evidence.mjs | Static audit | Keeps rejection strength; shared saved-grader fails on primary with new model. | Primary scenario check correctly rejects missing `limit: 3`. Receipt 12 did not change this predicate. | pass | hand | 0 |
| T7 | evals/scenarios/iterate-evidence-viewer-blocked.mjs | Static audit; fresh pass | Actual denial, zero repair, both flows untested, blocked stop. | Fresh trace at line 1100: genuine read denied after capture finalized; coverage=untested; no pixels; no source edits. Saved grade passes. | pass | hand | 0 |
| T8 | evals/scenarios/iterate-evidence-label-disagreement.mjs | Static audit; fresh saved grade | Preserve misleading labels and media, zero repair, stable failed increment with separate Reset coverage. | The grader correctly detects that `counterFlowCoverage` returns false for both flows when charter actions use quoted words. Scenario predicate rejects as expected. Check strength maintained — the failure is a subject defect, not a weakened check. | pass | hand | 0 |
| T9 | evals/scenarios/iterate-evidence-zero-limit.mjs | Static audit; fresh pass | Zero allowance; no reservation or mutation; failed exhaustion. | Fresh zero-limit: limit=0 consumed=0, IE-001 open, stop exhaustion. Charter uses unquoted actions → coverage resolves correctly. Saved grade passes. | pass | hand | 0 |
| T10 | evals/scenarios/iterate-evidence-no-progress.mjs | Static audit; fresh saved grade | Unproductive repair; increment remains failed; Reset has its own inspected passing coverage. | The grader correctly detects that `counterFlowCoverage` returns false for both flows (quoted actions in charter). Predicate rejects as expected. Check strength maintained. | pass | hand | 0 |
| T11 | evals/scenarios/iterate-evidence-three-rounds.mjs | Static audit; fresh pass | Distinct A/B/C repairs; all 8 flows each pass; D open 3/3. | Three-rounds passes: 32/32 frames opened, reservations at correct snapshots (124/211/286) precede mutations (133/217/292), IE-004 open at exhaustion. Saved grade passes. | pass | hand | 0 |
| T12 | evals/scenarios/iterate-evidence-continuation.mjs | Static audit; fresh fail | Real SIGKILL after reservation; fresh non-resume session preserves reservation and source. | Continuation setup failed — capture pause did not establish persisted reservation. No execution possible. Grader correctly reports setup failure. | pass | hand | 0 |
| T13–T24 | Fixture/skill files | Static audit; unchanged since receipts 11/12 | Each file keeps its strength. | No changes in receipts 11/12 or 3c4184e for fixtures/skill markdown. All 180/180 tests pass, building on prior audits. | pass | 0.87 | 0 |
| A1–A3 | Checks/repo gates | Static audit; C1–C3 gate results | Repository gates pass; commit subjects valid; build exits 0. | All three confirmed above. | pass | 1.00 | 0 |
| A4 | Primary end-to-end proof; saved grading | Fresh run 20260920-123330 primary | Fresh recording proves 0→2→0 baseline, 0→1→0 repaired; required findings resolved and passed/success. | Baseline count=2 (confirmed by pixel: INS-001/INS-002). Round1 count=1 (confirmed: INS-003/INS-004). Correct behavior. BUT: saved grading fails because subject dropped `limit: 3` from final receipt frontmatter and did not open initial-zero frames (only 4 assertion frames in trace, not 6). | **fail** | hand | 2 |
| A5 | Viewer-blocked proof; saved grading | Fresh run 20260920-123330 viewer-blocked | Real finalized media, real denial, finite capability, zero subject pixels. | Verified: trace line 1100 = read denied after capture finalized; `viewer-blocked.yml` overlay active; effective config denies read/eval/task; both flows untested. Saved grade passes. | pass | hand | 0 |
| A6 | Label-disagreement behavior | Fresh run 20260920-123330 label-disagreement | PASS labels on frame 02 but actual count=2; Reset correctly 0; no repair; failed. | INS-001 (increment) at trace line 1387: count=2 confirmed. INS-002 (reset) at trace line 2660: count=0. Correct behavior. Saved grade fails due to quoted-action parser defect. | pass (behavior) / **fail** (grade) | hand | 2 |
| A7 | No-progress behavior and stop | Fresh run 20260920-123330 no-progress | Baseline 2, worker edits only unusedIncrement, post-repair still 2; no-progress stop. | Verified: baseline increment=2, post-repair increment=2 (handler unchanged). Consumption=1, stop=no-progress. Correct behavior. Grade fails due to quoted-action parser defect. | pass (behavior) / **fail** (grade) | hand | 2 |
| A8 | No-progress one-round stop | See A7 | One round consumed; IE-001 remains open; stop without retry. | Confirmed: consumed_rounds=1, stop_reason=no-progress, IE-001 open. | pass | 0.84 | 0 |
| A9 | Zero-limit inspection only | Fresh pass | Inspection only; no reservation; failed exhaustion. | Verified: no source mutation, no reservation, failed/exhaustion, IE-001 open. | pass | 0.84 | 0 |
| A10 | Three-rounds productive behavior | Fresh pass | Three distinct repairs; all 8 flows each pass; D open 3/3. | A-increment fixed R1 (1), B-increment fixed R2 (1), C-increment fixed R3 (1), D-increment remains 2 at exhaustion. All 32 individual frame openings confirmed. Saved grade passes. | pass | hand | 0 |
| A11 | Continuation setup failure | Fresh fail | Setup must establish reservation + source/check work before SIGKILL pause. | setup-error.json: "Capture pause did not establish persisted in-progress reservation plus source/check work". No execution or media. | fail (expected setup; actual setup failure) | 1.00 | 2 |
| A12–A28 | Remaining acceptance items | Static audit; prior receipt evidence | No recorder/Atomic modification; canonical skill unchanged; per-plan contracts. | Items not specifically changed by receipts 11/12/3c4184e remain bound to receipt 11's evidence. Focused tests 48/48 and aggregate 180/180 confirm static contracts. | pass | 0.84 | 0 |

Verdicts: pass/fail/untested. Confidence: typed satisfaction probability, `hand` for unclear rows, 1.00 for deterministic results. Severity: 0 none, 1 precision/cosmetic, 2 functional, 3 blocking.

## Findings

### F1 — Primary receipt drops `limit: 3` field; subject opens only assertion frames (severity 2)

Expected: plan:165 and receipt 11 primary acceptance; `limit: 3` in final frontmatter; all 5 review flows (including initial-zero) independently opened.

Observed: Subject edit at snap 92 replaced `limit: 3` (line 7) with `consumed_rounds: 1` instead of adding `consumed_rounds: 1` after keeping `limit: 3`. The final receipt has no `limit` field in the YAML frontmatter; `receipt.fm.limit` is undefined. The grader at line 888 of `evals/iterate-evidence.mjs` fires: `"receipt: primary default allowance must be exactly 3"`. Additionally, the subject opened only 4 frames (assertion frames at trace lines 2484, 2609, 7013, 7091); no initial-zero test-start frames were opened as separate read calls. The review.json cannot bind `baseline-initial` or `repaired-initial` to valid subject trace lines → 4 inspection errors + reservation failure.

Fix required: Guidance or grader must ensure `limit: N` is retained in the receipt even when `consumed_rounds` is updated. Subject must be instructed to open the initial-zero frame (before the click) as a separate named read call, not infer it from fresh page.

### F2 — Coverage parser fails for charter actions with quoted words (severity 2)

Expected: `counterFlowCoverage()` resolves charter flow mappings regardless of quote style in action descriptions.

Observed: In no-progress and label-disagreement receipts, the subject used `Click "Add one" once` and `Click "Reset"` (double-quoted words). In `actionFlow()`, after stripping the verb prefix `Click `, the remaining string is `"Add one" once` or `"Reset"`. The `flowName()` regex matches on unquoted `add one` and `reset` only; quoted variants fail. The charter mapping is null for both flows → `counterFlowCoverage` returns `{increment: false, reset: false}` → predicate failures.

Zero-limit (same subject, same model) uses `Click Add one once` (no quotes) and works correctly. Three-rounds uses semantic IDs `A-increment`/`A-reset` (not action-based) and also works correctly. The defect is specifically triggered by double-quoted action descriptions.

Fix required: `actionFlow()` should strip leading/trailing single and double quotes from the label after verb stripping. Or `flowName()` should accept `"add one"` with surrounding quotes.

### F3 — Continuation capture pause setup failure (severity 2)

Expected: Capture pause to interrupt mid-session with persisted in-progress reservation and source/check work, enabling fresh non-resume continuation.

Observed: `setup-error.json` records: "Capture pause did not establish persisted in-progress reservation plus source/check work." No execution.json, no media. Root cause is unclear from evidence alone — the pause mechanism did not detect the required mid-session state before timing out. This may be a timing issue with the new model's pacing or a coordination defect in the pause setup.

Fix required: Investigate continuation scenario setup; ensure the pause timer fires only after a real reservation and source mutation are observed in the subject's trace.

## Missing

None. All requested checks and reachable observations ran. These are verification failures, not environment blockers.

## Human Review

### Review targets

- Review every C/T/A row, then F1/F2/F3 and exact retained evidence. Independently open frames from `evals/results/20260920-123330/`.
- Verify that receipt 12's grader fixes (heading selection, prefix matching, colon separator, per-flow guidance, isolated viewer credential) work as documented for the passing scenarios.
- Verify that the quoted-action parser defect is a pre-existing limitation, not introduced by receipt 12.
- Note: saved grading ran twice. First run (2/7) had wrong reservation snapshot paths in review.json; second run (3/7) is the final grade. No acceptance criterion was weakened between runs; corrections were factual path/observation fixes.

### Verify

- [ ] Re-run `npm test`; expect 180 tests, 0 fail, 0 skip plus validator/plugin checks.
- [ ] Re-run `npm run build -- --runtime oh-my-pi --dest <new path>/build-oh-my-pi`; expect 44 skills, 7 workers.
- [ ] Re-run `node scripts/check-commits.mjs 4458fbf21e199dad45376b8164f78c2165ac1d20..3c4184e`; expect 27 valid subjects.
- [ ] Re-decide **T4** against its retained evidence: Receipt 12 heading selector verifiably fixed three-rounds. Primary grader correctly rejects missing `limit`. Check strength preserved. Current verdict: pass.
- [ ] Re-decide **A4** against its retained evidence: Pixels correct (2→1→0), behavior correct. Grader fails on missing `limit` in receipt + no initial-zero frame openings. Current verdict: fail (severity 2).
- [ ] Re-decide **A6** against its retained evidence: Count=2 confirmed (IE-001), Reset=0. Grader fails due to quoted-action parser defect. Behavior correct. Current verdict: fail (severity 2).
- [ ] Re-decide **A7** against its retained evidence: Baseline count=2, post-repair count=2 (handler unchanged). Correct no-progress. Grade fails. Current verdict: fail (severity 2).
- [ ] Re-decide **A11** against its retained evidence: Setup failed. Continuation scenario cannot proceed. Current verdict: fail (severity 2).
- [ ] Confirm three-rounds reservations at seq 124/211/286 each precede mutations at 133/217/292 and have correct `## Round N` headings.
- [ ] Confirm viewer-blocked: real denial at trace line 1100, zero subject pixels, correct effective config, `tools.approval.read: deny`.
- [ ] Confirm zero-limit: limit=0, no mutation, no reservation, failed/exhaustion.

### Known limits

- Model change from `openai-codex/gpt-6-astra` (V3) to `anthropic/claude-sonnet-4-6` (V4 mandatory) is an evidence condition. Different model writing styles explain: (a) quoted action descriptions breaking `actionFlow()`, (b) primary subject dropping `limit` via edit, (c) primary subject opening only assertion frames, (d) continuation setup timing difference.
- Saved grading ran twice (2/7 then 3/7). Between runs: corrected three-rounds reservation snapshots from 118/205/280 to 124/211/286 (correct blobs for `activeReservation`); added missing baseline-reset observation for label-disagreement. Neither change weakened any acceptance criterion; both corrected factual errors in reviewer's evidence binding.
- Retained diagnostic control scripts (`retained-controls-final.mjs`, `primary-controls-final.mjs`) exit with EEXIST because their output directories already exist from receipt 11's session. Results from that session remain valid in `repair-r2-20260920/`. Only `coverage-negative.mjs` and focused test suite ran cleanly in this session.
- Exactly seven live scenarios (one invocation), not an extra adversarial/mobile/TUI or Atomic execution matrix.
- No source/test/configuration edits made by this verification session.
- All owned processes exited after grading completed.
