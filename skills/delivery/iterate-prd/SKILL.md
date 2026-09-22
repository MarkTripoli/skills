---
name: iterate-prd
description: Run for /iterate-prd requests. Refine an existing Product Requirements Document artifact.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Iterate PRD

You refine an existing PRD from feedback or continued questioning. Use creation discipline, operate on existing artifact, resolve one point at a time.

## Operating Principles

- Guide conversation. After applying one change or answering one decision, pause for next direction.
- Rework sections; do not append notes. PRD reads as current spec, not Q&A transcript or edit history.
- Ask exactly one question per message when continuing interview.
- Do not edit while decision is being discussed. Patch only after resolution.
- Show visual changes with updated mockups when UI, flows, states, layouts are discussed.
- Keep section and sub-point titles informative for skimming.
- Stay in product space. Put implementation consequences under Deferred to TDD or leave for TDD.

## Initial Check

If user gives no feedback, no artifact argument, no instruction to continue, ask which path and wait: "I can revise the PRD now. Choose one path: send concrete edits, continue the product decision interview, or ask me to identify the next unresolved product choice."

## References

Read from this skill directory: `references/prd_template.md`, `references/prd_final_answer.md`.

## Continue Product Interview Mode

If user wants to keep resolving choices: read PRD fully, identify sparse or unresolved Solution Details; do not require a prewritten question list. Present next decision only (state question, offer two or three options with tradeoffs, recommend based on user value and patterns, create/update mockups for UI choices, treat clarifying discussion as conversation). Once resolved, rework PRD to weave decision into sections. Continue one at a time until user stops or solution complete. When complete and approved, use final answer template.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists.

2. **Find and read**: Resolve target PRD from `@file`; otherwise use current `design.prd` from `index.json`. Read the PRD, feedback, mockups, and user-mentioned files fully. Use current indexed summaries for other artifacts.

3. **Validate feedback**: Do not accept corrections blindly. Read named files. Verify uncertain facts with direct reads or child research.

4. **Start child research when needed**: Start a child worker for role `agent-codebase-locator` (finds files/tests), `agent-codebase-analyzer` (explains behavior), `agent-codebase-pattern-finder` (finds precedents), or `agent-web-search-researcher` (checks external docs) with the assignment (see the conventions' Child workers section) when a missing fact would change the artifact; wait for it; read its final message. Use only findings you have read from the worker's final message. If a child or direct read discovers current-state facts missing or stale in completed research, fold those into the research artifact before finalizing the PRD.

5. **Update PRD**: Copy current PRD to the next `design.prd` iteration and update that new file; never edit a recorded iteration. Preserve frontmatter/sections and weave resolved decisions into narrative. A legacy task without `index.json` follows the conventions' in-place rule.

6. **Update mockups when feedback changes visuals**: Edit existing `mockup-<description>.html` files in the task directory when they represent same decision. Create new only when feedback introduces distinct UI choice. Link each mockup from the artifact with a relative Markdown link.

7. **Stop and ask next**: After incorporating feedback, stop. State change briefly, ask what to work on next, offer next decision if unresolved parts remain. Never continue to another change without user direction.

8. **Finish when user is done**: Record the new iteration through the conventions' Recording an artifact flow, then follow `references/prd_final_answer.md` exactly. Fill `{artifact_link}` and `{artifact_file}` with the canonical task-root-relative path. Commit that path and `index.json` explicitly as `docs(task): prd artifact`.
