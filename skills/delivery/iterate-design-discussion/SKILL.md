---
name: iterate-design-discussion
description: Revises a design discussion artifact from feedback or new evidence, moving answered questions to resolved and rewriting the Execution DAG. Use when running /iterate-design-discussion, usually after a review reply that lists open design questions; not for a first draft, which /create-design-discussion writes.
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
2. **Read inputs**: Resolve the target from the `@file` argument, else the current digest-validated artifact of type `design-discussion` in validated current index records. Read it, the feedback (message or named file), and any file the user names, fully. Read `references/design_discussion_template.md`, `references/design_discussion_review_answer.md`, and `references/design_discussion_final_answer.md`. Open other artifacts only by `summary`, only when feedback touches them, and then read that section by heading rather than the whole file. Exclude research-question artifacts unless asked.
3. **Verify user input**: Do not accept corrections blindly. Read named files. Verify claims with source reads or a child worker if artifacts do not prove them. Map each feedback item to the sections it affects before editing.
4. **Start child workers when extra context would change design**: Use agent-codebase-locator (file discovery), agent-codebase-analyzer (behavior), agent-codebase-pattern-finder (local precedents), agent-web-search-researcher (external refs). For each, start a child worker for role `agent-<role>` with the assignment (see the conventions' Child workers section); wait for it; read its final message. The worker's final message is the deliverable; use only findings you have read from it. Skip child workers for straightforward wording or already-verified decisions.
5. **Create a successor**: Reserve the next immutable `design.discussion` iteration and revise its staging document, preserving frontmatter and applying each feedback item or explaining why not. Record it before the final answer; keep previous bytes unchanged. There are no comment identifiers, resolve or delete steps. Then, by what feedback does:
   - It answers an open question: move it to Resolved Design Questions with the chosen option, rationale, and rejected alternatives.
   - It exposes an undecided choice: add it under Design Questions with options, tradeoffs, and a recommendation.
   - It changes behavior or scope: rework Current State, Desired End State, Proposed End State Architecture, and Patterns, and update the diagrams, pseudocode, trees, and HTML artifacts.
   - Always: fold the change into the relevant section (no change log) and rewrite `### Execution DAG` per `references/execution_dag.md`.

**Content**: Record final decisions only when the user or a newer artifact resolved them. Re-check code examples before keeping them; include only snippets that help implementation follow the intended pattern.

6. **Final answer**: If unresolved design questions remain, respond using `references/design_discussion_review_answer.md` only; if all are resolved, use `references/design_discussion_final_answer.md` only.
