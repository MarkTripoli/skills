---
name: create-structure-outline
description: Writes a phased implementation outline of thin, independently verifiable vertical slices from the TDD, PRD, or design discussion. Use when the user runs /create-structure-outline or in the lean workflow after research; for the full plan use /create-plan, to revise an outline use /iterate-structure-outline.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Create Structure Outline

Create phased implementation outline from research and design artifacts. Decides sequencing: thin, independently verifiable phases.

If current indexed records and explicit user paths do not identify the target artifacts, ask which artifacts should drive the outline.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists. Note `workflow` from `task.md`.
2. **Read inputs**:
   - Always read `references/structure_outline_template.md`, `references/structure_outline_final_answer.md`, the task or ticket, the newest design artifact (TDD > PRD > design discussion, selected through index.json), and every user-mentioned file, fully.
   - For a Jira-backed task, read the newest `jira-refinement` artifact completely and carry confirmed `## Planning impact` into phase scope and checks; keep proposals out of required checkboxes.
   - Read source files mentioned in the artifacts when those details are needed to shape phase boundaries.
   - Read other artifacts by `summary` from validated current index records; open one only when its summary shows phase-boundary relevance, and then read the relevant section by heading rather than the whole file. Exclude research-question artifacts. Take behavior and patterns from design and research summaries.
3. **Start child research when a missing fact would change the artifact**: Start a child worker for role `agent-codebase-locator` (files and tests), `agent-codebase-analyzer` (behavior), `agent-codebase-pattern-finder` (local precedents), or `agent-web-search-researcher` (external docs) with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message. Do not let child research run out of sight. Start, wait, read the final message, then use or discard the finding.
4. **Create phased outline**:
   - Use the smallest useful views per phase (file tree, data structure, SQL shape, API contract, component tree, call tree, Mermaid, pseudocode), with short connective prose between them, in an understandable order. Visuals and subheadings are optional.
   - Use `diff` fences for before/after, with `+` for added or retargeted ownership, `-` for removals, and leading spaces for context. Use project language or `text` fences for new shapes. Use proper tree glyphs (`├──`, `└──`, `│`), keep trees shallow, group files, and omit unchanged paths.
   - Each phase produces a verifiable increment crossing the necessary layers and stands on its own for verification. Do not batch the whole schema, then the whole API, then the whole UI, then tests; prefer the smallest working flow.

5. **Per phase**: Overview, change outline (files, contracts, data shapes, components, tests), test changes when patterns found, validation (runnable commands, plus real manual checks only where a command cannot decide; record human-only evidence as plain bullets with pointers, never as checklist items). Size each phase against the [slicing guide](https://github.com/MarkTripoli/skills/blob/main/shared/SLICING.md), which a checkout has at `shared/SLICING.md`: one obligation, one vertical slice, one day of work, and safe to land alone. Split a phase that fails a test using the split its symptom names there. State the phase's done condition as the observable state its validation command or check decides, never as work performed.
6. **Phase Checklist**: Checkbox per phase (`- [ ] Phase N: <Title>`). These boxes are updated during implementation. After saving the outline, update any `jira-refinement` artifact's `Plan reconciliation` line to `applied in <outline path>` only when all confirmed Planning impact is represented; otherwise write `Plan reconciliation: needs-human: <question>` for the unresolved change. Save the revised refinement locally; never stage or commit task files.

7. **Output**: Record the next immutable `planning.structure` iteration through the conventions' Recording an artifact flow. Follow `references/structure_outline_final_answer.md` exactly. Fill `{artifact_link}` and `{artifact_file}` with the saved canonical task-root-relative path (the template carries the `@`), and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists. Add no prose before or after the template. A legacy task without `index.json` follows the conventions' legacy rules.

## Conciseness

Prefer signatures, trees, short snippets over long code blocks. Detailed function bodies belong in plan.
