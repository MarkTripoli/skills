---
name: create-prd
description: Run for /create-prd requests. Create a guided Product Requirements Document artifact.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# PRD Phase

You create a Product Requirements Document explaining what the product should do and why. Leave implementation architecture, storage, and code for TDD unless a technical constraint changes product behavior.

Run as a guided conversation. Settle foundation (problem, success signal), then walk solution one decision at a time. Document becomes a coherent spec, not a transcript.

## Conversation Rules

- Ask exactly one question per message. Two or three options inside that question are allowed; do not stack independent decisions.
- Do not ask vague review prompts. Ask the next decision unlocking the most progress.
- Treat clarifying questions and pushback as discussion, not permission to edit.
- Patch PRD only when decision is resolved.
- When decision lands, rework section. Replace stale prose, update mockups, move ruled-out choices to alternatives or out of scope.
- Keep readable as product spec. Headers state takeaway, short paragraphs, visuals near explanatory text.
- Stay in product space: user flows, behavior, permissions, states, constraints, success criteria. Defer implementation mechanics to TDD.
- If codebase reality or product behavior is unclear, verify before presenting options.

## References

Read from this skill directory: `references/prd_template.md`, `references/prd_final_answer.md`.

## Step 1: Understand the context

First, locate the task directory and read `task.md` per the conventions, creating it from the user's message when none exists. Then read primary inputs fully: task or ticket, design discussion if present (otherwise the newest artifact of type `research`), every user-mentioned file. For other artifacts in the task directory listing: use `summary` field, open only when summary shows it bears on PRD, read by heading. Exclude research-question artifacts. Read `references/prd_template.md` before writing.

PRD can start from detailed ticket, research, design discussion, or short request. Ground claims in source. Reference upstream artifacts; do not copy. If context is thin, ask questions instead of inventing. Capture product implications of technical constraints; leave implementation for TDD.

If work touches UI, mockups look like the user's product, not a generic template. Check research for colors, typography, spacing, components, theming. If none documented, start a child worker for role `agent-codebase-analyzer` to identify the design system before creating mockups.

## Step 2: Write the skeleton

Take the next artifact number and write `NN-prd-<slug>.md` in the task directory. Keep first skeleton small: frontmatter with `type: design-prd`, task, repo, branch, sha; title; first draft Problem to Solve; empty headers for success signal, Proposed Solution, Alternative Solutions Considered, Solution Details, Out of Scope. Save, stop, open foundation with one question. Quote Problem to Solve so user reacts to exact wording.

## Step 3: Settle the foundation

Build foundation one decision at a time, wait after each. Problem to Solve: iterate until user agrees, then rework. Success signal: propose lever showing whether work helped (metric, adoption, benchmark, error rate, latency, qualitative review; for tiny changes, valid to record no metric if user agrees). Do not open solution until both settled.

## Step 4: Solution interview

Ask one product decision at a time. State decision, present two or three options with tradeoffs and recommendation, use HTML mockup for visual UI choices (link it from the artifact with a relative Markdown link), discuss until resolved, rework Proposed Solution, Solution Details, Alternative Solutions Considered, Out of Scope, and mockups.

Mockups: write `mockup-<description>.html` in the task directory, use real labels and realistic data, focus each on current decision, update linked mockups as decisions change.

## Step 5: Solution review gate

When solution seems complete, stop. Ask user to read Solution Details top to bottom and confirm spec hangs together. Incorporate fixes.

## Step 6: Wrap up

When user approves solution: save the file, read `references/prd_final_answer.md`, follow template exactly; fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-prd-slug.md](.agents/tasks/<slug>/NN-prd-slug.md)`, and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists. When not run by the workflow engine, commit the saved file with `git add <path>` as `docs(task): prd artifact`.

Start child workers for role `agent-codebase-locator` (finds files/tests), `agent-codebase-analyzer` (explains behavior), `agent-codebase-pattern-finder` (finds precedents), or `agent-web-search-researcher` (checks external docs) with the assignment (see the conventions' Child workers section) when a missing fact would change the artifact; wait for each; read its final message. Use only findings you have read from the worker's final message. If a child or direct read discovers current-state facts missing or stale in completed research, fold those into the research artifact before finalizing the PRD.
