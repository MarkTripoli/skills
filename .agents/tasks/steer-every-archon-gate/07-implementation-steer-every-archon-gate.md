---
type: implementation
completed_phase: 3
summary: "`herd-next`'s Archon gate mode is now pane mechanics only: it reads the run once, opens the review pane at the run's `working_path`, and submits `/deliver --run <run-id>` through `herdr agent prompt`. The blocking `archon workflow wait` and the reported `archon workflow respond` command are gone, and step 8's stage-not-submit rule now names the boundary it protects. Phase 4 consumes this by rewriting `workflows/delivery.md` to describe the same steward loop, the `--run` attach mode, and the narrowed rule."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/steer-every-archon-gate/task.md`
- plan artifact: `.agents/tasks/steer-every-archon-gate/04-plan-steer-every-archon-gate.md`
- phase range: Phase 3 only (`herd-next`'s gate mode shrinks to pane mechanics)

## Child Workers
- implementer: `agent-implementer`, plan path plus phase 3
- reviewer: none; the plan's four automated checks were re-run by the parent against the repository

## Completed Work
- 3.1: deleted the blocking-wait paragraph and its `archon workflow wait "$run_id" --json` fence, replaced by "Read the run once. This pane is never held: the steward in the review pane does the waiting." (`skills/delivery/herd-next/SKILL.md:86`).
- 3.2: a non-paused run no longer ends the mode. `completed`, `failed`, or `cancelled` prints the skipped reply with the reason `the run has ended`; `running`, or `paused` with a non-empty `resolved`, still opens the pane with `$phase` set to `run` (`skills/delivery/herd-next/SKILL.md:100`).
- 3.3: the pane's `send-text` of a read instruction became `herdr agent prompt "$name" "/deliver --run $run_id"`, and the reported `archon workflow respond` block became prose stating that `agent prompt` returns on submission and the pane's `deliver` resolves every decision id itself (`skills/delivery/herd-next/SKILL.md:110`, `:115`).
- 3.4: step 8's stage-or-submit rule now states its boundary - a command that records approval is staged, never submitted; one that records none, such as `/deliver --run <run-id>`, may be submitted (`skills/delivery/herd-next/SKILL.md:70`).
- Stale prose the plan's rewrite invalidated but its diffs did not name, fixed on the Phase 2 precedent: "Read the paused state" to "Read the run's state" (`:88`), "when a gate is live" appended to the `$phase is $node` sentence (`:100`), and "stage the read" to "submit the attach command" in both places (`:104`, `:113`).
- Parent fix on top of the child's work: the notification call at `:107` was unconditional while the new prose at `:100` says the notification is skipped for the running-run branch. Guarded with `[ -n "$node" ] &&` so the fence matches the behavior the plan states. No other behavior added.

## Automated Verification
- command: `node scripts/validate.mjs`
- result: pass (exit 0)
- evidence: `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`

- command: `npm test`
- result: pass (exit 0)
- evidence: `tests 64 / suites 3 / pass 64 / fail 0 / cancelled 0 / skipped 0 / todo 0`

- command: `grep -n 'archon workflow respond\|archon workflow wait' skills/delivery/herd-next/SKILL.md`
- result: pass (no output, exit 1)
- evidence: no match in the file

- command: `grep -rn 'archon workflow' skills/*/references skills/*/SKILL.md skills/*/*/references skills/*/*/SKILL.md`
- result: pass (acceptance (d))
- evidence: 14 hits remain, each reviewed. `deliver/SKILL.md:3,10,44,48,70,97,104,106,107` and `herd-next/SKILL.md:83,91` are commands the agent runs; `deliver_archon_answer.md:7` is past-tense provenance of what was already run; `resolve-pr-reviews/SKILL.md:12` states where the skill runs; `start-epic-delivery/SKILL.md:34` tells the agent how to build a printed record, and its template line was rewritten in Phase 1.6 to "ask your agent to start that child". No line tells a person to type a command.

## Deferred Human Evidence

- Acceptance (a), (b), and (c) - a real paused run proving the pane announces the gate and a plain-language answer resolves it - stay deferred to Phase 5, which the plan scopes as the only phase needing a live Archon run (`04-plan-steer-every-archon-gate.md:472`).
- `herdr agent prompt` without `--wait` returning on submission is asserted from the Herdr CLI contract, not observed here; Phase 5's live run is where it is exercised.

## Commit Handoff
The phase commit was created after all four automated checks passed: `skills/delivery/herd-next/SKILL.md` staged by explicit path, with the ticked plan and this receipt in their own `docs(task): implementation artifact` commit.

## Human Review

### Review targets

- `skills/delivery/herd-next/SKILL.md`, the "Archon gate mode" section (`:78-117`) and step 8 (`:70`): confirm the mode now reads once and hands the pane to `/deliver --run <run-id>`, and that no reply path names a command for a person.
- The running-run branch at `:100`: a run that has not paused yet now opens a review pane labelled `<slug>/run` instead of printing the skipped reply. Confirm that is the intended behavior for `herd-next` called on a run mid-phase.
- The `[ -n "$node" ] &&` guard at `:107`: it is the parent's fix, not in the plan's diffs.

### Verify

- `node scripts/validate.mjs` and `npm test` both green, and neither grep in the Phase 3 success criteria shows a person-directed command.

### Known limits

- The gate mode's frontmatter `description` (`:3`) still says the mode watches a run and opens a pane "when it pauses at a gate". The mode no longer waits, and it now opens a pane for a running run too. The plan's Phase 3 diffs do not touch that line and no check depends on it; Phase 4 or a follow-up should reword it.
- Nothing in this phase was exercised against a live Herdr pane or a live Archon run.
