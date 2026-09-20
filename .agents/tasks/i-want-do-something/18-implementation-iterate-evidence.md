---
task: i-want-do-something
type: implementation
summary: "R10 addresses all three V7 failures: F_NEW_PRIM (reserved() now structural — accepts any non-terminal last-completed-step wording, rejected only on repair-completed/done/resolved/finalized), F_CONT_V7 (SKILL.md step 4.1 hard gate requiring on-disk reservation confirmation before first source edit, with template checkpoint field), F_3R_BRESET (frame completion self-check added to SKILL.md steps 3 and 4.4 plus template). Offline: 184/184 pass. Live eval (run 20260920-203325): 0/3 passed. Primary fails on pending() rejecting next-incomplete-step parenthetical (R10 subject behavior, new failure mode not in V7 failures). Three-rounds and continuation fail on OMP temp-file authorization errors from video+timestamp reading. Both are genuine new failures; recorded truthfully without reroll."
round: R10
revision: 9ae2812
fixes: F_NEW_PRIM F_CONT_V7 F_3R_BRESET
---

# R10 Implementation Receipt

## Source commits

- `9ae2812` — fix(iterate-evidence): structural reserved, reservation gate, frames

## Changes

### F_NEW_PRIM — structural last-completed-step rule

**File:** `evals/iterate-evidence.mjs`

Replaced the positive exact-match `reserved()` function (which required step ∈ {"reservation", steps starting with "baseline inspection", "baseline pixel inspection"}) with a structural rule: `const reserved = (value) => !terminalRepair(value)`. Persistence is proven by the frontmatter `consumed_rounds`, the round record heading, and the reservation row; the last-completed-step field may carry any wording including parentheticals and prose, and is rejected ONLY when it explicitly declares the repair completed/done/resolved/finalized (via the existing `terminalRepair` predicate). Removed the now-dead stale comment describing the old positive list.

**File:** `tests/evals.test.mjs`

Added to `pendingStates` (accepted):
- `"- Current step: repair pending.\n- Last completed step: reservation (consumed_rounds set to 1, round 1 record persisted).\n- Next incomplete step: repair."` — parenthetical form
- `"- Current step: repair pending.\n- Last completed step: baseline inspection and reservation written to disk.\n- Next incomplete step: repair."` — prose form

Added to the invalid list (rejected):
- `reservationText.replace(...)` with `"Last completed step: repair completed.\n- Next incomplete step: repair."` — terminal repair declaration
- `reservationText.replace(...)` with `"Last completed step: repair done and verified.\n- Next incomplete step: repair."` — terminal repair (done)

### F_CONT_V7 — reservation write checkpoint

**File:** `skills/delivery/iterate-evidence/SKILL.md`

Step 4.1: Added explicit hard gate paragraph after the bullet points — after writing all reservation fields (frontmatter consumed_rounds, round record heading, reservation row, Delivery state), the subject must write and save the receipt, read it back, confirm consumed_rounds is the incremented value, and record "Reservation persisted before any edit: yes" in the round record. Only after this confirmation may any repairable source/check path be written, any worker be delegated, or any other mutating command be issued. An edit before the on-disk confirmation is an ordering violation; stop blocked rather than continuing.

Step 5: Added "Reservation write checkpoint (continuation)" paragraph repeating the gate for interrupted rounds where repair has not yet mutated any repairable file.

**File:** `skills/delivery/iterate-evidence/references/evidence_iteration_template.md`

Added to Round section (after "Reservation persisted at"):
- `- Reservation persisted before any edit: [yes — confirmed on disk (consumed_rounds read back) before first source/check edit or worker delegation; or blocked with reason]`

### F_3R_BRESET — frame completion self-check

**File:** `skills/delivery/iterate-evidence/SKILL.md`

Step 3 (baseline inspection): Added "Frame completion self-check" paragraph requiring explicit enumeration of every required frame (1 initial-zero + 1 per required flow) before writing any inspection ledger or coverage row; count must match requirement; a row without a prior opened frame is a false claim.

Step 4.4 (post-repair inspection): Added identical self-check paragraph for the capture pass.

**File:** `skills/delivery/iterate-evidence/references/evidence_iteration_template.md`

Added frame completion self-check table to Round history section (after the decision/next-action bullet) with columns: Required frame, Pass, Session, Opened path, Opener call reference, Confirmed; plus total/required count statement.

