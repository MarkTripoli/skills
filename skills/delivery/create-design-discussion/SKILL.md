---
name: create-design-discussion
description: Run for /create-design-discussion requests. Create a design discussion artifact from task and research context.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Design Discussion Phase

Convert task request and research into a decision document. Explain current product behavior, desired outcome, proposed design shape, open choices, and codebase patterns. Decides direction, not implementation.

## Work sequence

1. **Locate the task**: Locate the task directory and read `task.md` per the conventions; when none exists, create it from the user's message as the conventions describe.
2. **Read primary inputs fully**: `ticket.md` when present, the current `research.primary` artifact selected through `index.json`, and user-supplied `@file` paths. Read `references/design_discussion_template.md`, `references/show-me.md`, `references/artifact_template.html`, `references/design_discussion_review_answer.md`, and `references/design_discussion_final_answer.md`.
3. **Other artifacts by summary**: Use summaries from current indexed artifacts. Open only relevant sections. Exclude research questions unless auditing research.
4. **Start child research when a missing fact would change the design**: Do not start child research until you have read the primary inputs yourself. Use agent-codebase-locator (finds files and tests), agent-codebase-analyzer (current behavior), agent-codebase-pattern-finder (local precedents), and agent-web-search-researcher (external docs). For each, start a child worker for role `agent-<role>` with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message.
5. **Write the design discussion**: Record the next immutable `design.discussion` iteration through the conventions' Recording an artifact flow. Keep frontmatter fields compatible with the template: task, type, repo, branch, and sha. Include request summary, present behavior, intended outcome, excluded scope, proposed architecture, open decisions, settled decisions, patterns to follow, and the Execution DAG. Use fewest views needed. If a focused HTML visual would make a dense concept clearer, read `references/artifact_template.html`, save the HTML file beside the artifact in the task directory, and link it with a relative Markdown link. A diagram, pseudocode block, component tree, file tree, or HTML artifact belongs beside the prose it clarifies. Write `### Execution DAG` from the current `orchestration.execution` artifact when one exists; when none exists, describe the fixed chain of `task.md`'s `workflow` value from the phases and gate set in `workflows/delivery.md`.

**Content rules**:
- Product spec: user behavior today and after change. Keep behavior-focused; file and function names belong in patterns or architecture, not in user-facing current-state bullets.
- Architecture: show how behavior fits together (before/after, Mermaid, pseudocode, component tree, file tree, `diff` blocks).
- Design Questions: put unresolved decisions under Design Questions. For each major choice, show options, tradeoffs, and a recommendation grounded in research or local conventions. Include testing approach if research found patterns.
- Question state is binding: initial questions stay open. Do not move a question to Resolved Design Questions because you think the answer is obvious. Questions stay open until user decision, approval, or resolution in a newer artifact. When resolved, record chosen option, rationale, rejected alternatives.
- Patterns: local patterns for implementation. File locations and short snippets only. Do not paste large source blocks.

6. **Final answer**: If any design question remains open, follow `references/design_discussion_review_answer.md`. If all resolved, follow `references/design_discussion_final_answer.md`. Fill the selected template exactly: `{artifact_link}` and `{artifact_file}` use the saved canonical task-root-relative path (the template carries the `@`). Add no prose before or after the template. Commit the canonical path and `index.json` explicitly as `docs(task): design-discussion artifact`. A legacy task without `index.json` follows the conventions' legacy rules.
