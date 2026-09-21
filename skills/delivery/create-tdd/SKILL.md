---
name: create-tdd
description: Run for /create-tdd requests. Create a guided Technical Design Document artifact.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# TDD Phase

You create a Technical Design Document explaining how agreed product behavior will be built. Product requirements and UX belong upstream; this phase owns architecture, interfaces, data movement, code shape, tradeoffs.

Run as interview: System Design (behavior across components), then Program Design (code shape inside). System Design must be approved before Program Design begins.

## Conversation Rules

- Ask exactly one question per message. Two or three options inside that question are allowed; multiple independent questions are not.
- Present decision, tradeoffs, recommendation, then wait.
- Treat pushback and clarifying questions as conversation. Patch the TDD only when the decision resolves.
- Rework affected sections; do not append notes. The TDD reads as a cohesive design, not a running list of answers.
- Use diagrams, signatures, endpoint shapes, file trees, call trees, or pseudocode when they clarify the decision.
- Use the smallest useful set of representations.
- If engineering constraints alter scope or UX, make that explicit and revise the PRD or mockups when they exist.

## References

Read from this skill directory: `references/tdd_template.md`, `references/artifact_template.html`, `references/tdd_final_answer.md`.

## Step 1: Understand the context

Locate the task and read `task.md`. Read current indexed primary inputs fully: `design.prd` when present, otherwise task/ticket plus `design.discussion` or `research.primary`; also read current `research.sources` and user-mentioned files. Use summaries from other current indexed artifacts. Exclude research questions. Read the template before creating.

PRD is helpful but not required. Cite inputs; do not duplicate. If requirements are thin, ask questions instead of inventing scope. When technical reality changes product behavior, make that explicit.

## Converting an existing technical document

When the request converts an existing RFC/design/spec and current `research.sources` (or a named file) holds it, skip the interview and write the TDD in one pass:

1. Map the source onto the template: its architecture, components, endpoints, data flow, and external systems become System Design; its module layout, call paths, and internal contracts become Program Design; its interfaces, schemas, and message shapes become Type Definitions; its settings, flags, and migrations become Configuration; its failure modes and recovery become Error Handling; its non-goals become What We're Not Doing. Beside each mapped statement cite the source as the sources artifact records it: location and pointer. Redraw a diagram the source gives as Mermaid only when its content is fully stated; otherwise link the source's visual by location.
2. Fill the blanks from the repository, not from the source: for each area the source names, start a child worker for role `agent-codebase-locator` or `agent-codebase-pattern-finder` (see the conventions' Child workers section), wait for it, read its final message, and write Local Patterns from what it found, cited with paths. Where the repository contradicts the source (a module, contract, or store the source assumes does not exist or differs), record the difference in the affected section and as a `### Known limits` item; do not resolve it.
3. A template section the source does not cover, and every item the source marks open (`TBD`, `TODO`, `open question`, `to be decided`), reads `Not stated in <source title>.` followed by the closest fact the source gives, never an invented decision. Each becomes one `### Known limits` item and one `### Verify` box naming the decision the reader must make.
4. Do not ask questions during the conversion. Wrap up per Step 7: save, commit, and reply with `references/tdd_final_answer.md`, whose `Check:` and `Known limits:` lines carry the blanks the reader fills before the plan.

## Step 2: Write the skeleton

Allocate the next immutable `design.tdd` iteration through the conventions' Recording an artifact flow. Initial skeleton: frontmatter (`type: design-tdd`, task, repo, branch, sha), title, empty System Design and Program Design sections, Patterns to Follow header, What We're Not Doing only if meaningful non-goal exists. Save the staging document, then ask the first system-design question; record it when ready for handoff.

First question opens largest unresolved architectural branch: where behavior runs (backend), user action/event (UI+server), state ownership/migration (persistence), control loop/failure mode (reliability), component responsibility/state flow (UI-only). Ask one question with options and recommendation. Do not pre-fill answer.

## Step 3: System Design

Design how system changes across boundaries. Explain existing and target behavior in System Design section.

Per decision: ask one question, present options with tradeoffs/recommendation, use fitting representation (Mermaid sequence/flow, endpoint shape, message contract, data contract, signature, or HTML artifact), wait, rework section.

Use Mermaid for interactions/flow. Use signatures for boundary contracts. Use endpoint/message shapes for transport. Use data contracts when schema is the decision; match codebase style. For concepts needing annotations/layout/color, write `diagram-<description>.html` in the task directory using `references/artifact_template.html` classes, link it from the artifact with a relative Markdown link.

## Step 4: System Design review gate

When cross-component design is settled, stop and ask user to review System Design top to bottom. Incorporate fixes. Do not begin Program Design until user approves.

## Step 5: Program Design

Design in-code shape. Almost every question includes code-shape block.

Per decision: ask one question, show options (call-stack trees, component trees, file ownership, dependency maps, signatures, pseudocode), recommend based on conventions/risk, wait, rework Program Design and Patterns to Follow.

Use call-stack tree for orchestration, component tree for UI (include names, hooks, context wrappers, package/route), file-tree diff for ownership (proper glyphs `├──`, `└──`, `│`; inside diff: `+` additions, `-` removals, space context), dependency map for seams, signatures for new helpers/contracts, pseudocode for logic when real code over-specifies.

Program-design questions usually show two or three concrete shapes. A message without a code block should be unusual.

After a resolved decision: rewrite affected subsection, update invalidated trees/signatures/maps, adjust Patterns to Follow with local examples, update System Design if contract changes, flag PRD if product behavior changes.

Program Design is not a task list or implementation plan.

## Step 6: Program Design review gate

When code shape is settled, stop and ask user to review Program Design. Gate catches module boundaries awkward in full design, dependencies hiding test behavior, migration/rollout problems, stale diagrams, or PRD implications. Incorporate fixes. Do not read final answer template until user approves both System Design and Program Design.

## Step 7: Wrap up

When both phases are approved: write `### Engineering Work Breakdown` with stable work-item ids, a `subgraph` per independent track, verification and gate nodes, one `Critical path:` line, and a proof column naming an observable command, request, state, or review decision rather than "code written". Write `### Execution DAG` from the current `orchestration.execution` artifact when one exists; when none exists, describe the fixed chain of `task.md`'s `workflow` value from the phases and gate set in `workflows/delivery.md`. Then record the `design.tdd` iteration, read `references/tdd_final_answer.md`, and follow the template exactly; fill `{artifact_link}` and `{artifact_file}` with the saved canonical task-root-relative path (the template carries the `@`), and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists. Add no prose before or after the template. Commit the canonical path and `index.json` explicitly as `docs(task): tdd artifact`. A legacy task without `index.json` follows the conventions' legacy rules.

Start child workers for role `agent-codebase-locator` (finds files/tests), `agent-codebase-analyzer` (explains behavior), `agent-codebase-pattern-finder` (finds precedents), or `agent-web-search-researcher` (checks external docs) with the assignment (see the conventions' Child workers section) when a missing fact would change the artifact; wait for each; read its final message. Use only findings you have read from the worker's final message. If a child or direct read discovers current-state facts missing or stale in completed research, fold those into the research artifact before finalizing the TDD.
