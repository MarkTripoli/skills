---
name: iterate-structure-outline
description: Run for /iterate-structure-outline requests. Revise a phased implementation outline.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Iterate Structure Outline

Revise structure outline from feedback or new evidence. Keep phased, vertical, independently verifiable.

If no artifact is named, use current `planning.structure` from `index.json`. Feedback comes from the user's message or a named file; read named files fully.

## Initial Check

If no feedback and no artifact target, ask and wait:

```text
I can revise the structure outline now. Send the phase, scope, validation, or open-question change you want handled first.
```

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists. Note `workflow` from `task.md`.
2. **Read inputs**: Read the templates, current `planning.structure` iteration (or explicit `@file`), feedback, and user-mentioned files fully. Read summaries of other current indexed artifacts and open only relevant sections.
3. **Verify user input**: Do not accept corrections blindly. Use direct reads or child research to confirm file paths, patterns, validation commands.
4. **Start child research when a missing fact would change the artifact**: Start a child worker for role `agent-codebase-locator` (files and tests), `agent-codebase-analyzer` (behavior), `agent-codebase-pattern-finder` (local precedents), or `agent-web-search-researcher` (external docs) with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message. Do not rely on hidden background work. Wait for each child and read its final message before using it.
5. **Process feedback**: Reorganize phases when requested or when verification shows split is wrong. Update scope and What we're not doing. Remove answered open questions; incorporate answer into relevant phase. Keep frontmatter and major sections. Each phase should remain vertical slice crossing layers. A phase should include the layers and checks needed for a verifiable increment. Avoid batching by layer. Do not make Phase N depend on Phase N+1.
6. **Update document**: Copy current outline to the next `planning.structure` iteration and edit that new file; never edit a recorded iteration. A legacy task without `index.json` follows the conventions' in-place rule.
7. **Final answer**: Record the new iteration through the conventions' Recording an artifact flow and respond with `references/structure_outline_final_answer.md` exactly. Fill `{artifact_link}` and `{artifact_file}` with the canonical task-root-relative path. Commit that path and `index.json` explicitly as `docs(task): structure-outline artifact`.

## Phase Validation

Use automated verification whenever the repo can check behavior. Prefer automated verification; record human-only evidence as plain bullets with pointers, never as checklist items. If a phase has no useful automated check, reconsider whether the slice is independently verifiable.
