---
name: create-plan
description: Run for /create-plan requests. Create a detailed implementation plan from the structure outline.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Create Plan

Expand the structure outline into a detailed implementation plan with concrete edits, examples, and verification. The plan is the last artifact before implementation.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists.

2. **Read primary inputs fully, others by summary**:
   - Read `references/plan_template.md` and `references/plan_final_answer.md`.
   - Read completely: `task.md` or `ticket.md`, plus the design artifact this plan expands: the file the user named with `@...` when one is given, otherwise the newest design artifact (the highest-numbered file whose frontmatter `type` is a TDD, PRD, structure outline, or design discussion, in that order of preference).
   - Other artifacts in the task directory listing: use the `summary` field. Open only when the design leaves a gap.

3. **Read relevant source files**:
   - Open source files named in research, design, or outline.
   - Verify file paths and examples before including them.
   - Use existing test patterns when planning tests.

4. **Write the implementation plan**:
   - Take the next artifact number.
   - Write `NN-plan-<slug>.md` in the task directory.
   - Convert each structure-outline phase into implementation steps.
   - Include concrete code examples where they clarify the change.
   - Include automated verification commands and real manual checks when needed.

## Plan Guidelines

- Every phase must be independently testable.
- Use specific file edits, target functions, and short code examples over broad descriptions.
- Automated verification must be runnable commands.
- Deferred human evidence is a plain bullet naming the evidence and where it is recorded; it never blocks a phase.
- A phase's `human-gated: false` line may be edited to `true` when the user asks to gate that phase.
- Include test additions or modified test examples following patterns from research.
- Do not add manual validation just to fill a section.
- When the primary input is a TDD, map each `## Phase N` to work-item ids from its `### Engineering Work Breakdown` table with a `**Work items**: w1, w2` line under the phase heading, and state in `## Execution Strategy` which dependency edge any reordering or merge crossed.

## Output

1. Save the plan and follow `references/plan_final_answer.md` exactly; fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-plan-slug.md](.agents/tasks/<slug>/NN-plan-slug.md)`, fill `{artifact_file}` with the saved file's name only (the template carries the `@`; name this artifact and no other file, never a path), and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists. Add no prose before or after the template. Commit the saved file with `git add <path>` as `docs(task): plan artifact`.
