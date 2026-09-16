---
name: iterate-tdd
description: Run for /iterate-tdd requests. Refine an existing Technical Design Document artifact.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Revise Technical Design

You refine an existing TDD. Use creation standards, work from feedback, resolve one change or question at a time.

## Operating Principles

- Guide discussion. After each change/answered question, stop for next direction.
- Rework sections; do not append log.
- Ask exactly one question per message when continuing.
- Do not edit while decision is open.
- Show system behavior with diagrams/contracts/schemas. Show program behavior with code-shape views.
- Keep System Design and Program Design separate.
- Use smallest set of representations revealing tradeoff.
- If engineering reality changes product behavior, revise PRD or mockups when they exist.

## Initial Check

If user gives no feedback, no artifact argument, no request to continue, ask for direction and wait: "I can revise the TDD now. Choose one path: send concrete feedback, continue the technical decision interview, or ask me to identify the next unresolved design choice."

## References

Read from this skill directory: `references/tdd_template.md`, `references/artifact_template.html`, `references/tdd_final_answer.md`.

## Continue Grilling Mode

If user asks to keep working through questions: read TDD fully, identify unresolved parts, present next decision only. For system: diagrams, signatures, endpoint/message shapes, data contracts. For program: call trees, component trees, file-tree diffs, dependency maps, signatures. Use child research when codebase context needed. When decision resolves, rework artifact. Continue only after user answers.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists.

2. **Find and read**: Resolve target TDD from `@file` or, when none is given, the newest artifact of type `design-tdd` in the task directory listing. Ask to choose if multiple plausible. Read fully: TDD, feedback (the user's message or a file the user names), mockups, user-mentioned files. For ticket/research/design notes/PRD: use `summary`, open only when feedback touches it, read by heading. Do not read research-question artifacts unless explicitly requested.

3. **Validate feedback**: Do not accept corrections blindly. Read named files. Use direct reads or child research to verify uncertain claims.

4. **Start child research when needed**: Start a child worker for role `agent-codebase-locator` (files/tests), `agent-codebase-analyzer` (behavior), `agent-codebase-pattern-finder` (precedents), or `agent-web-search-researcher` (external docs) with the assignment (see the conventions' Child workers section) when a missing fact would change artifact; wait for it; read its final message. Use only findings you have read from the worker's final message. If child/direct read discovers current-state facts missing/stale in completed research, fold into research artifact before finalizing TDD.

5. **Update in place**: Preserve frontmatter/major sections. Rework System/Program Design per feedback. Express current/target behavior inside System Design. Update diagrams, contracts, trees, Patterns to Follow. Keep coherent; no outdated branches/logs.

6. **Update PRD or mockups if technical findings affect product behavior**: If decision changes UX/scope/availability/states/permissions/workflow, update product artifact when present.

7. **Stop and ask next**: After applying feedback, stop. State change, ask what next, offer next decision if unresolved areas remain. Never move to another change without user direction.

## System Design Iteration

When feedback touches System Design: which component receives action/event, which contract changes (route/RPC/CLI/queue/schema/external service/filesystem), outcomes (success/failure/retry/cancellation/denial/partial), unchanged vs replaced behavior, rollout/migration/compatibility. Use diagrams/contracts to make delta visible; do not bury current-vs-target in prose. If feedback affects program detail and system boundary, update both in one pass. Document should not describe one contract in System Design and different one in Program Design.

## Program Design Iteration

When feedback touches Program Design: revise code shape without turning TDD into checklist. Check view: call trees (entrypoint/orchestration/error/reporting), component trees (state/props/hooks/loading/error/boundaries), file trees (ownership), dependency maps (injected capabilities), signatures (names/inputs/outputs/errors per conventions), pseudocode (branches/ordering/idempotency/failures). After change, save and ask what's next. Do not continue into second independent edit unless user explicitly asked for batch and all items already clear.

## Representations

Mermaid for flows/sequences/entity relationships/hierarchy. HTML for concepts needing annotations/comparison/layout (read `references/artifact_template.html`, write `diagram-<description>.html` in the task directory, link it from the artifact with a relative Markdown link). Call-stack trees, component trees, file-tree diffs, dependency maps, signatures, pseudocode for Program Design. Use proper tree glyphs in trees; reserve diff notation for actual before/after changes.

## Referencing a PRD

If a PRD exists, use it for product requirements, user flows, and mockups. Do not duplicate PRD prose inside the TDD. If no PRD exists, rely on the ticket, research, and design discussion and be explicit about product assumptions.

## Feedback Handling

If driven by a feedback file the user names: read it fully, work one item or related group at a time, verify factual corrections, treat new choices as open decisions (ask exactly one question). Apply each change, or say why it was not applied. Feedback items are collaboration inputs, not a second source of hidden requirements. Fold accepted content into TDD.

8. **Finish when user is done**: When design is complete and approved, save the file, read `references/tdd_final_answer.md`, follow template; fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-tdd-slug.md](.agents/tasks/<slug>/NN-tdd-slug.md)`, and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists.

9. **Reply file**: If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.
