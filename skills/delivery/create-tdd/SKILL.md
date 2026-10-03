---
name: create-tdd
description: Guides a System Design then Program Design interview and writes a Technical Design Document artifact with work breakdown and execution DAG, or converts an existing RFC or spec in one pass. Use when the user runs /create-tdd, asks for a technical design, or after the PRD is approved; for revisions use /iterate-tdd.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# TDD Phase

You create a Technical Design Document explaining how agreed product behavior will be built. Product requirements and UX belong upstream; this phase owns architecture, interfaces, data movement, code shape, tradeoffs.

Run as interview: System Design (behavior across components), then Program Design (code shape inside). System Design must be approved before Program Design begins.

## Conversation Rules

- Ask exactly one question per message. Two or three options inside that question are allowed; multiple independent questions are not.
- Present decision, tradeoffs, recommendation, then wait.
- Treat pushback and clarifying questions as conversation. Patch the TDD only when the decision resolves.
- Use diagrams, signatures, endpoint shapes, file trees, call trees, or pseudocode when they clarify the decision.
- If engineering constraints alter scope or UX, make that explicit and revise the PRD or mockups when they exist.

## References

Read from this skill directory: `references/tdd_template.md`.

## Step 1: Understand the context

First, resolve the task directory using the repository-configured task root and read `task.md` per the conventions, creating it from the user's message when none exists. For indexed tasks, read and validate `index.json`; select current artifacts through each canonical series' `current` pointer, never by scanning for the newest file. Read primary inputs fully: the current PRD when present; otherwise the task or ticket plus current `design.discussion`, or current `research.primary` when no design discussion exists; current `research.sources` when present; and user-mentioned files. For other artifacts, use their index `summary` fields to choose relevant context, opening only those relevant to design and reading by heading. Exclude research-question artifacts. Only when `index.json` is genuinely absent, follow the conventions' legacy artifact-selection rules. Read `references/tdd_template.md` before creating.

If a PRD exists, cite it; do not duplicate it. If none, take scope from the ticket and design discussion and state product assumptions in the first System Design paragraph. If scope is still unclear after reading them, ask one question before Step 2. When technical reality changes product behavior, make that explicit.

When the request asks to convert, import, adopt or port an existing RFC, technical spec or architecture decision held by current `research.sources` or a user-named file, read [references/convert_existing_tdd.md](references/convert_existing_tdd.md) instead of Steps 2–6.

Start a child worker for role `agent-codebase-locator`, `agent-codebase-analyzer`, `agent-codebase-pattern-finder` or `agent-web-search-researcher` only when a missing fact changes the artifact; read its final message before using findings. New or corrected repository facts go into a successor `research.primary` iteration, not an overwrite. Keep gathered source receipts unchanged and put relevant repository facts in the TDD.

## Step 2: Write the skeleton

Allocate the next immutable `design.tdd` iteration through the conventions' Recording an artifact flow. Initial skeleton: frontmatter (`type: design-tdd`, task, repo, branch, sha), title, empty System Design and Program Design sections, Patterns to Follow header, What We're Not Doing only if meaningful non-goal exists. Save the staging document, then ask the first system-design question; record it when ready for handoff.

Write `### Execution DAG` from [references/execution_dag.md](references/execution_dag.md) for the task's selected workflow.

First question opens largest unresolved architectural branch: where behavior runs (backend), user action/event (UI+server), state ownership/migration (persistence), control loop/failure mode (reliability), component responsibility/state flow (UI-only). Ask one question with options and recommendation. Do not pre-fill answer.

## Step 3: System Design

Design how system changes across boundaries. Explain existing and target behavior in System Design section.

Per decision: ask one question, present options with tradeoffs/recommendation, use fitting representation (Mermaid sequence/flow, endpoint shape, message contract, data contract, signature, or HTML artifact), wait, rework section.

Use Mermaid for interactions/flow. Use signatures for boundary contracts. Use endpoint/message shapes for transport. Use data contracts when schema is the decision; match codebase style. For concepts needing annotations/layout/color, write `diagram-<description>.html` in the task directory using `references/artifact_template.html` classes, link it from the artifact with a relative Markdown link.

## Step 4: System Design review gate

When cross-component design is settled, stop and ask user to review System Design top to bottom. Incorporate fixes. Do not begin Program Design until user approves. Read `references/tdd_system_review_answer.md` and reply with it exactly, filled as Step 7 fills the final answer template.

## Step 5: Program Design

Design in-code shape. Almost every question includes code-shape block.

Per decision: ask one question, show options (call-stack trees, component trees, file ownership, dependency maps, signatures, pseudocode), recommend based on conventions/risk, wait, rework Program Design and Patterns to Follow.

Use call-stack tree for orchestration, component tree for UI (include names, hooks, context wrappers, package/route), file-tree diff for ownership (proper glyphs `├──`, `└──`, `│`; inside diff: `+` additions, `-` removals, space context), dependency map for seams, signatures for new helpers/contracts, pseudocode for logic when real code over-specifies.

Program-design questions usually show two or three concrete shapes. A message without a code block should be unusual.

After a resolved decision: rewrite affected subsection, update invalidated trees/signatures/maps, adjust Patterns to Follow with local examples, update System Design if contract changes, flag PRD if product behavior changes.

Program Design is not a task list or implementation plan.

## Step 6: Program Design review gate

When code shape is settled, stop and ask user to review Program Design. Gate catches module boundaries awkward in full design, dependencies hiding test behavior, migration/rollout problems, stale diagrams, or PRD implications. Incorporate fixes. Read `references/tdd_program_review_answer.md` and reply with it exactly. Do not read the final answer template until user approves both System Design and Program Design.

## Step 7: Wrap up

When both phases are approved: write `### Engineering Work Breakdown` with stable work-item ids, a `subgraph` per independent track, verification and gate nodes, one `Critical path:` line, and a proof column naming an observable command, request, state, or review decision rather than "code written". Write `### Execution DAG` as the fixed chain of `task.md`'s `workflow` value from the phases and gate set in `workflows/delivery.md`. Then record the `design.tdd` iteration, read `references/tdd_final_answer.md`, and follow the template exactly; fill `{artifact_link}` and `{artifact_file}` with the saved canonical task-root-relative path (the template carries the `@`), and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists. Add no prose before or after the template. A legacy task without `index.json` follows the conventions' legacy rules.

Start child workers for role `agent-codebase-locator` (finds files/tests), `agent-codebase-analyzer` (explains behavior), `agent-codebase-pattern-finder` (finds precedents), or `agent-web-search-researcher` (checks external docs) with the assignment (see the conventions' Child workers section) when a missing fact would change the artifact; wait for each; read its final message. Use only findings you have read from the worker's final message. If a child or direct read discovers current-state facts missing or stale in completed research, fold those into the research artifact before finalizing the TDD.
