---
name: create-prd
description: Guides a one-question-at-a-time interview and writes a Product Requirements Document artifact with EARS behavior statements, or converts an existing PRD in one pass. Use when the user runs /create-prd, asks for a PRD or product spec, or after research or a design discussion; for revising an existing PRD use /iterate-prd.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# PRD Phase

You create a Product Requirements Document explaining what the product should do and why. Leave implementation architecture, storage, and code for TDD unless a technical constraint changes product behavior.

Run as a guided conversation. Settle foundation (problem, Success Measures), then walk solution one decision at a time. Document becomes a coherent spec, not a transcript.

## Conversation Rules

- Ask exactly one question per message. Two or three options inside that question are allowed; do not stack independent decisions.
- Do not ask vague review prompts. Ask the next decision unlocking the most progress.
- Treat clarifying questions and pushback as discussion, not permission to edit.
- Patch PRD only when decision is resolved.
- When decision lands, rework section. Replace stale prose, update mockups, move ruled-out choices to alternatives or out of scope.
- Keep readable as product spec. Headers state takeaway, short paragraphs, visuals near explanatory text.
- Stay in product space: user flows, behavior, permissions, states, constraints, success criteria. Defer implementation mechanics to TDD.
- Record each behavior in Solution Details as one EARS sentence that names the actor and uses `shall` with an observable outcome, in one of five shapes:
  - Ubiquitous: `The <system> shall <response>.`
  - Event-driven: `WHEN <trigger>, the <system> shall <response>.`
  - State-driven: `WHILE <state>, the <system> shall <response>.`
  - Optional feature: `WHERE <feature is enabled>, the <system> shall <response>.`
  - Unwanted behavior: `IF <condition>, THEN the <system> shall <response>.`

  A behavior carrying "and also" is two behaviors; a vague term ("fast", "secure", "works correctly") is a decision nobody made yet, so ask the question that settles it.
- If codebase reality or product behavior is unclear, verify before presenting options.

## References

Read from this skill directory: `references/prd_template.md`.

## Step 1: Understand the context

First, resolve the task directory using the repository-configured task root and read `task.md` per the conventions, creating it from the user's message when none exists. For indexed tasks, read and validate `index.json`; select current artifacts through each canonical series' `current` pointer, never by scanning for the newest file. Read the primary inputs fully: the task or ticket; the current `design.discussion`, or current `research.primary` when no design discussion exists; current `research.sources` when present; and user-mentioned files. For other artifacts, use their index `summary` fields to choose relevant context, opening only those artifacts and reading by heading. Exclude research-question artifacts. Only when `index.json` is genuinely absent, follow the conventions' legacy artifact-selection rules. Read `references/prd_template.md` before writing.

For a Jira-backed task, read the current indexed `research.jira` artifact fully as a primary input. Carry its confirmed functional specifications and source pointers into Solution Details; put proposed behavior in open decisions or known limits, not in an approved requirement. The QA guide informs verification but does not itself add product scope.

PRD can start from detailed ticket, research, design discussion, gathered sources, or short request. Ground claims in source. Reference upstream artifacts; do not copy. If context is thin, ask questions instead of inventing. Capture product implications of technical constraints; leave implementation for TDD.

When the request asks to convert, import, adopt or port an existing PRD, product spec or brief held by current `research.sources` or a user-named file, read [references/convert_existing_prd.md](references/convert_existing_prd.md) instead of Steps 2–5.

Outside this case, a sources artifact that holds a product document is an input to the interview: draft Problem to Solve, the Success Measures, and each Solution Details behavior from its excerpts, quoting the source and its pointer beside each, and confirm or amend each drafted decision one question at a time instead of rediscovering it.

If work touches UI, mockups look like the user's product, not a generic template. Check research for colors, typography, spacing, components, theming. If none documented, start a child worker for role `agent-codebase-analyzer` to identify the design system before creating mockups.

Start a child worker for role `agent-codebase-locator`, `agent-codebase-analyzer`, `agent-codebase-pattern-finder` or `agent-web-search-researcher` only when a missing fact changes the artifact; read its final message before using findings. New or corrected repository facts go into a successor `research.primary` iteration, not an overwrite. Keep gathered source receipts unchanged and put relevant repository facts in the PRD.

## Step 2: Write the skeleton

Allocate the next immutable `design.prd` iteration through the conventions' Recording an artifact flow. Keep first skeleton small: frontmatter with `type: design-prd`, task, repo, branch, sha; title; first draft Problem to Solve; empty headers for success signal, Proposed Solution, Alternative Solutions Considered, Solution Details, Out of Scope. Save the staging document while interviewing; record it only when the iteration is ready for handoff. Quote Problem to Solve so user reacts to exact wording.

## Step 3: Settle the foundation

Build foundation one decision at a time, wait after each. Problem to Solve: iterate until user agrees, then rework. Success Measures: propose lever showing whether work helped (metric, adoption, benchmark, error rate, latency, qualitative review; for tiny changes, valid to record no metric if user agrees). Do not open solution until both settled.

## Step 4: Solution interview

Ask one product decision at a time. State decision, present two or three options with tradeoffs and recommendation, use HTML mockup for visual UI choices (link it from the artifact with a relative Markdown link), discuss until resolved, rework Proposed Solution, Solution Details, Alternative Solutions Considered, Out of Scope, and mockups.

Mockups: write `mockup-<description>.html` in the task directory, use real labels and realistic data, focus each on current decision, update linked mockups as decisions change.

## Step 5: Solution review gate

When solution seems complete, stop. Ask user to read Solution Details top to bottom and confirm spec hangs together. Incorporate fixes. Then read `references/prd_review_answer.md` and reply with it exactly, filled as Step 6 fills the final answer template.

## Step 6: Wrap up

When user approves solution: record the `design.prd` iteration, read `references/prd_final_answer.md`, and follow the template exactly. Fill `{artifact_link}` and `{artifact_file}` with the saved canonical task-root-relative path (the template carries the `@`), and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists. Add no prose before or after the template. A legacy task without `index.json` follows the conventions' legacy rules.

Start child workers for role `agent-codebase-locator` (finds files/tests), `agent-codebase-analyzer` (explains behavior), `agent-codebase-pattern-finder` (finds precedents), or `agent-web-search-researcher` (checks external docs) with the assignment (see the conventions' Child workers section) when a missing fact would change the artifact; wait for each; read its final message. Use only findings you have read from the worker's final message. If a child or direct read discovers current-state facts missing or stale in completed research, fold those into the research artifact before finalizing the PRD.
