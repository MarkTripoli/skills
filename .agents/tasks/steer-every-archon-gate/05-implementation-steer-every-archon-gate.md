---
type: implementation
completed_phase: 1
summary: "Phase 1 landed the two new terminal templates `deliver_gate_answer.md` and `deliver_ended_answer.md`, registered both in `ANSWER_INVENTORY` as `TERMINAL_ANSWER`, stated the byte-exact ask sentence once in `shared/CONVENTIONS.md`, and stripped every person-directed `archon workflow` command from the four replies that carried one. `grep -rn 'archon workflow' skills/*/*/references` now returns only `deliver_archon_answer.md:7`, the past-tense provenance line, and `node scripts/validate.mjs` plus `npm test` are green with `EXPECTED_SKILL_COUNT` unchanged at 42. Phase 2 consumes the two new reference files, which `validate.mjs:311-318` requires to exist before `deliver/SKILL.md` may name them."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/steer-every-archon-gate/task.md`
- plan artifact: `.agents/tasks/steer-every-archon-gate/04-plan-steer-every-archon-gate.md`
- phase range: Phase 1 only (`Phase 1: Reply templates and their registration`)

## Child Workers
- implementer: `agent-implementer`, one worker for Phase 1
- reviewer: none; the parent verified the diff and re-ran every check itself

## Completed Work
- `shared/CONVENTIONS.md:92-101` — new `## Archon gate ask` section after `## Human gate reply`, declaring the ask sentence byte-exact and stating that the agent that printed it resolves the gate itself.
- `skills/delivery/deliver/references/deliver_gate_answer.md` (new, 13 lines) — the pause announcement: run id and gate, the gated artifact's path and frontmatter `summary`, its `### Verify` and `### Known limits` lists, any decision beyond `approve`/`reject`, then the ask. No fenced block, no `Next action:`, no `Open a new session in `.
- `skills/delivery/deliver/references/deliver_ended_answer.md` (new, 5 lines) — one `<reason>` slot covering completed, failed, cancelled, and no paused gate, plus branch/worktree and the one thing left.
- `skills/delivery/deliver/references/deliver_archon_answer.md:9` — the run line now names the gated artifact's path, `summary`, `### Verify`, and `### Known limits`; `:14` replaced the three `archon workflow` commands with the ask outside Herdr or the pane pointer inside it, never both. `:7` is unchanged past-tense provenance.
- `skills/delivery/herd-next/references/herd_next_gate_answer.md:3` — the staged read became the submitted `/deliver --run <run-id>`; `:5` lost both `archon workflow respond` commands and the "watch ended at this pause" sentence.
- `skills/delivery/start-epic-delivery/references/epic_delivery_final_answer.md:14` — the printed child commands are now the record of what runs, not something for the person to type.
- `scripts/validate.mjs:52-53` — `deliver/references/deliver_ended_answer.md` and `deliver/references/deliver_gate_answer.md` registered as `TERMINAL_ANSWER`, in the existing alphabetical order beside `deliver_archon_answer.md`. Nothing added to `FENCE_ARTIFACT`; `EXPECTED_SKILL_COUNT` untouched at 42.

## Automated Verification
- command: `node scripts/validate.mjs`
- result: pass, exit 0
- evidence: `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`

- command: `npm test`
- result: pass, exit 0
- evidence: `ℹ tests 64` / `ℹ pass 64` / `ℹ fail 0` / `ℹ cancelled 0`

- command: `grep -rn 'archon workflow' skills/*/*/references`
- result: pass
- evidence: one line only — `skills/delivery/deliver/references/deliver_archon_answer.md:7:` ``archon workflow run delivery-<pack> --branch <branch> --input gates=<gates> '<request>'``. The plan's literal one-level `skills/*/references` matches nothing in this repo, which nests skills as `skills/<group>/<name>/`; the two-level glob is the form the plan's own Human Review Verify list uses.

- command: `grep -c 'Open a new session in \|Next action:' skills/delivery/deliver/references/deliver_gate_answer.md skills/delivery/deliver/references/deliver_ended_answer.md`
- result: pass
- evidence: `deliver_gate_answer.md:0`, `deliver_ended_answer.md:0`

- command: ``grep -n 'Say `approve`, or say what should change\.' shared/CONVENTIONS.md skills/delivery/deliver/references/deliver_gate_answer.md skills/delivery/deliver/references/deliver_archon_answer.md skills/delivery/herd-next/references/herd_next_gate_answer.md``
- result: pass
- evidence: 4 matches in 4 files — `CONVENTIONS.md:96`, `deliver_archon_answer.md:14`, `deliver_gate_answer.md:13`, `herd_next_gate_answer.md:5`

## Deferred Human Evidence

- None. Phase 1 carries no deferred evidence item; acceptance (a), (b), and (c) inside and outside Herdr are recorded in Phase 5.

## Commit Handoff
The phase commit was created after all five automated checks were green: `feat(delivery): ask for words at every archon gate`, staging only the seven code paths. The ticked plan and this receipt are committed separately as `docs(task): implementation artifact`.

## Human Review

### Review targets

- `skills/delivery/deliver/references/deliver_gate_answer.md` and `deliver_ended_answer.md`: both are new terminal templates, so the slot wording is the whole contract for what `deliver` will print at every pause from Phase 2 on.
- `skills/delivery/herd-next/references/herd_next_gate_answer.md:5` reads `Answer in that pane. Say `approve`, or say what should change.` — a period and a capitalised `Say`, not the colon and lowercase `say` the plan's 1.5 diff showed. The plan's own `## Archon gate ask` convention and this phase's own grep both require the sentence byte-exact, and the diff text contradicted them for this one file; the convention and the success criterion won. Confirm that is the intended reading.
- `shared/CONVENTIONS.md:96` states the ask inside a single-backtick code span that itself contains backticks, exactly as the plan's diff wrote it. It is what the grep matches, but it renders as broken inline code. Worth a look before Phase 4 quotes it again.
- `scripts/validate.mjs:52-53`: two entries only, alphabetical, nothing in `FENCE_ARTIFACT`, `EXPECTED_SKILL_COUNT` still 42.

### Verify

- `node scripts/validate.mjs` exits 0 with `42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens`.
- `npm test` reports `pass 64, fail 0`.
- `grep -rn 'archon workflow' skills/*/*/references` returns exactly one line, `deliver_archon_answer.md:7`.
- The two new templates contain no fenced block, no `Next action:`, and no `Open a new session in `, as `validate.mjs` requires of a `TERMINAL_ANSWER`.
- The ask sentence is byte-identical in all four files that carry it.

### Known limits

- The plan's Phase 1 check 3 as written (`skills/*/references`) matches nothing in this repo's two-level skill layout; the ticked box records the two-level form that actually proves the claim. Phases 2 to 4 reuse the same glob shape and should use the two-level form.
- `.backups/` at the repo root is scanned by `validate.mjs` — `SKIP_DIRS` lists only `.git`, `node_modules`, `dist`, `results`, `.cache`. A backup copy of `scripts/validate.mjs` placed there fails the banned-token check, because that file holds the banned tokens as regex source. That copy was removed (git is the rollback for a tracked file); the other, older `.backups` contents are untouched and do not trip the check. Any later phase that backs up `scripts/validate.mjs` into `.backups/` will hit this again.
- Phase 1 changes prose only. Nothing here proves the steward loop runs; `deliver/SKILL.md` still describes the old foreground-wait behaviour until Phase 2, so the two new templates are registered but not yet referenced by any skill.
