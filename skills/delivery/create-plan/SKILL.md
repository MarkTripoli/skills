---
name: create-plan
description: Writes a phased implementation plan with concrete file edits and runnable checks from the task's TDD, PRD, structure outline, or design discussion. Use when the user runs /create-plan or asks to turn an approved design into a plan; not for splitting an epic (/create-epic-plan).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Create Plan

Expand the source artifact (a TDD, PRD, structure outline, or design discussion) into a detailed implementation plan with concrete edits, examples, and verification. The plan is the last artifact before implementation.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists.

2. **Read primary inputs fully, others by summary**:
   - Read `references/plan_template.md` and `references/plan_final_answer.md`.
   - Read the explicit source artifact completely; otherwise select current indexed TDD, PRD, structure outline or design discussion, in that order. Only a genuinely absent index permits numbered discovery.
   - For Jira-backed work, read current `research.jira` completely. Confirmed specifications and Planning impact constrain phases and checks; proposals and open questions remain labeled, not required checkboxes.
   - Other artifacts in validated current index records: use the `summary` field. Open only when the design leaves a gap.

3. **Read relevant source files**:
   - Open source files named in research, design, or outline.
   - Verify file paths and examples before including them.
   - Use existing test patterns when planning tests.

4. **Write the implementation plan**:
   - Allocate the next immutable `planning.plan` iteration and write its staging document.
   - Convert the source artifact's phases, or its architecture when it has none, into implementation phases with steps.
   - Include concrete code examples where they clarify the change.
   - Include automated verification commands and real manual checks when needed.
   - Before saving, confirm every `**File**` path exists or is marked new and every phase has at least one runnable command; fix and re-check.

5. **If Jira-backed, reconcile the refinement.** Map each confirmed Planning impact item to a phase or check; unresolved proposals stay in Open Questions or Known limits. Record a successor `research.jira` iteration with `Plan reconciliation: applied in <canonical plan path>`, or `not needed` with evidence. A confirmed required change that remains unresolved records `needs-human: <question>` and blocks implementation. Keep both immutable artifacts local.

6. **If the source artifact has open decisions, adopt them** (open Design Questions in a design discussion, or open items or `Not stated` blanks in a TDD or outline): take each one's recommendation (or the safest stated option when none is recommended; for a blank that names no option, state the assumption the plan makes), state it in the phase it shapes, and add one confirmation box per adopted decision under `## Human Review` `### Verify`, naming the question and the option. These are confirmations for the human before implementation, never phase implementation checkboxes. An unresolved `jira-refinement` proposal never shapes a phase; it goes to Known limits with its Verify box.

## Plan Guidelines

- Use specific file edits, target functions, and short code examples over broad descriptions.
- When the primary input is a TDD, map each `## Phase N` to work-item ids from its `### Engineering Work Breakdown` table with a `**Work items**: w1, w2` line under the phase heading, and state in `## Execution Strategy` which dependency edge any reordering or merge crossed.

## Output

7. Record the checked plan as the next immutable `planning.plan` iteration and use `references/plan_final_answer.md` exactly. Fill the canonical receipt link, worktree-relative `{artifact_file}`, and Check/Known limits from Human Review. A genuinely unindexed legacy task follows its existing numbered-file contract.
