---
name: create-research
description: Answers the research questions by dispatching child workers and writes a cited current-state research artifact for the codebase. Use when running /create-research after /create-research-questions, or when asked how existing code works before any design; not for proposing changes, which the design and outline phases do.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Research Codebase

You orchestrate research for a task. Answer research questions by collecting current-state evidence from the repository, docs, and dependencies. Write one cohesive research artifact.

## Critical boundary: describe the system that exists

Document what exists today. Do not propose fixes, features, refactors, optimizations, architecture changes, cleanup, or root-cause analysis unless the user asks for diagnosis. Do not criticize code or call something a bug, smell, risk, or weakness. Do not let the ticket's desired outcome steer research beyond the neutral research questions.

Cite concrete files, lines, commands, schemas, docs, URLs.

## Input

If the user named a research-questions artifact with `@...`, use it. Otherwise select the current artifact of type `research-questions` through `index.json` per the conventions' Artifacts section. Do not read `ticket.md` or an artifact the user withheld.

- One research-questions artifact: read it fully.
- Multiple: use the current record of type `research-questions` unless the user named one; ask when the choice is unclear.
- None: reply "I'm ready to research the codebase. Please provide the research question or area to investigate, and I will document the relevant components and connections." and wait.

Beyond `task.md`, do not read `ticket.md`, design artifacts, plans, or PR descriptions unless the user names them. The research-questions document is the handoff. The exception is the current artifact of type `sources`, when one exists: read it fully; it holds the external material a `gather-sources` session fetched, with a digest and verbatim excerpts per source.

## Steps

1. **Locate the task**. Locate the task directory and read `task.md` per the conventions; when none exists, create it from the user's message as the conventions describe.

2. **Read named files first**. Read references/research_template.md from this skill's directory. If the user or research-questions doc names files, read them completely before starting child workers. Read the current digest-validated artifact of type `sources` when one exists; its excerpts are the evidence for any question about sourced material, cited by the source's location and pointer, and a `web` worker runs only for what they leave open.

3. **Decompose the research**. Break the query into independent areas. Plan before starting workers: entry points, persistence, state, events, APIs, commands, UI, tests, fixtures, dependency docs, directories.

4. **Start child workers**. Dispatch each research question to the worker its trailing role tag names: `locate` to `agent-codebase-locator` (find files, dirs, tests, config, docs), `analyze` to `agent-codebase-analyzer` (explain current behavior with citations), `pattern` to `agent-codebase-pattern-finder` (gather examples and conventions), `web` to `agent-web-search-researcher` (current external facts); `none` needs no worker. Use `web` only for current external facts no repository file, task file, or sources artifact holds; a vendor API reference the task supplies is not web. When a question carries no tag, write the untagged questions as `[{id, text}]` (`id` the question number, `text` the question sentence) to a temporary JSON file outside the repository (`mktemp`), run `node <skills-dir>/typed-judgment/judge.mjs route-question <file>` where `<skills-dir>` is the directory that contains this skill, delete the file, and use the printed role. For `undecided`, choose the role yourself. Without the helper, apply the conventions' typed-judgments fallback (choose the role yourself) and add a `### Known limits` item saying judgments were skipped. For each, start a child worker for role `agent-<role>` with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message. Combine questions that share a role and an area into one assignment. Do not launch one child per question by reflex. Aim for two to six child workers. An `analyze` or `pattern` question whose files are unknown gets a locator first; rank its candidates in step 5, then send the analyzer to the top candidates. Start independent lanes before waiting. Say what to find, not how.

