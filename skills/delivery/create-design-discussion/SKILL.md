---
name: create-design-discussion
description: Writes a design discussion artifact from the task and research, covering current and desired behavior, proposed architecture, open design questions with options and a recommendation, patterns to follow, and the Execution DAG. Use when running /create-design-discussion after /create-research in a full workflow; not for lean or prd workflows, which use /create-structure-outline or /create-prd.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Design Discussion Phase

Convert task request and research into a decision document. Explain current product behavior, desired outcome, proposed design shape, open choices, and codebase patterns. Decides direction, not implementation.

## Work sequence

1. **Locate the task**: Locate the task directory and read `task.md` per the conventions; when none exists, create it from the user's message as the conventions describe.
2. **Read primary inputs fully**: `ticket.md` when present, current digest-validated `research.primary`, and user-supplied `@file` paths. Read `references/design_discussion_template.md`, `references/design_discussion_review_answer.md`, and `references/design_discussion_final_answer.md`.
3. **Other artifacts by summary**: Use `summary` fields from the artifacts in validated current index records. Open only when the summary shows relevance, then read by section heading. Exclude research-question artifacts unless auditing research.
4. **Start child workers when a missing fact would change the design**: Do not start child workers until you have read the primary inputs yourself. Default: none; one locator or analyzer when a named file or flow is unread. Use agent-codebase-locator (finds files and tests), agent-codebase-analyzer (current behavior), agent-codebase-pattern-finder (local precedents), and agent-web-search-researcher (external docs). For each, start a child worker for role `agent-<role>` with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message.
5. **Write the design discussion**: Allocate the next immutable iteration through the task artifact contract and write its staging file. Use fewest views needed. If a focused HTML visual would make a dense concept clearer, read `references/artifact_template.html` and `references/show-me.md`, save the HTML file beside the artifact in the task directory, and link it with a relative Markdown link. A diagram, pseudocode block, component tree, file tree, or HTML artifact belongs beside the prose it clarifies. Write `### Execution DAG` per `references/execution_dag.md`.

**Content rules**:
- Product spec: user behavior today and after change.
- Architecture: show how behavior fits together (before/after, Mermaid, pseudocode, component tree, file tree, `diff` blocks).
- Design Questions: put each unresolved design question under Design Questions. For each major choice, show options, tradeoffs, and a recommendation grounded in research or local conventions. Include testing approach if research found patterns.
- Question state is binding: initial design questions stay open. Do not move one to Resolved Design Questions because you think the answer is obvious. A design question stays open until user decision, approval, or resolution in a newer artifact. A resolved design question records the chosen option, rationale, and rejected alternatives.
- Patterns: local patterns for implementation. File locations and short snippets only. Do not paste large source blocks.

6. **Final answer**: If any design question remains open, respond using `references/design_discussion_review_answer.md` only; if all are resolved, use `references/design_discussion_final_answer.md` only.
