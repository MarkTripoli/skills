---
type: research-questions
summary: "This document is the query plan for researching the current state of Archon gate hand-off before a steward loop is designed: how herd-next's gate mode and deliver's Archon reply surface a pause today, the feedback-intent and ANSWER_INVENTORY contracts a steward would call into, the archon CLI's wait/get/respond semantics, and an existing confirm-gate fixture and bare-remote test pattern usable for end-to-end verification. The research phase answers these seven questions before any design work starts."
status: complete
---

# Research Questions

## Research Goal

Document how the delivery flow currently surfaces an Archon gate pause to a human (`herd-next` gate mode, `deliver`'s Archon reply), the exact contracts of the pieces a future fix would call into (`typed-judgment`'s `feedback-intent`, `scripts/validate.mjs`'s `ANSWER_INVENTORY`, the `archon workflow` CLI), and an existing fixture/test pattern for a paused, bare-remote scratch run.

## Questions

1. In `skills/delivery/herd-next/SKILL.md`'s Archon gate mode and `skills/delivery/herd-next/references/herd_next_gate_answer.md`, how does the skill derive the task artifact path, review pane, and agent kind from the run's `working_path` and `metadata.approval` fields, and what does its reply state about watching for a later gate in the same run? (analyze)
2. In `skills/delivery/deliver/SKILL.md` step 4 and `skills/delivery/deliver/references/deliver_archon_answer.md`, what does the skill do between starting the Archon run and printing its terminal reply, and does the skill's own process end at that point or continue running? (analyze)
3. What is the input and output contract of `judge.mjs`'s `feedback-intent` command (arguments, output shape, the revise/proceed/stop mapping, confidence thresholds, and behavior when the API key or `node` is unavailable), and which existing Archon pack YAML nodes already call it? (analyze)
4. How does `scripts/validate.mjs` discover each skill's answer templates and check them against `ANSWER_INVENTORY`, `FENCE_ARTIFACT`, and `HUMAN_GATE_ANSWERS`, and what structural properties does a template registered there need to satisfy? (analyze)
5. What do `docs/getting-started.md`, `docs/cheatsheet.md`, and `workflows/delivery.md` document about the blocking behavior, exit conditions, and returned JSON fields of `archon workflow wait <run-id> --json`, `archon workflow get <run-id> --json`, and `archon workflow respond <run-id> <decision> [text]`, and how does `--detach` change that flow? (analyze)
6. In `.archon/workflows/delivery/start/delivery-start.yaml` and its `fixtures/confirm-lean.stubs.yaml`, what triggers the `confirm` pause, and how does an existing test such as `tests/wave.test.mjs` construct a scratch run against a bare remote? (locate)
7. Of the `archon workflow` lines in `skills/delivery/deliver/SKILL.md` (lines 3, 42, 44), `skills/delivery/herd-next/SKILL.md` (lines 83, 89, 95, 122), `skills/delivery/resolve-pr-reviews/SKILL.md:12`, and `skills/delivery/start-epic-delivery/SKILL.md:34`, which instruct the skill's own acting agent to run the command itself, and which are worded as instructions for the human reading the reply? (analyze)

### Known limits

- The `neutral` check returned `unclear` for questions 1, 2, 4, 5, 6, and 7, and `neutral` for question 3; none returned `leading`. Each `unclear` question was reread against the drafting rules (asks what exists and how it behaves now, does not propose a design or leak the intended fix) and kept as written.
- The `route-question` check returned `undecided` for questions 5 and 6. Role chosen by own reading: `analyze` for question 5 (synthesizing documented CLI semantics across three files), `locate` for question 6 (finding a YAML trigger condition and an existing test's setup pattern).

## Key Context Pointers

- Repositories: this repository (the skills collection itself); the task branch is `herdr-plugin-delivery-flow`.
- Libraries / dependencies: `archon` CLI (external, no source in this repo), `herdr` CLI/app, this collection's `typed-judgment` helper.
- Filepaths / directories:
  - `skills/delivery/herd-next/SKILL.md`, `skills/delivery/herd-next/references/herd_next_gate_answer.md`
  - `skills/delivery/deliver/SKILL.md`, `skills/delivery/deliver/references/deliver_archon_answer.md`
  - `skills/delivery/typed-judgment/judge.mjs` (repo copy) and `~/.agents/skills/typed-judgment/judge.mjs` (the copy this skill's own step 5 calls)
  - `scripts/validate.mjs`
  - `workflows/delivery.md`, `docs/getting-started.md`, `docs/cheatsheet.md`
  - `.archon/workflows/delivery/start/delivery-start.yaml`, `.archon/workflows/delivery/start/fixtures/confirm-lean.stubs.yaml`
  - `tests/wave.test.mjs`
  - `skills/delivery/resolve-pr-reviews/SKILL.md`, `skills/delivery/start-epic-delivery/SKILL.md`
  - `shared/CONVENTIONS.md`, `shared/WRITING.md`
- Commands / endpoints / schemas:
  - `archon workflow wait <run-id> --json`
  - `archon workflow get <run-id> --json` (`status`, `working_path`, `metadata.approval.nodeId`, `.message`, `.decisions[].id`, `.resolved`)
  - `archon workflow respond <run-id> <decision> "<text>"`
  - `archon workflow approve <run-id>` / `archon workflow reject <run-id> "<text>"`
  - `herdr notification show`
  - `node judge.mjs feedback-intent`
  - `ANSWER_INVENTORY` (in `scripts/validate.mjs`)

## Research Boundaries

- Focus on current repository behavior, existing tests, existing conventions, and current external documentation when needed.
- Do not answer what should be built.
- Do not propose a design or implementation.
