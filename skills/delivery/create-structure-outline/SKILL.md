---
name: create-structure-outline
description: Run for /create-structure-outline requests. Create a phased implementation outline from design artifacts.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Create Structure Outline

Create phased implementation outline from research and design artifacts. Decides sequencing: thin, independently verifiable phases.

If current indexed records and explicit user paths do not identify the target artifacts, ask which artifacts should drive the outline.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists. Note `workflow` from `task.md`.
2. **Read inputs**: Read `references/structure_outline_template.md`, `references/show-me.md`, `references/structure_outline_final_answer.md`. Read task or ticket, the current indexed design artifact (TDD > PRD > design discussion), and user-mentioned files fully. Read source files mentioned in the artifacts when those details are needed to shape phase boundaries. Read other current artifact summaries from `index.json`; open only when a summary shows phase-boundary relevance. Exclude research-question artifacts. Take behavior and patterns from design and research summaries.
3. **Start child research when a missing fact would change the artifact**: Start a child worker for role `agent-codebase-locator` (files and tests), `agent-codebase-analyzer` (behavior), `agent-codebase-pattern-finder` (local precedents), or `agent-web-search-researcher` (external docs) with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message. Do not let child research run out of sight. Start, wait, read the final message, then use or discard the finding.
4. **Create phased outline**: Use smallest useful views per phase (file tree, data structure, SQL shape, API contract, component tree, call tree, Mermaid, pseudocode). Tell the story in understandable order. Treat visuals and subheadings as optional. Short connective prose between views. Use `diff` fences for before/after; in diff fences, use `+` for added or retargeted ownership, `-` for removals, and leading spaces for context. Project language or `text` fences for new shapes. Proper tree glyphs (`├──`, `└──`, `│`). Keep trees shallow; group files, omit unchanged paths. Each phase produces verifiable increment crossing necessary layers. Do not batch the whole schema, then the whole API, then the whole UI, then tests. Avoid batching by layer; prefer smallest working flow. A phase should stand on its own for verification.

5. **Per phase**: Overview, change outline (files, contracts, data shapes, components, tests), test changes when patterns found, validation (runnable commands and real manual checks). Apply the slicing guide's advisory size signal first to flag an oversize phase for a split now, then size each phase against the [slicing guide](https://github.com/MarkTripoli/skills/blob/main/shared/SLICING.md), which a checkout has at `shared/SLICING.md`: one obligation, one vertical slice, one day of work, and safe to land alone. Split a phase that fails a test using the split its symptom names there. State the phase's done condition as the observable state its validation command or check decides, never as work performed.
6. **Implementation Overview**: Checkbox per phase (`- [ ] Phase N: <Title>`). These boxes are updated during implementation.

7. **Output**: Record the next immutable `planning.structure` iteration through the conventions' Recording an artifact flow. Follow `references/structure_outline_final_answer.md` exactly. Fill `{artifact_link}` and `{artifact_file}` with the saved canonical task-root-relative path (the template carries the `@`), and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists. Add no prose before or after the template. Commit the canonical path and `index.json` explicitly as `docs(task): structure-outline artifact`. A legacy task without `index.json` follows the conventions' legacy rules.

## User feedback

Treat feedback as instruction to update outline, not begin implementation. Verify facts before applying. Start targeted child research when needed. Update phase structure, scope, files, validation.

## Conciseness

Prefer signatures, trees, short snippets over long code blocks. Detailed function bodies belong in plan. Prefer automated verification; record human-only evidence as plain bullets with pointers, never as checklist items. Manual checks should exist only when they add value; automated verification is better when the behavior can be checked by a command.
