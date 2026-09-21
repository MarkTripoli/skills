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
2. **Read inputs**: Resolve the target design discussion from `@file`; otherwise use current `design.discussion` from `index.json`. Read the templates, target, feedback, and user-mentioned files fully. Read summaries of other current indexed artifacts and open only relevant sections. Exclude research questions unless asked.
3. **Verify user input**: Do not accept corrections blindly. Read named files. Verify claims with source reads or child research if artifacts do not prove them. Map each feedback item to the sections it affects before editing.
4. **Start child research when extra context would change design**: Use agent-codebase-locator (file discovery), agent-codebase-analyzer (behavior), agent-codebase-pattern-finder (local precedents), agent-web-search-researcher (external refs). For each, start a child worker for role `agent-<role>` with the assignment (see the conventions' Child workers section); wait for it; read its final message. The worker's final message is the deliverable; use only findings you have read from it. Skip child workers for straightforward wording or already-verified decisions.
5. **Create the revision**: Copy the current discussion to the next `design.discussion` iteration and rework it; never edit a recorded iteration. Rewrite `### Execution DAG` from current `orchestration.execution`. Fold feedback into relevant sections without a change log. A legacy task without `index.json` follows the conventions' in-place rule.

**Content**: Keep request summary, current behavior, target behavior, non-goals current. Update diagrams, pseudocode, trees, HTML artifacts when end state changes. Present options and tradeoffs for new open questions. Record final decisions only when user or newer artifact resolved them. Re-check code examples before keeping them; include only snippets that help implementation follow the intended pattern.

6. **Final answer**: Record the new iteration through the conventions' Recording an artifact flow. Follow the appropriate answer template exactly; fill `{artifact_link}` and `{artifact_file}` with the canonical task-root-relative path. Commit that path and `index.json` explicitly as `docs(task): design-discussion artifact`.