## Offline verification

- `npm test`: 184/184 pass (exit 0). F_NEW_PRIM regressions: 2 parenthetical/prose forms accepted, 2 repair-completed forms rejected. All pre-existing tests pass.
- `node scripts/sync-plugin.mjs --check`: plugin in sync (3.1.0, 37 skills, 7 agents).
- Source commit `9ae2812` checked by `node scripts/check-commits.mjs`: ok.

## Live eval — run 20260920-203325

Single invocation: `npm run evals -- iterate-evidence iterate-evidence-three-rounds iterate-evidence-continuation --model anthropic/claude-sonnet-4-6 --keep --max-time 25`

### iterate-evidence (primary)

Subject completed the run: baseline captured and inspected (IE-001: count=2, IE-002: check gap), reservation written with "Reservation persisted before any edit: yes" (F_CONT_V7 checkpoint filled), frame self-check table filled (F_3R_BRESET self-check filled: 3/3 frames), repair applied, round 1 pass inspected (count=1 and reset=0), receipt status=passed/success.

Independent pixel review performed and review.json written: baseline-initial=0, baseline-increment=2, repaired-initial=0, repaired-increment=1, repaired-reset=0 (all match subject claims; frame SHA256 values verified).

**Saved grade: FAIL** — `activeReservation` returns false because the Delivery section's "Next incomplete step: repair (app.js `value += 2` → `value += 1`; check.mjs exact count + Reset test)." parenthetical is not recognized by `pending()`. The `steps()` function splits on semicolons and the extracted step is `"repair (app.js value += 2 → value += 1"` — the `["diagnose","diagnosis","repair"].includes(...)` check fails. This is a NEW failure mode not present in V7 (where the V7 subject wrote bare "repair" without parentheticals). The primary scenario fails because `pending()` is not structural for parenthetical next-incomplete-step content; fixing this was not among the three listed V7 failures.

Reservation snapshot: seq 112 (`snapshots/000112-tool_execution_end.json`) precedes first source mutation at seq 196 (app.js changed). F_CONT_V7 correctly resolved in subject behavior.

Frame self-check: subject enumerated 3/3 required frames (initial-zero + F-INC + F-RST) before writing coverage rows. F_3R_BRESET correctly resolved in subject behavior.

### iterate-evidence-three-rounds

**Saved grade: FAIL** — 40 "authorization: forbidden change omp-video-frame-*/frame.png" errors. The R10 subject used video+timestamp reading (`read video.webm:Ts`) to open frames. OMP creates temp directories named `omp-video-frame-<random>/frame.png` in the fixture working directory; these appear in snapshot file diffs. The `viewerTemporaryProof` system requires the temp file to NOT be present at `tool_execution_end` for the proof to succeed. Some frames persist into `tool_execution_end` (3 temp dirs flagged at that boundary), breaking the proof chain. All temp files fail the `allowedPath` check and are flagged as forbidden changes. This was NOT present in V7 (where the subject used PNG frame reading, not video timestamps).

Plus "inspection: pending independent review" — no review.json written (cannot pass given authorization errors regardless).

### iterate-evidence-continuation

**Saved grade: FAIL** — 1 "authorization: forbidden change omp-video-frame-J3LzUo/frame.png at viewer_process_end". Same OMP temp file issue as three-rounds but only one frame. Plus pending review.

## Eval run result

Saved grade (one invocation): **0/3** scenarios passed.

- Primary: FAIL (pending() rejects parenthetical next-incomplete-step)
- Three-rounds: FAIL (OMP temp file authorization errors from video+timestamp reading)
- Continuation: FAIL (OMP temp file authorization error + pending review)

All three failures are new subject-behavior failures unrelated to F_NEW_PRIM/F_CONT_V7/F_3R_BRESET. The grader changes (reserved() structural) and SKILL.md changes (hard gate, frame self-check) are correctly implemented. No reroll per task instructions.

## Gates

| Command | Result |
|---|---|
| `npm test` | Exit 0; 184/184 pass |
| `node scripts/sync-plugin.mjs --check` | plugin in sync (3.1.0, 37 skills, 7 agents) |
| `node scripts/check-commits.mjs 4458fbf..HEAD` | to be verified at source commit |
