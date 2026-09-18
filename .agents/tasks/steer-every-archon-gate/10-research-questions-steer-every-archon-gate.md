---
type: research-questions
summary: "This document is the query plan for a continuation research pass on the steward loop task, after five implementation phases already landed. It checks what the 05-09 implementation receipts prove against task.md's six acceptance items, the current hand-off behavior in deliver's and herd-next's Herdr and non-Herdr branches, existing automated test coverage for the loop, and the two open items 09 flagged: an unstated working-directory assumption on `archon workflow get` and unhandled abandoned-run worktrees. The research phase answers these six questions before any further design or implementation work starts."
status: complete
---

# Research Questions

## Research Goal

Document the current state of the steward loop after implementation phases 05-09: what each receipt already proves against task.md's acceptance items (a)-(f), how `deliver` and `herd-next` hand off to the steward today, what test coverage exists, and the two open items the last receipt flagged but did not close.

## Questions

1. For each of the five implementation receipts (05-09) in `.agents/tasks/steer-every-archon-gate/`, what does the receipt record as done or verified, and which of task.md's acceptance items (a)-(f) does it map to? (none)
2. In `skills/delivery/deliver/SKILL.md` step 4's Herdr and outside-Herdr branches and step 6, what does the skill do today to hand off to the steward, and what distinguishes the two branches? (analyze)
3. In `skills/delivery/herd-next/SKILL.md`'s Archon gate mode, what does the skill do to open a review pane and hand off to `deliver`, and what does it assume about the run's `working_path` and the directory a later steward command runs from? (analyze)
4. What automated test coverage exists in `tests/` for the steward loop against a paused Archon run, and does any existing test exercise a live Herdr review pane, or only the CLI-level `wait`, `get`, and `respond` calls? (locate)
5. What does `archon workflow get` return when run from a directory outside the run's own worktree, and where, if anywhere, do `deliver/SKILL.md` or `herd-next/SKILL.md` state or omit an assumption about the working directory a steward command runs from? (analyze)
6. Does any skill, script, or test in this repository reference `archon workflow cleanup` or otherwise handle worktrees left behind by abandoned Archon runs? (locate)

### Known limits

- `judge.mjs neutral` and `judge.mjs route-question` both exited 3 (`TYPESAFE_API_KEY is not set`); judgments were skipped. Neutrality was checked by this skill's own reading against the drafting rules in step 4 (asks what exists and how it behaves now; does not propose a design or leak an intended fix); all six questions were kept as drafted. Roles were chosen by the same reading: `none` for question 1 (answerable from files already in the task directory), `analyze` for questions 2, 3, and 5 (explaining current behavior of named code sections and an external command), `locate` for questions 4 and 6 (finding whether a file or reference exists).

## Key Context Pointers

- Repositories: this repository (the skills collection itself); the task branch is `herdr-plugin-delivery-flow`.
- Libraries / dependencies: `archon` CLI (external, no source in this repo), `herdr` CLI/app.
- Filepaths / directories:
  - `.agents/tasks/steer-every-archon-gate/05-implementation-steer-every-archon-gate.md` through `09-implementation-steer-every-archon-gate.md`
  - `skills/delivery/deliver/SKILL.md` (step 4 Herdr/outside-Herdr branches, step 6)
  - `skills/delivery/herd-next/SKILL.md` (Archon gate mode)
  - `tests/` (`build-packs.test.mjs`, `commits.test.mjs`, `dispatch.test.mjs`, `install.test.mjs`, `judge.test.mjs`, `metrics.test.mjs`, `packs.test.mjs`, `wave.test.mjs`)
  - `.agents/tasks/steer-every-archon-gate/task.md`
- Commands / endpoints / schemas:
  - `archon workflow get <run-id> --json` (`status`, `working_path`, `metadata.approval`)
  - `archon workflow wait <run-id> --json`
  - `archon workflow respond <run-id> <decision> "<text>"`
  - `archon workflow cleanup`

## Research Boundaries

- Focus on current repository behavior, existing tests, existing conventions, and current external documentation when needed.
- Do not answer what should be built.
- Do not propose a design or implementation.
