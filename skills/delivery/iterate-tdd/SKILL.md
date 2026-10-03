---
name: iterate-tdd
description: Revises an existing Technical Design Document as an immutable successor from feedback or a continuing technical-decision interview, keeping System Design and Program Design consistent. Use when the user runs /iterate-tdd, sends TDD comments, or asks which design choice remains open; to start a TDD use /create-tdd.
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

## Initial Check

If user gives no feedback, no artifact argument, no request to continue, ask for direction and wait: "I can revise the TDD now. Choose one path: send concrete feedback, continue the technical decision interview, or ask me to identify the next unresolved design choice."

## References

Read from this skill directory: `references/tdd_template.md`, `references/artifact_template.html`, `references/tdd_review_answer.md`, `references/tdd_final_answer.md`, `references/execution_dag.md`.

## Continue the Technical Decision Interview

If user asks to keep working through questions: read TDD fully, identify unresolved parts, present next decision only. For system: diagrams, signatures, endpoint/message shapes, data contracts. For program: call trees, component trees, file-tree diffs, dependency maps, signatures. Use child research when codebase context needed. When decision resolves, rework artifact. Continue only after user answers.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists.

2. **Find and read**: Resolve target TDD from `@file`; otherwise use current `design.tdd` from `index.json`. Read TDD, feedback, mockups, and user-mentioned files fully. Use current indexed summaries for other artifacts.

3. **Validate feedback**: Do not accept corrections blindly. Read named files. Use direct reads or child research to verify uncertain claims. When a feedback file drives the session, work one item or related group at a time, treat new choices as open decisions (ask exactly one question), and apply each change or say why it was not applied.

4. **Start child research when needed**: Use an `agent-codebase-locator`, `agent-codebase-analyzer`, `agent-codebase-pattern-finder` or `agent-web-search-researcher` worker only when a missing fact changes the TDD; read its final message before using findings. Correct repository facts through a `research.primary` successor. Leave gathered source receipts unchanged and put relevant repository facts in the TDD.

5. **Create the revision**: Copy current TDD to the next `design.tdd` iteration and update that new file; never edit a recorded iteration. Preserve frontmatter/sections and rewrite `### Execution DAG` from task.md workflow and workflows/delivery.md. A legacy task without `index.json` follows the conventions' in-place rule.

6. **Reconcile product impact**: When a technical decision changes UX, scope, states, permissions or workflow, record a product artifact successor and updated mockups when present; never overwrite an indexed PRD.

7. **Stop and ask next**: After applying feedback, stop. State change, ask what next, offer next decision if unresolved areas remain. Never move to another change without user direction. When changes remain open at the end of the turn, end with `references/tdd_review_answer.md` filled as Step 8 fills the final answer template.

8. **Finish when approved**: Record the checked `design.tdd` successor, read `references/tdd_final_answer.md`, and fill it exactly. `{artifact_link}` and `{artifact_file}` name its canonical worktree-relative path; Check and Known limits come from Human Review. Add no extra prose. Keep task files local and uncommitted.

## System Design Iteration

When feedback touches System Design: which component receives action/event, which contract changes (route/RPC/CLI/queue/schema/external service/filesystem), outcomes (success/failure/retry/cancellation/denial/partial), unchanged vs replaced behavior, rollout/migration/compatibility. Use diagrams/contracts to make delta visible; do not bury current-vs-target in prose. For a concept needing annotations, comparison or layout, read `references/artifact_template.html`, write `diagram-<description>.html` in the task directory, and link it from the artifact with a relative Markdown link. If feedback affects program detail and system boundary, update both in one pass. Document should not describe one contract in System Design and different one in Program Design.

## Program Design Iteration

When feedback touches Program Design: revise code shape without turning TDD into checklist. Check view: call trees (entrypoint/orchestration/error/reporting), component trees (state/props/hooks/loading/error/boundaries), file trees (ownership), dependency maps (injected capabilities), signatures (names/inputs/outputs/errors per conventions), pseudocode (branches/ordering/idempotency/failures). Use proper tree glyphs in trees; reserve diff notation for actual before/after changes. After change, save and ask what's next. Do not continue into second independent edit unless user explicitly asked for batch and all items already clear.

## Referencing a PRD

If a PRD exists, use it for product requirements, user flows, and mockups. Do not duplicate PRD prose inside the TDD. If no PRD exists, rely on the ticket, research, and design discussion and be explicit about product assumptions.
