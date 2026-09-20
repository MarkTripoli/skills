---
task: i-want-do-something
type: implementation
summary: "R8 fixes F4 (initial frame timing binding before first click), F5 (reservation step recognition), and three-rounds minimum budget (minMinutes:45)."
round: R8
revision: c29fd37
fixes: F4 F5 three-rounds-budget
---

# R8 Implementation Receipt

## Source commit

`c29fd37` — fix(iterate-evidence): initial frame binding, reservation step, budget

## Changes

### F4 — initial-frame structural binding

- `evals/fixtures/iterate-evidence/capture.mjs`: added `await page.waitForTimeout(1000)` after `mark("initial")` before the first click, ensuring at least one clean video frame at counter=0 is encoded at the initial marker time.
- `evals/fixtures/iterate-evidence-three-rounds/capture.mjs`: same addition.
- `skills/delivery/iterate-evidence/SKILL.md` step 3 and step 4: require extracting the initial-zero frame at the manifest's `initial` action `videoTime` (from `capture.json` actions array) using an explicit timestamp selector (e.g. `read video.webm:Ts`); forbid using the recorder-generated `test_start` frame as the initial-zero frame; require the filename to include `initial` and cite the timestamp.
- `skills/delivery/iterate-evidence/references/inspection_acceptance.md`: added `Initial-state frame` bullet under timing rules requiring extraction strictly before the first click action's `videoTime`.
- `evals/iterate-evidence.mjs` (`reviewProblems`): added two checks for `baseline-initial` and `repaired-initial` flows: (a) frame filename basename must contain `initial`; (b) when `capture.actions` is present, `rawTimestamp` must be strictly less than the first non-initial action's `videoTime`.
- `tests/evals.test.mjs`: added F4 regression — non-initial filename (e.g. `01-test-start.png`) rejected; timestamp at first-click videoTime rejected.

### F5 — reservation step recognition

- `evals/iterate-evidence.mjs` (`activeReservation`): individual `current step` handler now accepts `clean(value) === "reservation"` in addition to `pending(value)`; three-way combined-key handler accepts `clean(parts[0]) === "reservation"` when `pending(parts[2])` (next incomplete step is repair).
- `tests/evals.test.mjs`: added accepted forms — three-labeled-line `Current step: reservation / Last completed step: baseline inspection / Next incomplete step: repair` and combined slash form; added rejected forms — `reservation` with `checks` or `capture` as next step.

### Three-rounds minimum budget

- `evals/scenarios/iterate-evidence-three-rounds.mjs`: added `minMinutes: 45`.
- `evals/run.mjs`: computes `Math.max(maxMinutes, scenario.minMinutes ?? 0)` before passing to `runEvidenceScenario`.
- `docs/testing.md`: documents `minMinutes` field and the three-rounds 45-minute requirement.
- `.changeset/iterate-evidence-r8.md`: created.

## Offline verification

- `npm test`: 184/184 pass, 0 fail, 0 skip (includes new F4/F5 regressions).
- `node scripts/sync-plugin.mjs --check`: plugin in sync (3.1.0, 37 skills, 7 agents).
- `node scripts/check-commits.mjs 4458fbf..HEAD`: ok: 36 subjects.

## Live eval

Single run: `npm run evals -- iterate-evidence iterate-evidence-three-rounds --model anthropic/claude-sonnet-4-6 --keep --max-time 25`

- Result directory: `evals/results/20260920-163308/`
- Both scenarios exited code=0 from OMP (pending review gate only).
- `iterate-evidence`: subject named initial frames `initial-state-0.234s.png` and `initial-state-0.319s.png` (both contain "initial"; timestamps 0.234s and 0.319s are strictly before first click at 2.361s and 2.451s respectively). Baseline: initial=0, increment=2 (IE-001). Round1: initial=0, increment=1 (IE-001 resolved), reset=0. Receipt: passed/success/consumed=1/limit=3.
- `iterate-evidence-three-rounds`: three-rounds ran with effective 45-minute budget (max(25,45)). All 37 frames opened across 4 sessions (9 per session incl. initial). Baseline: A=B=C=D=2, all resets=0. R1 (A fixed): A=1, B=C=D=2. R2 (B fixed): A=B=1, C=D=2. R3 (C fixed): A=B=C=1, D=2. IE-004 (D) open at consumed=3/3. Receipt: failed/exhaustion. Subject committed source and receipt separately.

## Independent pixel review

Opened retained frames from `evals/results/20260920-163308/` directly:

Primary:
- `baseline/frames/initial-state-0.234s.png`: **0** (pre-click, counter at zero) ✓
- `baseline/frames/increment-state-2.361s.png`: **2** (defective, expected 1) ✓
- `round1/frames/initial-state-0.319s.png`: **0** (pre-click at repaired revision) ✓
- `round1/frames/increment-state-2.451s.png`: **1** (repaired, IE-001 resolved) ✓
- `round1/frames/reset-state-4.590s.png`: **0** (Reset from 1 returns to 0) ✓

Three-rounds: OMP resized all 32 increment/reset frame PNGs to WebP; both original PNGs and WebP trace images inspected. Progression: A=2→1, B=2→2→1, C=2→2→2→1, D=2 throughout. All resets=0 across all passes. F4 initial state (00-initial-state-X.png) shows A=B=C=D=0 in each pass.

## Saved grade

`npm run evals -- iterate-evidence iterate-evidence-three-rounds --grade evals/results/20260920-163308`

Result: **2/2 scenarios passed**.

- `iterate-evidence`: ok
- `iterate-evidence-three-rounds`: ok
