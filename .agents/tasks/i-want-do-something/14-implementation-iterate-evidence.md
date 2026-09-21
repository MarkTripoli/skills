---
task: i-want-do-something
type: implementation
summary: "R6 fixes four structural defects from R5 (source commit 1481297). (1) activeReservation no longer pushes false for combined step key when parts.length===1; labeled sub-lines handle it. Template Delivery section uses three explicit labeled lines as canonical form. Regressions added for semicolon form and three-labeled-line form. (2) Continuation scenario check scopes IE-001 resolution to the Findings section only; Guardrails rows cannot shadow it. Regression added for guardrail shadow case. (3) Answer templates changed to markdown link form [{artifact_file}]({artifact_link}); SKILL.md terminal delivery section forbids bare/backtick paths. (4) SKILL.md step 4.2 requires committing delegated source changes as a separate source commit before receipt commit. Live run evals/results/20260920-141647: iterate-evidence and iterate-evidence-no-progress pass (2/3); iterate-evidence-continuation fails — subject used status:completed (not in canonical set) and prose stop_reason instead of success, no markdown link in answer."
status: complete
revision: 1481297
target: origin/main 4458fbf
---

# R6 Implementation

## Changes (source commit `1481297`)

### Fix 1: activeReservation — labeled-line form (`evals/iterate-evidence.mjs`)

The combined `"current step / last completed step / next incomplete step"` handler previously pushed `false` when `parts.length !== 3`. This caused failure when subjects wrote the three values as a semicolon/colon-separated single line, because the split pattern already extracts `"last completed:"` and `"next incomplete:"` as separate sub-lines handled by the individual key handlers — and the combined key handler then pushed `false` on top, overriding the individual true declarations.

Fix: when `parts.length !== 3`, the combined key handler no longer pushes anything. The individual key handlers (`"current step"`, `"last completed step"`, `"next incomplete step"`) validate the sub-lines.

Template `Delivery and known limits` section (evidence_iteration_template.md) changed from the combined single line to three explicit labeled lines:
```
- Current step: [repair pending / ...]
- Last completed step: [reservation / baseline inspection / ...]
- Next incomplete step: [repair / ...]
```

SKILL.md finalization section updated to reference three labeled lines as canonical.

Regressions added in `tests/evals.test.mjs`:
- Semicolon/colon-separated form (`"reservation complete; last completed: reservation; next incomplete: Repair"`) now passes via labeled sub-lines
- Three explicit labeled lines (`"- Current step: repair pending\n- Last completed step: reservation\n- Next incomplete step: repair"`) passes

### Fix 2: Findings-only IE-001 resolution (`evals/scenarios/iterate-evidence-continuation.mjs`)

Continuation check now imports `section` from `../lib.mjs` and scopes findings lookup to `## Findings` section only. Guardrail table rows that mention IE-001 (e.g., to document the strengthened check) no longer shadow a resolved Findings table row.

Regression in `tests/evidence-flows.test.mjs`: three cases cover (a) Findings resolved + Guardrails IE-001 mention → passes, (b) Findings open + Guardrails mention "resolved" → fails, (c) only Guardrails row → fails.

### Fix 3: Answer templates — markdown link form

`evidence_iteration_passed_answer.md` and `evidence_iteration_stopped_answer.md` line 1 changed from `Artifact saved: {artifact_link}` to `[{artifact_file}]({artifact_link})`. SKILL.md terminal delivery section explicitly states the first line must be a markdown link `[NN-evidence-iteration-<slug>.md](path)`, never a bare or backtick-wrapped path.

### Fix 4: Delegated source commit requirement (SKILL.md)

Step 4.2 now explicitly requires: "When a worker (or any delegated actor) makes source changes, commit those changes as a dedicated source commit — even when the round yields no progress — before writing the receipt commit. Do not leave tracked source files uncommitted at the end of a round."

The terminal delivery section also states "commit delegated source changes before the receipt commit."

### Changeset

`.changeset/iterate-evidence-r6.md` — patch for `@marktripoli/skills`.

## Live run `evals/results/20260920-141647` — 2/3

Single invocation: `npm run evals -- iterate-evidence iterate-evidence-no-progress iterate-evidence-continuation --model anthropic/claude-sonnet-4-6 --keep --max-time 25`

| Scenario | Grade | Notes |
|---|---|---|
| iterate-evidence | **pass** | Fix 1 effective: primary receipt uses three labeled lines in Delivery section; activeReservation(pendingRepair=true) passes at seq=115. Reservation (Current step: repair pending / Last completed: baseline inspection / Next incomplete: repair) passes structural check. 6 frames opened including initial-zero for both sessions. |
| iterate-evidence-no-progress | **pass** | Fix 4 effective: subject committed app.js as a separate source commit (74a763f) before receipt commit. git-final.json shows dirty:''. Reservation at seq=112. Post-repair count=2 confirmed (handler unchanged). stop_reason=no-progress correct. |
| iterate-evidence-continuation | **fail** | Subject used `status: completed` (not in canonical set `in-progress/passed/blocked/failed`) and prose `stop_reason` instead of `"success"`. Reply uses backtick path not markdown link form. Fix 3 (answer template change) did not prevent subject from writing a custom answer outside the template. Pause was `valid: True` (F3 still working). IE-001 actually resolved by pixels (count=1 at post-repair). |

Saved grade: **2/3**. Primary and no-progress pass. Continuation fails due to subject behavior: non-canonical status/stop_reason values and custom answer not following template.

### Independent reviews

All three review.json written after viewing frames:
- **Primary**: baseline-initial=0 (line 2822), baseline-increment=2 (line 2938), repaired-initial=0 (line 6854), repaired-increment=1 (line 6956), repaired-reset=0 (line 7070). Reservation seq=115 with canonical labeled-line form.
- **No-progress**: baseline-increment=2 (line 1303), post-repair-increment=2 (line 8036), both resets=0. Reservation seq=112. Source committed separately.
- **Continuation**: baseline-increment=2 (line 3460, interrupted), post-repair-increment=1 (line 992, main), both resets=0. Reservation seq=115 (interrupted). Grader failures are status/stop_reason/reply defects, not pixel defects.

## Gates

| Command | Result |
|---|---|
| `npm test` | 184/184 pass (1 new continuation Findings-scoping test) |
| `npm run build -- --runtime oh-my-pi` | 44 skills, 7 workers |
| `node scripts/check-commits.mjs 4458fbf..HEAD` | ok: 31 subjects |
| `node scripts/sync-plugin.mjs --check` | plugin in sync (3.1.0, 37 skills, 7 agents) |

## Known limits

- Continuation scenario still fails due to subject using non-canonical `status: completed` and prose `stop_reason`. The canonical allowed values (`in-progress`, `passed`, `blocked`, `failed`) and `stop_reason` values (`none`, `success`, `blocker`, `no-progress`, `exhaustion`) are documented in the template preamble. The skill and template do not enumerate them as an explicit list in the terminal delivery section — adding them may help future runs.
- The markdown link template fix ([{artifact_file}]({artifact_link})) did not prevent the continuation subject from writing a custom "Round 1 complete. Here is the terminal answer:" preamble that doesn't match the template. The subject appears to have written its own summary rather than filling the template. Stronger instruction that the ANSWER must be from the template (not a custom preamble) may help.
- No reroll was performed.
