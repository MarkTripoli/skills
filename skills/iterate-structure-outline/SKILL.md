---
name: iterate-structure-outline
description: Run for /iterate-structure-outline requests. Revise a phased implementation outline.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Iterate Structure Outline

Revise structure outline from feedback or new evidence. Keep phased, vertical, independently verifiable.

If no artifact is named, use the task directory listing to find the newest artifact of type `structure-outline`. If more than one outline could be intended, ask the user to choose. Feedback comes from the user's message or a file the user names; read a named file fully.

## Initial Check

If no feedback and no artifact target, ask and wait:

```text
I can revise the structure outline now. Send the phase, scope, validation, or open-question change you want handled first.
```

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists. Note `workflow` from `task.md`.
2. **Read inputs**: Read `references/structure_outline_template.md`, `references/structure_outline_setup_answer.md`, `references/structure_outline_final_answer.md`. Read current outline, feedback, user-mentioned files fully. Read the named artifacts and the source files the change depends on fully. Other artifacts by `summary` from the task directory listing; open only when feedback touches them, and then read that section by heading rather than the whole file. Exclude research-question artifacts unless asked.
3. **Verify user input**: Do not accept corrections blindly. Use direct reads or child research to confirm file paths, patterns, validation commands.
4. **Start child research when a missing fact would change the artifact**: Start a child worker for role `agent-codebase-locator` (files and tests), `agent-codebase-analyzer` (behavior), `agent-codebase-pattern-finder` (local precedents), or `agent-web-search-researcher` (external docs) with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message. Do not rely on hidden background work. Wait for each child and read its final message before using it.
5. **Process feedback**: Reorganize phases when requested or when verification shows split is wrong. Update scope and What we're not doing. Remove answered open questions; incorporate answer into relevant phase. Keep frontmatter and major sections. Each phase should remain vertical slice crossing layers. A phase should include the layers and checks needed for a verifiable increment. Avoid batching by layer. Do not make Phase N depend on Phase N+1.
6. **Update document**: Edit same path. Rework Implementation Overview. Update phase overviews, change outlines, test changes, validation steps, Open Questions. Keep trees small with proper glyphs. Use diff notation only when it clarifies changes.
7. **Final answer**: Run the Worktree probe from the conventions (read `.agents/workspace.json` and `.agents/workspace.local.json` if present; run `git rev-parse --git-dir`). If the git dir path contains `/worktrees/`, follow `references/structure_outline_final_answer.md`. Else if a workspace config is present with `disabled: true`, check out branch `<slug>` (creating it when it does not exist), then follow `references/structure_outline_final_answer.md`. Otherwise, including when no config file exists, follow `references/structure_outline_setup_answer.md`, which hands off to `/setup-worktree`. Never suggest worktree setup when setup is disabled or the session is already in the intended worktree. Route by `workflow` from `task.md`: `lean` implements from the outline, so `structure_outline_final_answer.md` keeps `/implement-outline`; `full` and `prd` implement from the plan, so when that template is selected write `/implement-plan` in place of `/implement-outline` in its fence (`/setup-worktree` performs the same routing on its own). Save the file and respond with the selected template exactly; fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-structure-outline-slug.md](.agents/tasks/<slug>/NN-structure-outline-slug.md)`, and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists.
8. **Reply file**: If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.

## Phase Validation

Use automated verification whenever the repo can check behavior. Prefer automated verification; record human-only evidence as plain bullets with pointers, never as checklist items. If a phase has no useful automated check, reconsider whether the slice is independently verifiable.
