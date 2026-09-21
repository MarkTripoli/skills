---
task: i-want-do-something
type: implementation
summary: "R5 fixes F1/F2/F3 from V4 verification (HEAD 3c4184e, 3/7). F1: SKILL.md and template now explicitly require frontmatter append/update-only (retain all fields including type and limit) and per-session initial-zero frame inspection. F2: actionFlow() strips matching surrounding quotes so Click 'Add one' once resolves correctly; 3 regression tests added. F3: continuation pause predicate uses filename pattern plus activeReservation instead of newest(type), fixing the false-invalid caused by missing type field. Control scripts made re-runnable. Live run evals/results/20260920-133315: label-disagreement passes (1/4); three remaining failures are subject behavior — primary reservation Delivery section uses semicolons not slashes preventing activeReservation(pendingRepair=true), no-progress leaves app.js uncommitted (git dirty), continuation answer lacks markdown receipt link and guardrails IE-001 row shadows findings row."
status: complete
revision: 39c3a66
target: origin/main 4458fbf
---

# R5 Implementation

## Changes

### Source commit `39c3a66`

**F1 — Frontmatter append-only + initial-zero frame (SKILL.md, template)**

- `skills/delivery/iterate-evidence/SKILL.md`:
  - Step 3: added requirement to open the initial application state before the first action as a separately named frame for each recording session, in addition to per-flow action frames.
  - Step 3 completion check: extended to include initial-zero frame alongside per-flow individual frames.
  - Step 4.1: replaced "retain the authorized `limit`" with explicit append/update-only rule: "update only `status`, `stop_reason`, and `consumed_rounds`; retain all other frontmatter fields unchanged and present, including `type`, `limit`, `task`, `branch`, and `current_application_revision`. Never remove, replace, or collapse existing fields."
  - Step 4.4: extended to include "the initial-zero state frame before the first action as a separately named viewer call."

- `skills/delivery/iterate-evidence/references/evidence_iteration_template.md`:
  - Added "Frontmatter is append/update-only" block explicitly forbidding removal of any field at reservation time.
  - Added "Initial-zero frame per session" block requiring a pre-action initial state frame per recording session.

**F2 — Quoted action labels (evidence-flows.mjs, evidence-flows.test.mjs)**

- `evals/evidence-flows.mjs`: `actionFlow()` now strips matching surrounding single, double, or backtick quotes from the label after verb and "once" removal. `Click "Add one" once`, `Click 'Reset'`, and backtick variants now resolve to the same flows as unquoted forms.
- `tests/evidence-flows.test.mjs`: Added `quoted action labels resolve to the same flows as unquoted` test per scenario (disagreement, zeroLimit, noProgress) covering all three quote styles, mixed (one quoted/one not), Activate verb, unknown quoted label (correctly stays unresolved), and mismatched quotes (correctly stays unresolved).

**F3 — Structural continuation pause + re-runnable control scripts**

- `evals/iterate-evidence.mjs`: Pause watcher now finds the receipt by filename pattern (`/^\d{2}-evidence-iteration-[a-z0-9-]+\.md$/`) rather than `newest(..., "evidence-iteration")` which required `type: evidence-iteration` in frontmatter. Validation uses `activeReservation(text, 1, 3, "IE-001")` — the same structural predicate the grader uses — so a missing type field no longer causes false-invalid.
- `evals/results/repair-r2-20260920/primary-controls-final.mjs` and `retained-controls-final.mjs`: Accept an optional output directory as `process.argv[2]`; fall back to creating their default directory only if it doesn't exist. Resolves EEXIST on re-run. Assertions unchanged.

**Changeset**: `.changeset/iterate-evidence-r5.md` — patch for `@marktripoli/skills`.

## Live run

Single invocation: `npm run evals -- iterate-evidence iterate-evidence-no-progress iterate-evidence-label-disagreement iterate-evidence-continuation --model anthropic/claude-sonnet-4-6 --keep --max-time 25`

Run: `evals/results/20260920-133315/`

### Scenario outcomes

| Scenario | F fixed | Saved grade | Remaining failure and cause |
|---|---|---|---|
| iterate-evidence | F1 | **fail** | Subject's Delivery section "Current step / last completed step / next incomplete step" uses semicolons/colons (not "/" separators) between step names → `activeReservation(pendingRepair=true)` `parts.split("/")` gets length=1≠3 → push(false) → fails. Also subject now correctly retains `limit: 3` and `type: evidence-iteration`. Initial-zero frames opened for both sessions. |
| iterate-evidence-label-disagreement | F2 | **pass** | F2 fix resolved the quoted-action parser defect. |
| iterate-evidence-no-progress | F2 | **fail** | Subject left `app.js` uncommitted (git dirty: M app.js) after the bounded worker edit. git-final.json shows `dirty: "M app.js"`. No source commit for the worker change. |
| iterate-evidence-continuation | F3 | **fail** | (1) Pause: `valid: True` — F3 fixed. (2) Answer: subject uses backtick path not markdown link `[text](path)` for receipt → "reply: must link the receipt without a handoff fence". (3) Grader picks last IE-001 row from receipt which is in Guardrails table (no "resolved" cell) not Findings table row (which correctly shows resolved). |

Saved grade: **1/4**. Label-disagreement passes. Three remaining failures are subject behavior defects not caused by the R5 fixes.

### Independent reviews

All four review.json files written after opening retained frames:

- **Primary**: baseline-initial=0 (line 2678), baseline-increment=2 (line 2757), repaired-initial=0 (line 7036), repaired-increment=1 (line 7089), repaired-reset=0 (line 7173). Reservation at seq=106. Review accepted but reservation snapshot check fails due to subject's Delivery section format.
- **Label-disagreement**: baseline-increment=2 (line 1345), baseline-reset=0 (line 2796). Passed labels on frames 03/06 confirmed contradicted by pixels. IE-001 stable. Saved grade passes.
- **No-progress**: baseline-increment=2 (pass 0, line 2338), round1-increment=2 (pass 1, line 5841), both resets=0. Worker changed only `unusedIncrement`; handler unchanged. No-progress correct. Review accepted but git dirty failure remains.
- **Continuation**: interrupted baseline-increment=2 (line 1580), main post-repair-increment=1 (line 1804), post-repair-reset=0 (line 1962). Pause valid (F3 fixed). Review accepted but reply link and IE-001 resolution failures remain.

## Gates

| Command | Result |
|---|---|
| `npm test` | 183/183 pass (3 new quoted-label tests) |
| `npm run build -- --runtime oh-my-pi` | 44 skills, 7 workers |
| `node scripts/check-commits.mjs 4458fbf..HEAD` | ok: 29 subjects |
| `node scripts/sync-plugin.mjs --check` | plugin in sync (3.1.0, 37 skills, 7 agents) |

## Known limits

- Three of four scenarios still fail due to subject behavior defects not caused by R5 fixes. No reroll was performed.
- The primary scenario's `activeReservation(pendingRepair=true)` failure on the Delivery section format is a Sonnet 4.6 behavior issue: the subject used semicolons/colons between step names instead of "/" separator. The guidance fix (F1) addresses the frontmatter field retention issue but not the step-declaration format convention. A future run may use the correct format.
- The no-progress git dirty failure requires the subject to commit or stage the worker's app.js change before writing the receipt commit. Subject guidance could be clearer about source commits.
- The continuation reply link failure: the passed-answer template already instructs "start with its artifact link" — but Sonnet 4.6 formats as backtick-quoted path rather than markdown `[name](path)` link. Answer template could be more explicit.
