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

First, locate the task directory and read `task.md` per the conventions, creating it from the user's message when none exists. Then read primary inputs fully: PRD if present (the newest artifact of type `design-prd`), otherwise task/ticket plus design discussion (or the newest artifact of type `research` when no design discussion exists), and user-mentioned files. For other artifacts in the task directory listing: use `summary` field, open only when summary shows it bears on design, read by heading. Exclude research-question artifacts. Read `references/tdd_template.md` before creating.

PRD is helpful but not required. Cite inputs; do not duplicate. If requirements are thin, ask questions instead of inventing scope. When technical reality changes product behavior, make that explicit.

## Step 2: Write the skeleton

Take the next artifact number and write `NN-tdd-<slug>.md` in the task directory. Initial skeleton: frontmatter (`type: design-tdd`, task, repo, branch, sha), title, empty System Design and Program Design sections, Patterns to Follow header, What We're Not Doing only if meaningful non-goal exists. Save, then ask first system-design question.

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

When both phases are approved: save the file, read `references/tdd_final_answer.md`, follow the template exactly; fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-tdd-slug.md](.agents/tasks/<slug>/NN-tdd-slug.md)`, and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists.

Start child workers for role `agent-codebase-locator` (finds files/tests), `agent-codebase-analyzer` (explains behavior), `agent-codebase-pattern-finder` (finds precedents), or `agent-web-search-researcher` (checks external docs) with the assignment (see the conventions' Child workers section) when a missing fact would change the artifact; wait for each; read its final message. Use only findings you have read from the worker's final message. If a child or direct read discovers current-state facts missing or stale in completed research, fold those into the research artifact before finalizing the TDD.

If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.
