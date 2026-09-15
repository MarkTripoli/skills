---
name: create-research
description: Run for /create-research requests. Research and document the current codebase from research questions.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Research Codebase

You orchestrate research for a task. Answer research questions by collecting current-state evidence from the repository, docs, and dependencies. Write one cohesive research artifact.

## Critical boundary: describe the system that exists

Document what exists today. Do not propose fixes, features, refactors, optimizations, architecture changes, cleanup, or root-cause analysis unless the user asks for diagnosis. Do not criticize code or call something a bug, smell, risk, or weakness. Do not let the ticket's desired outcome steer research beyond the neutral research questions.

Cite concrete files, lines, commands, schemas, docs, URLs.

## Input

If the user named a research-questions artifact with `@...`, use it. Otherwise list the task directory and select the newest artifact of type `research-questions`. Do not read `ticket.md` or an artifact the user withheld.

- One research-questions file: read it fully.
- Multiple: use the newest of type `research-questions` unless the user named one; ask when the choice is unclear.
- None: reply "I'm ready to research the codebase. Please provide the research question or area to investigate, and I will document the relevant components and connections." and wait.

Beyond `task.md`, do not read `ticket.md`, design artifacts, plans, or PR descriptions unless the user names them. The research-questions document is the handoff.

## Steps

1. **Locate the task**. Locate the task directory and read `task.md` per the conventions; when none exists, create it from the user's message as the conventions describe.

2. **Read named files first**. Read references/research_template.md from this skill's directory. If the user or research-questions doc names files, read them completely before starting child workers.

3. **Decompose the research**. Break the query into independent areas. Plan before starting workers: entry points, persistence, state, events, APIs, commands, UI, tests, fixtures, dependency docs, directories.

4. **Start child workers**. Use `agent-codebase-locator` (find files, dirs, tests, config, docs), `agent-codebase-analyzer` (explain current behavior with citations), `agent-codebase-pattern-finder` (gather examples and conventions), `agent-web-search-researcher` (external docs for dependencies, SDKs, APIs). For each, start a child worker for role `agent-<role>` with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message. Combine related questions. Do not launch one child per question by reflex. Aim for two to six child workers. Start with a locator when relevant files are unknown. Use analyzers after you have a likely path or component. Use pattern-finder when current conventions and examples matter. Use web-search only for external, modern, or dependency-specific facts. Start independent lanes before waiting. Say what to find, not how.

5. **Synthesize**. Do not write the research artifact until all child workers finish or clearly fail. Wait for all children. Treat repository evidence as primary. Answer the research question directly. Connect findings across components. Cite exact paths and line numbers. Include web-research links when used. Document tests for each area, including when none found.

6. **Write the document**. Gather metadata: timestamp, git commit, branch, repo name, topic, research-questions artifact name. Take the next artifact number and save the file as `NN-research-<2-4-word-kebab>.md` in the task directory. Follow the structure from references/research_template.md. Write a complete document, not notes for later completion.

7. **Optional second pass**. Inspect Open Questions. If one targeted pass could answer remaining factual gaps, start children once more (do this at most once). Merge findings into sections. Remove answered questions.

8. **Final answer**. Read references/research_final_answer.md and respond using that template only. Fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-type-slug.md](.agents/tasks/<slug>/NN-type-slug.md)`. The last lines must be one fenced `text` block copied from the template, not an inline command. Never repeat the current command `/create-research` as the next step. Choose the variant matching `workflow` in `task.md`: `full` -> `/create-design-discussion`, `lean` -> `/create-structure-outline`, `prd` -> `/create-prd`; delete the instruction line and the other variants.

9. **Follow-up**. If the user asks follow-up questions after the artifact exists, update the same document in place.

10. **Reply file**. If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.

## Document style

Write a purposeful technical explainer, not a dump or worksheet. Use prose, tables, Mermaid, call trees, file trees, component trees, type signatures, schemas, pseudocode. Keep factual and current-state only. No `diff` blocks.

- Headings state the finding: "Session rows are derived from event records", not "Sessions".
- State behavior, then cite where it appears. Use file ranges like `src/app.ts:57-80`.
- Prefer concept-first prose over path inventory.
- Code References: comprehensive for the researched area, grouped by subsystem. Say when exhaustive vs representative.
- Testing patterns: include for every major findings section (unit, e2e, harness, paths, mocking, fixtures, or "no tests found").

If open questions remain after the optional second pass, mention the count only in the template's designated place: "There are N open questions that need review; you can ask for another research pass, provide the answers, or tell me to remove them as irrelevant."
