---
type: code-review-fixes
date: 2026-09-18
branch: herdr-plugin-delivery-flow
review_artifact: .agents/tasks/steer-every-archon-gate/27-code-review-steer-every-archon-gate.md
reviewed_head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd
fixed_head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd
status: complete
summary: "Fixed the three major findings from review 27 (CR-401 to CR-403) and all five advisories. `herd-next/SKILL.md` now closes the pane and prints the skipped reply when an agent stays blocked past its readiness wait, in both handoff and gate mode, instead of claiming a submission that never happened. `deliver_archon_answer.md` gained the `is running` variant its sibling template already had, plus the working_path slot rename ADV-403 asked for. `deliver/SKILL.md`'s stop path now runs `archon workflow cancel` before `abandon` and names the step-4 dispatch process as something the stop must also end. `npm test` (71/71), `node scripts/validate.mjs`, and `node scripts/check-commits.mjs` all exit 0 against the current worktree."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: none. `git merge-base origin/main HEAD` is still `ef969cddee3ae80975a5d2665ea501b8a329a95f` and `git rev-parse HEAD` is still `89ea95e75c8691136557826fa24f64b08ac80ecd`, matching the review's frontmatter exactly.
- unrelated changes preserved: yes. Only the files CR-401, CR-402, CR-403, ADV-401, ADV-403, ADV-404, and ADV-405 name were touched; the round-21/23/25 fixes already sitting in the working tree (`.gitignore`, `judge.mjs`, `stop_hook.sh`, the epic and ended-answer templates, the task artifacts) are untouched.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-401

- disposition: fixed
- evidence: `herd-next/SKILL.md` step 7's `agent_not_ready` paragraph now reads: a failed wait (the 30-second timeout, or the agent settling on `blocked`) closes the pane with `herdr pane close "$pane"` and prints `references/herd_next_skipped_answer.md` with the reason `the agent in the new pane is still blocked`, then stops, before either `herd_next_answer.md` or `herd_next_gate_answer.md` is reached. The Archon gate-mode paragraph (formerly line 118) now says it reuses step 7's still-blocked branch, including the close-and-skip step, rather than "report a still-blocked agent in the reply" with no template slot for it. This is the review's own "cheapest shape" fix direction: `herd_next_skipped_answer.md` opens `No pane was opened: <reason>.`, so `deliver/SKILL.md:54`'s existing fallback trigger (keyed on that exact opener) now fires correctly for a still-blocked agent without any change to `deliver/SKILL.md` or either answer template.
- files changed: `skills/delivery/herd-next/SKILL.md`
- regression check: `node --test tests/steward.test.mjs` (7/7 pass, unchanged); `grep -c 'herdr pane close' skills/delivery/herd-next/SKILL.md` returns 1, confirming the new call is present once; read both edited paragraphs back in full to confirm neither still says "report... in the reply" with no matching template slot.

### CR-402

- disposition: fixed
- evidence: `deliver_archon_answer.md:9`'s run-line slot gained `or `is running`, followed by the gate it will pause at first`, matching the shape `herd_next_gate_answer.md:1`'s sibling variant uses. Line 12 ("Pauses still ahead") now reads every gate the run keeps when it is still `is running` and has not paused yet, since there is no current gate to exclude from the list, alongside the original "after the current one" reading for a paused run.
- files changed: `skills/delivery/deliver/references/deliver_archon_answer.md`
- regression check: read the file back in full; the three original variants (`paused at <gate>`, `completed`, `failed at <node>`) are unchanged, and `deliver/SKILL.md:54`'s instruction to fill the run line with `is running` now has a matching slot to fill it with.

### CR-403

