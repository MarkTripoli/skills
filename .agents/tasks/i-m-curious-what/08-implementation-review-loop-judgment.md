---
type: implementation
completed_phase: 4
summary: "Phase 4 of the review-loop judgment plan adds `axis-coverage` to `judge.mjs`: one graded question per review axis of `review-code`, read against the existing majority bar into `covered`, `asserted`, `skipped`, or `unclear` with a level 0 to 3, so an axis asserted without evidence no longer reads like an axis with nothing to report. The code-review template carries a `helper coverage` line per axis and the Phase 1 provenance line under the heading, and `review-code`'s save step runs the command, revises a skipped or asserted axis, and re-runs at most once. `review-code` becomes the first review-loop skill to call the helper; the two command tables and the workflow doc record that. `node --test tests/judge.test.mjs`, `node scripts/validate.mjs`, and `npm test` (63 of 63) are green. Phase 5, the last, carries the previous round's finding identifiers into the next review and touches the same template and skill."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/i-m-curious-what/task.md`
- plan artifact: `.agents/tasks/i-m-curious-what/04-plan-review-loop-judgment.md`
- phase range: Phase 4 of 5

## Child Workers
- implementer: none; performed inline, because this session is directed not to start subagents. The `agent-implementer` role was executed by this session, as in Phases 1 to 3.
- reviewer: none; the diff was read against the plan's Required Edits inline.

## Completed Work
- `axis-coverage <artifact.md>` reads the saved review as the whole state and asks one `score` question per axis over the shared `AXIS_COVERAGE` scale (not examined, asserted, partial, examined). A row's verdict comes from the argmax level against the existing `T.safe` bar: below it the row is `unclear`, otherwise level 2 or 3 is `covered`, level 1 `asserted`, level 0 `skipped`. No new constant. `skills/delivery/typed-judgment/judge.mjs:211-239`
- The command is in the header usage list beside the other artifact-reading verdicts and in `main()`'s switch after `verification-status`, so `--json`, the exit-2 usage path, and the Phase 1 provenance line all apply to it without further wiring. `skills/delivery/typed-judgment/judge.mjs:13`, `skills/delivery/typed-judgment/judge.mjs:604`
- The code-review template's `## Five-Axis Assessment` carries one `helper axis-coverage: model ... tokens ...` line under the heading, in the Phase 3 wording, and each of the five axis sections carries a `helper coverage: covered | asserted | skipped | unclear, level 0-3, confidence 0.00 (or ``unavailable``)` line beside its existing evidence bullet. `skills/delivery/review-code/references/code_review_template.md:43-73`
- `review-code`'s `## Save` step runs the command on the file it just saved, records verdict, level, and confidence per axis plus the provenance line, and treats `skipped` or `asserted` as an axis to examine again: rewrite the section with evidence or the reason the axis does not apply, save, re-run once, record the second run. A finding the second pass turns up can change the status. The unavailable path writes `unavailable`, decides those axes in-session, and says so under `## Review Limits`. The commit sentence stays last in the step, at line 70. `skills/delivery/review-code/SKILL.md:68`
- The two command tables and the workflow doc name the new command and the new caller: a `## Commands` row, `review-code` added to typed-judgment's `## When it runs` list, a typed-judgment decision row, and `review-code` added to both skill lists in `workflows/delivery.md`. `skills/delivery/typed-judgment/SKILL.md:14`, `skills/delivery/typed-judgment/SKILL.md:32`, `workflows/delivery.md:176`, `workflows/delivery.md:184`, `workflows/delivery.md:242`
- One new test covers the four verdict bands, the five question keys in order, the artifact text as the state, the five-row `--json` shape, and the exit-2 usage path. `tests/judge.test.mjs:104-122`
- No `.archon/workflows/**` change. No stub change was needed: `axis-coverage` reuses the `score` answer shape the stub already builds.

