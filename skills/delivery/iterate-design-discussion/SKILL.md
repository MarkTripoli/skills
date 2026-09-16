---
name: iterate-design-discussion
description: Run for /iterate-design-discussion requests. Revise a design discussion artifact using feedback or new evidence.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Iterate Design Discussion

Revise design discussion from feedback. Apply feedback after checking it. Keep open questions separate from resolved decisions. Leave artifact coherent, not a conversation log.

## Initial Check

If no feedback and no artifact argument, ask and wait:

```text
I can revise the design discussion now. Send the change, feedback, or decision you want reflected first.
```

Do not edit until the user gives a change, names a feedback file, or asks you to continue working through open decisions.

## Steps

1. **Locate the task**: Locate the task directory and read `task.md` per the conventions; when none exists, create it from the user's message as the conventions describe.
2. **Read inputs**: Resolve the target design discussion from the `@file` argument when present. If no artifact is named, use the newest artifact of type `design-discussion` from the task directory listing. Read `references/design_discussion_template.md`, `references/design_discussion_review_answer.md`, `references/design_discussion_final_answer.md`. Read target design discussion, feedback, user-mentioned files fully. Other artifacts by `summary` from the task directory listing; open only when feedback touches them, and then read that section by heading rather than the whole file. Read the feedback the user supplied (message or named file) fully. Exclude research-question artifacts unless asked.
3. **Verify user input**: Do not accept corrections blindly. Read named files. Verify claims with source reads or child research if artifacts do not prove them. Map each feedback item to the sections it affects before editing.
4. **Start child research when extra context would change design**: Use agent-codebase-locator (file discovery), agent-codebase-analyzer (behavior), agent-codebase-pattern-finder (local precedents), agent-web-search-researcher (external refs). For each, start a child worker for role `agent-<role>` with the assignment (see the conventions' Child workers section); wait for it; read its final message. The worker's final message is the deliverable; use only findings you have read from it. Skip child workers for straightforward wording or already-verified decisions.
5. **Update in place**: Keep the original path and frontmatter unless the file is malformed. Rework Current State, Desired End State, Proposed End State Architecture, Patterns when feedback changes them. Move answered questions to Resolved Design Questions with chosen option, rationale, rejected alternatives. Add new open questions when feedback exposes undecided choice. Do not append a change log. Fold the change into the relevant section. There are no comment identifiers, no resolve step, and no delete step: apply each feedback item, or say why it was not applied.

**Content**: Keep request summary, current behavior, target behavior, non-goals current. Update diagrams, pseudocode, trees, HTML artifacts when end state changes. Present options and tradeoffs for new open questions. Record final decisions only when user or newer artifact resolved them. Re-check code examples before keeping them; include only snippets that help implementation follow the intended pattern.

6. **Final answer**: If unresolved design questions remain, follow `references/design_discussion_review_answer.md`. If all resolved, follow `references/design_discussion_final_answer.md`. Fill the chosen template exactly: `{artifact_link}` is a relative Markdown link to the saved file, `[NN-type-slug.md](.agents/tasks/<slug>/NN-type-slug.md)`. Do not add a separate summary. When not run by the workflow engine, commit the saved file with `git add <path>` as `docs(task): design-discussion artifact`.
