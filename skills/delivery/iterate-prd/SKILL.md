---
name: iterate-prd
description: Revises an existing Product Requirements Document as an immutable successor from feedback or a continuing product-decision interview, one decision at a time. Use when the user runs /iterate-prd, sends PRD review comments, or asks which product choice remains open; to start a PRD use /create-prd.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Iterate PRD

You refine an existing PRD from feedback or continued questioning. Use creation discipline, operate on existing artifact, resolve one point at a time.

## Operating Principles

- Ask exactly one question per message when continuing interview.
- Do not edit while decision is being discussed. Patch only after resolution.
- Show visual changes with updated mockups when UI, flows, states, layouts are discussed.
- Keep section and sub-point titles informative for skimming.
- Stay in product space. Leave implementation consequences for the TDD; record any that change product behavior under `### Known limits`.
- Keep each Solution Details behavior one EARS sentence that names the actor and uses `shall` with an observable outcome, in one of five shapes:
  - Ubiquitous: `The <system> shall <response>.`
  - Event-driven: `WHEN <trigger>, the <system> shall <response>.`
  - State-driven: `WHILE <state>, the <system> shall <response>.`
  - Optional feature: `WHERE <feature is enabled>, the <system> shall <response>.`
  - Unwanted behavior: `IF <condition>, THEN the <system> shall <response>.`

  Feedback that joins two behaviors with "and also" becomes two behaviors; a vague term becomes the question that settles it.

## Choosing the path

1. No feedback, no artifact argument, and no instruction to continue: ask which path and wait: "I can revise the PRD now. Choose one path: send concrete edits, continue the product decision interview, or ask me to identify the next unresolved product choice."
2. Concrete edits: follow the Steps below.
3. The user wants to keep resolving choices: read the PRD fully and take the next sparse or unresolved Solution Details decision, one question per message with two or three options, their tradeoffs, a recommendation, and a mockup for a UI choice. Treat clarifying discussion as conversation. Once resolved, rework the PRD to weave the decision into its sections, then follow Steps 5-7.

## References

Read from this skill directory: `references/prd_template.md`, `references/prd_review_answer.md`, `references/prd_final_answer.md`.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists.

2. **Find and read**: Resolve target PRD from `@file`; otherwise use current `design.prd` from `index.json`. Read the PRD, feedback, mockups, and user-mentioned files fully. Use current indexed summaries for other artifacts.

3. **Validate feedback**: Do not accept corrections blindly. Read named files. Verify uncertain facts with direct reads or child research.

4. **Start child research when needed**: Use an `agent-codebase-locator`, `agent-codebase-analyzer`, `agent-codebase-pattern-finder` or `agent-web-search-researcher` worker only when a missing fact changes the PRD; read its final message before using findings. Correct repository facts through a `research.primary` successor. Leave gathered source receipts unchanged and put relevant repository facts in the PRD.

5. **Update PRD**: Copy current PRD to the next `design.prd` iteration and update that new file; never edit a recorded iteration. Preserve frontmatter/sections and weave resolved decisions into narrative. A legacy task without `index.json` follows the conventions' in-place rule.

6. **Update mockups when feedback changes visuals**: Edit existing `mockup-<description>.html` files in the task directory when they represent same decision. Create new only when feedback introduces distinct UI choice. Link each mockup from the artifact with a relative Markdown link.

7. **Stop and ask next**: After incorporating feedback, stop. State change briefly, ask what to work on next, offer next decision if unresolved parts remain. Never continue to another change without user direction. When the user's changes remain open at the end of the turn, end with `references/prd_review_answer.md` filled as Step 8 fills the final answer template.

8. **Finish when user is done**: Record the new iteration through the conventions' Recording an artifact flow, then follow `references/prd_final_answer.md` exactly. Fill `{artifact_link}` and `{artifact_file}` with the canonical task-root-relative path.
