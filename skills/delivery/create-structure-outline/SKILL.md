---
name: create-structure-outline
description: Run for /create-structure-outline requests. Create a phased implementation outline from design artifacts.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Create Structure Outline

Create phased implementation outline from research and design artifacts. Decides sequencing: thin, independently verifiable phases.

If you cannot identify the target artifacts from the task directory listing, ask the user which artifacts should drive the outline.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists. Note `workflow` from `task.md`.
2. **Read inputs**: Read `references/structure_outline_template.md`, `references/show-me.md`, `references/structure_outline_setup_answer.md`, `references/structure_outline_final_answer.md`. Read task or ticket, newest design artifact (TDD > PRD > design discussion, each the highest-numbered file whose frontmatter `type` matches), user-mentioned files fully. Read source files mentioned in the artifacts when those details are needed to shape phase boundaries. Other artifacts by `summary` from the task directory listing; open only when summary shows phase-boundary relevance, and then read the relevant section by heading rather than the whole file. Exclude research-question artifacts. Take behavior and patterns from design and research summaries.
3. **Start child research when a missing fact would change the artifact**: Start a child worker for role `agent-codebase-locator` (files and tests), `agent-codebase-analyzer` (behavior), `agent-codebase-pattern-finder` (local precedents), or `agent-web-search-researcher` (external docs) with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message. Do not let child research run out of sight. Start, wait, read the final message, then use or discard the finding.
4. **Create phased outline**: Use smallest useful views per phase (file tree, data structure, SQL shape, API contract, component tree, call tree, Mermaid, pseudocode). Tell the story in understandable order. Treat visuals and subheadings as optional. Short connective prose between views. Use `diff` fences for before/after; in diff fences, use `+` for added or retargeted ownership, `-` for removals, and leading spaces for context. Project language or `text` fences for new shapes. Proper tree glyphs (`├──`, `└──`, `│`). Keep trees shallow; group files, omit unchanged paths. Each phase produces verifiable increment crossing necessary layers. Do not batch the whole schema, then the whole API, then the whole UI, then tests. Avoid batching by layer; prefer smallest working flow. A phase should stand on its own for verification.

5. **Per phase**: Overview, change outline (files, contracts, data shapes, components, tests), test changes when patterns found, validation (runnable commands and real manual checks).
6. **Implementation Overview**: Checkbox per phase (`- [ ] Phase N: <Title>`). These boxes are updated during implementation.

7. **Output**: Take the next artifact number and write `NN-structure-outline-<slug>.md`. Run the Worktree probe from the conventions (read `.agents/workspace.json` and `.agents/workspace.local.json` if present; run `git rev-parse --git-dir`). If the git dir path contains `/worktrees/`, follow `references/structure_outline_final_answer.md`. Else if a workspace config is present with `disabled: true`, check out branch `<slug>` (creating it when it does not exist), then follow `references/structure_outline_final_answer.md`. Otherwise, including when no config file exists, follow `references/structure_outline_setup_answer.md`, which hands off to `/setup-worktree`. Never suggest worktree setup when setup is disabled or the session is already in the intended worktree. Route by `workflow` from `task.md`: `lean` implements from the outline, so `structure_outline_final_answer.md` keeps `/implement-outline`; `full` and `prd` implement from the plan, so when that template is selected write `/implement-plan` in place of `/implement-outline` in its fence (`/setup-worktree` performs the same routing on its own). Fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-structure-outline-slug.md](.agents/tasks/<slug>/NN-structure-outline-slug.md)`, and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists.
8. **Reply file**: If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.

## User feedback

Treat feedback as instruction to update outline, not begin implementation. Verify facts before applying. Start targeted child research when needed. Update phase structure, scope, files, validation.

## Conciseness

Prefer signatures, trees, short snippets over long code blocks. Detailed function bodies belong in plan. Prefer automated verification; record human-only evidence as plain bullets with pointers, never as checklist items. Manual checks should exist only when they add value; automated verification is better when the behavior can be checked by a command.