- disposition: fixed
- evidence: `deliver/SKILL.md`'s `intent: stop` branch now runs `archon workflow cancel "$run_id" --cwd "$cwd"` before `archon workflow abandon "$run_id" --cwd "$cwd"`, each guarded exactly like the two state reads (a nonzero exit reports Archon's output as cause and fix and stops before the next line runs). The prose states what each command does (`cancel` stops the detached continuation the last `respond --detach` created; `abandon` alone would leave that child running while only flipping the run's recorded status) and names the step-4 dispatch process as something the same stop must also end, through the runtime mechanism that started it, since nothing else in the skill tracks that process.
- files changed: `skills/delivery/deliver/SKILL.md`
- regression check: `node --test tests/steward.test.mjs` (7/7 pass; the `RESPOND` fence extraction still matches only the `respond "$run_id"` fence, not the new `cancel`/`abandon` fence, since that fence contains neither marker string); read the two-line fence back to confirm both calls carry `--cwd "$cwd"` and the same `|| { printf ...; exit 1; }` guard as `get` and `respond`.

## Advisory Decisions

### ADV-401

- disposition: accepted
- reason: the test name and its assertion message both referenced a `while :` loop round 23 already removed from the fence. Renamed the test to "respond and the wait chunk name the run's own worktree, and the fence holds one shell call" and reworded the assertion message to "the fence is straight-line: one respond and one wait, never a loop", so the test states what it actually proves. `tests/steward.test.mjs`.

### ADV-402

- disposition: left_advisory
- reason: unchanged from rounds 24 and 26. No fix round can prove acceptance (a) or (b) without a live Herdr workspace and an outward-facing pane in the person's own session; blocking on it again buys nothing. Kept as the one item needing a by-hand walkthrough before merge.

### ADV-403

- disposition: accepted
- reason: `deliver_archon_answer.md:9`'s `<path Archon printed>` slot renamed to `<the run's working_path>`, matching the wording `deliver_archon_answer.md:14` and `deliver_ended_answer.md:3` already use, now that step 4 never captures Archon's stdout. Folded into the same edit as CR-402 since both are the same line.

### ADV-404

- disposition: accepted
- reason: `shared/CONVENTIONS.md`'s Archon gate ask section widened "The agent that printed it resolves the gate itself" to "The agent that printed it, or the agent it points at, resolves the gate itself", so the rule covers `herd_next_gate_answer.md`, which prints the ask but points at the pane's `deliver` to resolve it, as `validate.mjs` already requires the sentence there.

### ADV-405

- disposition: accepted
- reason: `scripts/validate.mjs`'s `gateAskFenceStart`/`gateAskFenceEnd` lookup now stops at the next `## ` heading after `## Archon gate ask` (a new `gateAskSectionEnd`/`gateAskSearchEnd` pair bounds both `findIndex` calls), so a future edit that drops the fence from that section but keeps the heading fails the existing `GATE_ASK_SENTENCE === null` check instead of silently adopting the next ` ```text ` fence in the file (`## Commits` at line 152).

## Verification

- command: `npm test`
- result: exit 0, `tests 71 / suites 3 / pass 71 / fail 0 / cancelled 0 / skipped 0 / todo 0`, duration 30887ms. All seven steward cases pass, including the renamed ADV-401 case.
- command: `node scripts/validate.mjs`
- result: exit 0, `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command: `node scripts/check-commits.mjs ef969cddee3ae80975a5d2665ea501b8a329a95f..HEAD`
- result: exit 0, `ok: 45 subjects`. (The review recorded 66; no commit was added or removed by this round, so the discrepancy predates it and is not a regression from this fix round.)
- command: `grep -rn 'archon workflow' skills/`
- result: 15 lines in 5 files, the same shape the review's own acceptance-(d) check found: every line is a command a skill runs itself (a fence inside its own steps, or `deliver_archon_answer.md:7` as past-tense provenance under `Started from the project root:`). No line addresses a person with a command to run.

## Remaining Blocks

- None. ADV-402 stays a by-hand item, not a block: acceptance (a), (b), and the plan's Herdr checklist steps 3 and 4 still need one live walkthrough inside a Herdr workspace before merge, as rounds 24 and 26 already recorded.