5. **Rank what the locator returned before reading it**. For each question a locator served, write its candidates as `[{id, text}]` to a temporary JSON file outside the repository (`mktemp`): `id` the path or `path:lines` the locator reported, `text` the excerpt the locator quoted or, when it gave only a path and a reason, that reason plus the file's first lines from `sed -n '1,15p' <path>`; a few hundred characters each, never a whole file. Run `node <skills-dir>/typed-judgment/judge.mjs rerank --query '<the question>' <file> --json`, then delete the file. Read the candidates with `level` 3 first, then 2, and level 1 only when those leave the question open; skip level 0. When `any` is below 0.2, no candidate is likely to answer the question: run one more locator pass with different search terms and rank again before reading anything. Without the helper, apply the conventions' typed-judgments fallback (read in the locator's order, entry points first) and add a `### Known limits` item saying judgments were skipped.

6. **Synthesize**. Do not write the research artifact until all child workers finish or clearly fail. Wait for all children. Treat repository evidence as primary. Answer the research question directly. Connect findings across components. Cite exact paths and line numbers. Include web-research links when used. Document tests for each area, including when none found.

7. **Draft the document**. Gather metadata: timestamp, git commit, branch, repo name, topic, research-questions artifact name. Follow the structure from references/research_template.md. Write a complete document, not notes for later completion. Order each section's evidence as step 5 ranked it. Fill `### Known limits` with the items the steps above produced, or `None.`.

8. **Save, then check every `path:line` claim**. Allocate the next immutable `research.primary` iteration and save its staging document before checking citations. Run `node <skills-dir>/typed-judgment/judge.mjs cite-artifact <saved file>`, where `<skills-dir>` is the directory that contains this skill, from the repository root. It checks every backticked `path:line` or `path:A-B` pointer against the cited lines and prints the artifact line (`L<n>`), `id`, `supported`, `unsupported`, `unclear` or `unresolved` (the file or lines do not exist from the repository root), and a probability. `unresolved`: fix the pointer, or ignore a span that is not a file pointer. `unsupported`: reread the source; fix the claim or the pointer when the source shows something else, and drop the claim when the source contradicts it; never keep a claim the source contradicts. `unclear`: reread the source and decide yourself. When any claim was dropped, add a `### Known limits` item with the count of dropped claims, and save again. Without the helper, apply the conventions' typed-judgments fallback (check each pointer yourself against the cited lines) and add a `### Known limits` item saying judgments were skipped.

9. **Check coverage, then run the second pass**. Write the research questions as `[{id, text}]` (`id` the question number, `text` the question sentence without its role tag) to a temporary JSON file outside the repository (`mktemp`). Run `node <skills-dir>/typed-judgment/judge.mjs coverage <file> <saved artifact>`, then delete the file. Each row prints `id`, `answered`, `partial`, or `missing`, and a probability. For every `missing` question, start one worker (a single call, the role its tag names) with that question alone; merge what it finds, repeat step 8 for the new claims, and save the staging successor. A question still `missing` after that call is listed under `## Open Questions` and named in `### Known limits`; each `partial` question is named in `### Known limits` with what is still missing. This is the only second pass; do not start another. Remove answered open questions. Without the helper, apply the conventions' typed-judgments fallback (inspect `## Open Questions` yourself, start children once for factual gaps one pass could close) and add a `### Known limits` item saying judgments were skipped.

10. **Final answer**. Record the checked staging document as the next immutable `research.primary` iteration, then respond using references/research_final_answer.md only. Fill `{artifact_link}` with the canonical recorded path and `{next_command}` from `workflow` in `task.md`:
    - `full`: `/create-design-discussion`
    - `lean`: `/create-structure-outline`
    - `prd` or `program`: `/create-prd`
    - `epic`: `/create-epic-plan`

11. **Follow-up**. If the user asks follow-up questions after the artifact exists, record the answers as the next iteration of the same series per the conventions' Iteration section; never edit an earlier iteration's file.

## Document style

Write a purposeful technical explainer, not a dump or worksheet. Use prose, tables, Mermaid, call trees, file trees, component trees, type signatures, schemas, pseudocode. Keep factual and current-state only. No `diff` blocks.

- State behavior, then cite where it appears. Use file ranges like `src/app.ts:57-80`.
- Prefer concept-first prose over path inventory.

If open questions remain after the second pass, add after the line "Open the artifact link above to review it before continuing." in the reply: "There are N open questions that need review; you can ask for another research pass, provide the answers, or tell me to remove them as irrelevant."
