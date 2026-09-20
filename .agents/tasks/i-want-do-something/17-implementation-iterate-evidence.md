---
task: i-want-do-something
type: implementation
summary: "R9 fixes F_PRIM (activeReservation structural rule), F_CONT (uniform frame identity: PNG path or video+timestamp both valid), and R16 receipt frontmatter. All offline checks pass (184/184). Live eval 2/2 passed (primary and continuation) after independent pixel review."
round: R9
revision: d889a9b
fixes: F_PRIM F_CONT R16-frontmatter
---

# R9 Implementation Receipt

## Source commits

- `d889a9b` — fix(iterate-evidence): structural reservation rule and frame identity
- `7dfd0fb` — docs(task): evidence-iteration artifact (receipt 16 frontmatter)

## Changes

### F_PRIM — structural reservation rule

`evals/iterate-evidence.mjs` (`activeReservation`):

- Added `terminalRepair(value)` helper: true when the value says repair is completed/done/resolved/finalized/terminal.
- Changed "current step" handler from `pending(v) || clean(v) === "reservation"` to `terminalRepair(v) ? false : pending(v) || /\breserv(?:ation|ed)\b/.test(clean(v))`. Current step now accepts any reservation/reserved/pending/repair-pending wording; only a terminal repair declaration conflicts.
- Changed three-way combined slash handler from `(pending(parts[0]) || (clean(parts[0]) === "reservation" && pending(parts[2]))) && reserved(parts[1])` to `!terminalRepair(parts[0]) && pending(parts[2]) && reserved(parts[1])`. The anchor is now the next incomplete step (parts[2]); current step (parts[0]) may be any non-terminal wording. The combined line never pushes false when three labeled lines are present and consistent; when only the combined line exists, parse by position.
- Removed one prior `pendingStates` entry ("reserved repair / baseline inspection / app.js and check.mjs edits") whose next-incomplete-step was not repair — correctly no longer accepted under the structural rule.

`tests/evals.test.mjs` new positive cases: "reservation persisted / reservation / repair" combined, "reserved" as current step, "reservation persisted" as current step with three labeled lines. New negative cases: "repair completed" in current step even when next=repair, "repair completed" in combined three-way line's current position, "| Repair | done |" table row, "repair resolved" in Delivery section.

### F_CONT — uniform frame identity

`evals/iterate-evidence.mjs` (`reviewProblems`, `boundedEvidenceProblems`, `stoppedEvidenceProblems`):

- Frame identity now accepts either a retained PNG/JPEG path or a video path with an explicit timestamp selector in all three graders.
- For the PNG form: file SHA-256 must equal `item.frameSha256` (unchanged behavior).
- For the video form: the video file SHA-256 must equal `capture.videoSha256` (proves retained capture); `image.sha256` from the trace must equal `item.frameSha256` (A9 seconds-selector provenance).
- For non-initial video frames: `item.timestamp` must be at or after the flow's action `videoTime` (action window check).
- For initial video frames: filename check skipped (no "initial" in video filename); existing `rawTimestamp < firstClickAction.videoTime` check applies.
- `reviewSchema`, `stoppedReviewSchema`, `boundedReviewGuide` descriptions updated to document both forms.

`skills/delivery/iterate-evidence/SKILL.md` step 3: added frame identity paragraph documenting both forms and binding rules for non-initial and initial flows.

`skills/delivery/iterate-evidence/references/inspection_acceptance.md`: added **Frame identity** paragraph documenting both forms, hash binding, and timing requirements.

`tests/evals.test.mjs` new cases: video+timestamp form passes; wrong `frameSha256` fails; video initial at/after first click fails; video non-initial before action window fails; video non-initial at/after action window passes.

### R16 frontmatter fix

`.agents/tasks/i-want-do-something/16-implementation-iterate-evidence.md`: added `task: i-want-do-something`, `type: implementation`, and `summary` fields per receipt conventions.

## Offline verification

- `npm test`: 184/184 pass, 0 fail (pre-existing flaky jev-ui-native test passed this run).
- `node scripts/sync-plugin.mjs --check`: plugin in sync (3.1.0, 37 skills, 7 agents).
- `node scripts/check-commits.mjs 4458fbf..HEAD`: ok: 40 subjects.

## Live eval

Single run: `npm run evals -- iterate-evidence iterate-evidence-continuation --model anthropic/claude-sonnet-4-6 --keep --max-time 25`

Result directory: `evals/results/20260920-183657/`

Both scenarios exited pending independent review. After opening retained frames:

### Primary (iterate-evidence)

- Baseline-initial (L2676, 0.318s): **0** — pre-click confirmed (before increment at 2.456s)
- Baseline-increment (L2736, 2.6s): **2** — defective, IE-001 confirmed
- Repaired-initial (L6623, 0.299s): **0** — pre-click at repaired revision (same pixel hash as baseline-initial)
- Repaired-increment (L6657, 2.6s): **1** — repaired, IE-001 resolved
- Repaired-reset (L6692, 4.7s): **0** — reset from 1 confirmed

Reservation at snap seq=115 (snapshots/000115-tool_execution_end.json) precedes first app.js mutation at seq=121. Receipt at seq=115: consumed_rounds=1, in-progress, "Repair pending / baseline inspection / Repair" — structural rule accepts this. ✓

### Continuation (iterate-evidence-continuation)

Pass=0 (baseline, interrupted session):
- Increment (L3172 interrupted, 2.414s): **2** — defective baseline
- Reset (L3286 interrupted, 4.536s): **0** — baseline reset

Pass=1 (round1, main continuation session):
- Increment (L2380 main, 2.452s): **1** — repaired
- Reset (L2432 main, 4.576s): **0** — reset from 1

Reservation at interrupted seq=121 (snapshots/000121-tool_execution_end.json) precedes first app.js mutation at interrupted seq=139. Baseline-increment opening at interrupted seq=106 precedes reservation. Round 1 step: "repair pending / baseline inspection / repair" — structural rule accepts this. ✓

## Saved grade

`npm run evals -- iterate-evidence iterate-evidence-continuation --grade evals/results/20260920-183657`

Result: **2/2 scenarios passed**.

- `iterate-evidence`: ok
- `iterate-evidence-continuation`: ok
