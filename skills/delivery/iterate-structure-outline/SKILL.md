---
name: iterate-structure-outline
description: Run for /iterate-structure-outline requests. Revise a phased implementation outline.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Iterate Structure Outline

Revise structure outline from feedback or new evidence. Keep phased, vertical, independently verifiable.

If no artifact is named, use current `planning.structure` from `index.json`. Feedback comes from the user's message or a named file; read named files fully.

## Initial Check

If no feedback, no artifact target, and no newer `jira-refinement` Planning impact, ask and wait:

```text
I can revise the structure outline now. Send the phase, scope, validation, or open-question change you want handled first.
```

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists. Note `workflow` from `task.md`.
2. **Read inputs**: Read the templates, feedback, and user-mentioned files fully. When `index.json` exists, validate the whole index and ledger per the conventions' immutable artifact contract, then read current `planning.structure` (or the explicit indexed `@file`) fully. Invalid indexes fail closed. Only a genuinely absent index uses legacy selection. Read summaries of other current indexed artifacts and open only relevant sections.
3. **Verify user input**: Do not accept corrections blindly. Use direct reads or child research to confirm file paths, patterns, validation commands.
4. **Start child research when a missing fact would change the artifact**: Start a child worker for role `agent-codebase-locator` (files and tests), `agent-codebase-analyzer` (behavior), `agent-codebase-pattern-finder` (local precedents), or `agent-web-search-researcher` (external docs) with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message. Do not rely on hidden background work. Wait for each child and read its final message before using it.
5. **Process feedback**: Reorganize phases when requested or when verification shows split is wrong. Update scope and What we're not doing. Remove answered open questions; incorporate answer into relevant phase. Keep frontmatter and major sections. Each phase should remain vertical slice crossing layers. A phase should include the layers and checks needed for a verifiable increment. Avoid batching by layer. Do not make Phase N depend on Phase N+1.
6. **Write revision**: Allocate the next immutable `planning.structure` iteration through the conventions' Recording an artifact flow, write the revised outline to its reserved staging path, and record it with `supersedes` naming the previous current iteration. Keep recorded bytes unchanged; abort stale allocations or publication conflicts. Rework Implementation Overview, phase overviews, change outlines, test changes, validation steps, and Open Questions. Keep trees small with proper glyphs; use diff notation only when it clarifies changes. Only a legacy task with a genuinely absent index edits its selected outline in place. After confirmed Jira refinement deltas are represented, record a refinement successor with `Plan reconciliation: applied in <saved outline path>`; use `needs-human: <question>` if any confirmed required delta remains unresolved. Legacy refinements follow legacy revision rules. Save locally; never stage or commit task files.
7. **Final answer**: Respond with `references/structure_outline_final_answer.md` exactly. Use the recorded canonical path relative to the worktree root, including the resolved task root and slug once: fill `{artifact_link}` as `[<saved canonical path>](<saved canonical path>)` and `{artifact_file}` with that same path (the template carries the `@`). For legacy tasks, use the saved outline's worktree-root-relative path. Fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists. Add no prose before or after the template.

## Phase Validation

Use automated verification whenever the repo can check behavior. Prefer automated verification; record human-only evidence as plain bullets with pointers, never as checklist items. If a phase has no useful automated check, reconsider whether the slice is independently verifiable.
