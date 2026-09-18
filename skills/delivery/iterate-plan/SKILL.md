---
name: iterate-plan
description: Run for /iterate-plan requests. Revise an implementation plan from feedback.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Revise Implementation Plan

Revise an existing implementation plan. Check feedback before applying it, preserve the plan structure, and keep validation actionable.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists.

2. **Resolve target and read references**:
   - Resolve the target plan from `@file` or, when none is given, the newest artifact of type `plan` in the task directory listing. Ask only if multiple plan artifacts are plausible.
   - Read `references/plan_template.md` and `references/plan_final_answer.md`.

3. **Read primary inputs fully, others by summary**:
   - Read completely: the plan and the supplied feedback (the user's message or a file the user names).
   - Upstream artifacts (task, ticket, research, design, PRD, TDD, structure outline): use their `summary` fields from the task directory listing. Open only when feedback touches something the summary covers.

4. **Process feedback**:
   - If a ticket or feedback file is provided, treat it as instruction to evaluate, not as automatically correct.
   - Map each item to the affected plan phase or success criterion.
   - Do not accept corrections blindly. Read mentioned files or directories.
   - Verify code examples, file paths, and command names.
   - If the plan depends on uncertain behavior, inspect the source directly or start a child worker for role `agent-codebase-analyzer` (see the conventions' Child workers section) to verify the narrow fact; wait for it and read its final message.

5. **Update the plan**:
   - Edit the plan at its existing path.
   - Reorganize phases when requested or when the current sequence is not independently verifiable.
   - Update code examples when file or API facts change.
   - Fix inaccurate paths, descriptions, or validation commands.
   - Preserve frontmatter and template shape.
   - Keep examples accurate and concise.
   - Ensure automated checks are commands the implementer can run.
    - Keep deferred human evidence as plain bullets with pointers, never checkboxes; remove filler.
   - Maintain phase sections with success criteria.

6. Save the file and respond following `references/plan_final_answer.md` exactly; fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-plan-slug.md](.agents/tasks/<slug>/NN-plan-slug.md)`, fill `{artifact_file}` with the saved file's name only (the template carries the `@`; name this artifact and no other file, never a path), and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists. Add no prose before or after the template. When not run by the workflow engine, commit the saved file with `git add <path>` as `docs(task): plan artifact`.

## Plan Guidelines

- Keep every phase independently testable.
- Include concrete code examples when they prevent ambiguity.
- Use runnable automated checks.
- Use manual validation only when human judgment is needed.
- Deferred human evidence is a plain bullet naming the evidence and where it is recorded; it never blocks a phase.
- A phase's `human-gated: false` line may be edited to `true` when the user asks to gate that phase.
- Normal iteration edits the existing plan file; do not allocate a new artifact number unless the user asks for a separate plan.