## Automated Verification
- command: `node --test tests/judge.test.mjs`
- result: pass, exit 0, 10 of 10, `duration_ms 5195.807083`
- evidence: `✔ judge axis-coverage: one level per review axis, an unsure level goes back to the reviewer (273.5095ms)`; the nine existing tests are unchanged and green.

- command: `node scripts/validate.mjs`
- result: pass, exit 0
- evidence: `ok: 41 skills, 54 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`

- command: `npm test`
- result: pass, exit 0, 63 of 63, `duration_ms 27061.6955`
- evidence: `scripts/validate.mjs`, `sync-plugin --check`, and `build-packs --check` are green ahead of `node --test tests/`. `build-packs --check` passing matters here because `workflows/delivery.md` is documentation, not a pack source, so no generated `-omp` tree went stale; `sync-plugin --check` passing confirms neither `review-code` nor `typed-judgment` is a worker skill with an `agents/agent-*.md` copy to regenerate. The suite gained one test, 62 to 63.

## Deferred Human Evidence

- One review round run with `TYPESAFE_API_KEY` set, confirming the five extra `score` questions do not push the request past the unpublished token ceiling. `request too large for the model`, the Phase 1 error, would be the signal. Not executed; the key is unset here. Pointer: `.agents/tasks/i-m-curious-what/04-plan-review-loop-judgment.md:546-548` and the verification artifact's `## Items` table when this task is verified.

## Commit Handoff
The phase commit `d304a75` was created after all three checks were green, staging the six code and prose paths explicitly. `.agents/tasks/` files and the untracked `.backups/phase4-axis-coverage/` rollback copies are not in it.

## Human Review

### Review targets

- `skills/delivery/review-code/SKILL.md:68`, the new save step. It is the plan's own open question: `review-code` becomes the first review-loop skill to call `judge.mjs`, it re-saves an artifact it already wrote, and a second pass can change the status the answer template already reported. The step caps the re-run at one so the loop cannot spin.
- `skills/delivery/typed-judgment/judge.mjs:211-239`, the scale and the bands. `covered` covers levels 2 and 3, so a partially examined axis passes; the intent is to catch the asserted and empty cases, not to grade thoroughness. Raising the bar to level 3 would send most real reviews back at least once.
- `skills/delivery/review-code/references/code_review_template.md:43-73`, the six added lines. Nothing parses them; the shape is a convention for readers, as with the Phase 3 fields.
- Cost: five extra `score` questions per review round, over a request whose state is the whole review artifact. This is the plan's `### Verify` item about the unpublished ceiling.

### Verify

- `node --test tests/judge.test.mjs` passes, 10 of 10, including the new `axis-coverage` test.
- `node scripts/validate.mjs` exits 0 with `0 banned tokens`.
- `npm test` passes, 63 of 63.
- `git show --stat d304a75` lists exactly six files: `judge.mjs`, its test, the two skills, the code-review template, and `workflows/delivery.md`.
- `node skills/delivery/typed-judgment/judge.mjs axis-coverage` with no argument exits 2; with a file and no key it exits 3 and prints nothing, which is the path a review session without the key takes.

### Known limits

- Every verdict band is proven against the stub only. The real model's level distribution over a real review artifact is unobserved, so whether `covered` at level 2 is the right bar is a judgment the first live round will inform, not something these tests show.
- The revise loop is prose a session reads. Nothing enforces the re-run, the cap of two runs, or the `unavailable` fallback; `validate.mjs` checks structure and banned tokens, not whether an instruction is followed.
- The five questions ride on the same request as the review artifact's full text. If that request is what first crosses the unpublished ceiling, the failure surfaces as an exit-3 `request too large for the model` and the session falls back to its own reading, which is the deferred evidence above.
- `review-code` runs under a pack node (`delivery-review`, and `review-phase` in `delivery-implement`) that does not set `TYPESAFE_API_KEY` itself; the coverage pass only happens where the environment already carries the key, and reads `unavailable` everywhere else.
