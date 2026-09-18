---
type: implementation
completed_phase: 4
summary: "`workflows/delivery.md` now describes what the skills do: the `deliver` row carries the steward loop and the `/deliver --run <run-id>` attach mode, the `herd-next` row carries the read-once gate mode that submits that command into the review pane, and the by-hand paragraph states the narrowed stage-not-submit rule. The plan's 4.3 anchor grep (`records approval`) matched nothing because the phrase never existed in this document, so the sentence was added to the `Running skills by hand` paragraph rather than narrowed in place. Phase 5 consumes this by proving the loop against a live paused `delivery-start` run and recording the three unconfirmed CLI facts."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/steer-every-archon-gate/task.md`
- plan artifact: `.agents/tasks/steer-every-archon-gate/04-plan-steer-every-archon-gate.md`
- phase range: Phase 4 only (The delivery document matches the skills)

## Child Workers
- implementer: `agent-implementer`, plan path plus phase 4
- reviewer: none; the plan's three automated checks were re-run by the parent against the repository

## Completed Work
- 4.1: the `deliver` phase-table row now states the steward loop verbatim from the plan - the run is started as a long-running process it never waits on, the run id comes from `archon workflow status --json`, each pause is announced with the gated artifact's summary, Verify, and Known limits, the answer is mapped with `judge.mjs feedback-intent`, `archon workflow respond --detach` is run by the skill, and waiting is bounded `wait --timeout` chunks; `/deliver --run <run-id>` attaches to an existing run, and inside Herdr `herd-next` opens the pane and submits it (`workflows/delivery.md:239`).
- 4.2: the `herd-next` row's `--run` clause no longer waits or stages a read: it reads the run once, notifies when paused at a gate, opens the review pane at `working_path`, and submits `/deliver --run <run-id>` into it (`workflows/delivery.md:240`).
- 4.3: the `Running skills by hand` paragraph now states the same boundary `herd-next/SKILL.md:70` states - a command that records approval is staged, never submitted, and one that records no approval, such as the gate mode's `/deliver --run <run-id>`, may be submitted (`workflows/delivery.md:254`).
- The phase table's four columns and the `deliver` row's artifact-type and human-gate cells are unchanged; only the description cell was rewritten.

## Automated Verification
- command: `node scripts/validate.mjs`
- result: pass (exit 0)
- evidence: `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`

- command: `npm test`
- result: pass (exit 0)
- evidence: `tests 64 / suites 3 / pass 64 / fail 0 / cancelled 0 / skipped 0 / todo 0`

- command: `grep -n 'records approval is staged' workflows/delivery.md skills/delivery/herd-next/SKILL.md`
- result: pass (matches in both files)
- evidence: `skills/delivery/herd-next/SKILL.md:70` and `workflows/delivery.md:254`

## Deferred Human Evidence

- None. Phase 5 owns the deferred acceptance (a), (b), and (c) evidence that needs a live Archon run and a live Herdr workspace.

## Commit Handoff
The phase commit was created after the three automated checks passed: `docs(delivery): delivery document states the steward loop`, staging `workflows/delivery.md` only. The ticked plan and this receipt are committed separately as `docs(task): implementation artifact`.

## Human Review

### Review targets

- `workflows/delivery.md:239`, the `deliver` row: it is one long cell and it is the only place the whole steward loop is stated in one sentence. Read it against `skills/delivery/deliver/SKILL.md` step 4 and step 6 and confirm nothing in the loop is described that the skill does not do.
- `workflows/delivery.md:240`, the `herd-next` row, against `skills/delivery/herd-next/SKILL.md:86-115`.
- `workflows/delivery.md:254`: the plan asked to narrow an existing sentence, but `git log -p -S 'records approval' -- workflows/delivery.md` shows the phrase never appeared in this file. A new sentence was added to the `Running skills by hand` paragraph instead, worded to match `herd-next/SKILL.md:70`. Confirm the placement reads correctly in that paragraph; the wording is the plan's.

### Verify

- `grep -n 'records approval is staged' workflows/delivery.md skills/delivery/herd-next/SKILL.md` matches in both files.
- `node scripts/validate.mjs` reports 42 skills and 59 answer templates, unchanged.
- `npm test` passes 64 of 64.

### Known limits

- Documentation only. No skill, pack, or script changed in this phase, so no behavior is proved by it; `validate.mjs` check 10 confirms only that every delivery skill is still named in the document, not that the prose matches the skills. The match was checked by reading both files.
- The plan's 4.3 anchor was wrong about the current document. The sentence landed in the `Running skills by hand` paragraph, which is where the by-hand handoff fence rule is already stated; no other paragraph in the document states a stage-or-submit rule.
