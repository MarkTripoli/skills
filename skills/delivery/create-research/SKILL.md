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

Beyond `task.md`, do not read `ticket.md`, design artifacts, plans, or PR descriptions unless the user names them. The research-questions document is the handoff. The exception is the newest artifact of type `sources`, when one exists: read it fully; it holds the external material a `gather-sources` session fetched, with a digest and verbatim excerpts per source.

## Steps

1. **Locate the task**. Locate the task directory and read `task.md` per the conventions; when none exists, create it from the user's message as the conventions describe.

2. **Read named files first**. Read references/research_template.md from this skill's directory. If the user or research-questions doc names files, read them completely before starting child workers. Read the newest artifact of type `sources` when one exists; for a `web` question its excerpts are the external evidence, cited by the source's location and pointer, and a web worker runs only for what the sources leave open.

3. **Decompose the research**. Break the query into independent areas. Plan before starting workers: entry points, persistence, state, events, APIs, commands, UI, tests, fixtures, dependency docs, directories.

4. **Start child workers**. Dispatch each research question to the worker its trailing role tag names: `locate` to `agent-codebase-locator` (find files, dirs, tests, config, docs), `analyze` to `agent-codebase-analyzer` (explain current behavior with citations), `pattern` to `agent-codebase-pattern-finder` (gather examples and conventions), `web` to `agent-web-search-researcher` (external docs for dependencies, SDKs, APIs); `none` needs no worker. When a question carries no tag, write the untagged questions as `[{id, text}]` (`id` the question number, `text` the question sentence) to a temporary JSON file outside the repository (`mktemp`), run `node <skills dir>/typed-judgment/judge.mjs route-question <file>` where `<skills dir>` is the directory that contains this skill, delete the file, and use the printed role. For `undecided`, or when the helper is unavailable (exit 3, no `node`, or no `TYPESAFE_API_KEY`), choose the role yourself and add a `### Known limits` item saying judgments were skipped. For each, start a child worker for role `agent-<role>` with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message. Combine questions that share a role and an area into one assignment. Do not launch one child per question by reflex. Aim for two to six child workers. An `analyze` or `pattern` question whose files are unknown gets a locator first; rank its candidates in step 5, then send the analyzer to the top candidates. Use web-search only for external, modern, or dependency-specific facts. Start independent lanes before waiting. Say what to find, not how.

5. **Rank what the locator returned before reading it**. For each question a locator served, write its candidates as `[{id, text}]` to a temporary JSON file outside the repository (`mktemp`): `id` the path or `path:lines` the locator reported, `text` the excerpt the locator quoted or, when it gave only a path and a reason, that reason plus the file's first lines from `sed -n '1,15p' <path>`; a few hundred characters each, never a whole file. Run `node <skills dir>/typed-judgment/judge.mjs rerank --query '<the question>' <file> --json`, then delete the file. Read the candidates with `level` 3 first, then 2, and level 1 only when those leave the question open; skip level 0. When `any` is below 0.2, no candidate is likely to answer the question: run one more locator pass with different search terms and rank again before reading anything. This is the conventions' read budget in practice: repository files reach you through workers, and you open directly only the files you will cite, best candidates first. The ranking is recorded nowhere except as the order of the evidence in the artifact. When the helper is unavailable (exit 3, no `node`, or no `TYPESAFE_API_KEY`), read in the locator's order, entry points first, and add a `### Known limits` item saying judgments were skipped.

6. **Synthesize**. Do not write the research artifact until all child workers finish or clearly fail. Wait for all children. Treat repository evidence as primary. Answer the research question directly. Connect findings across components. Cite exact paths and line numbers. Include web-research links when used. Document tests for each area, including when none found.

7. **Write the document**. Gather metadata: timestamp, git commit, branch, repo name, topic, research-questions artifact name. Follow the structure from references/research_template.md. Write a complete document, not notes for later completion. Order each section's evidence as step 5 ranked it. Fill `### Known limits` with the items the steps above produced, or `None.`.

8. **Check every `path:line` claim, then save**. Write every statement that carries a `path:line` or `path:A-B` pointer as `[{id, claim, source}]` to a temporary JSON file outside the repository (`mktemp`): `id` the pointer, `claim` the sentence as written, `source` the cited lines fetched with `sed -n 'A,Bp' <path>` (`sed -n 'Ap'` for one line); send the cited lines only, never the whole file. Run `node <skills dir>/typed-judgment/judge.mjs cite <file>`, then delete the file. Each row prints `id`, `supported`, `unsupported`, or `unclear`, and a probability. `unsupported`: reread the source; fix the claim or the pointer when the source shows something else, and drop the claim when the source contradicts it; never keep a claim the source contradicts. `unclear`: reread the source and decide yourself. When any claim was dropped, add a `### Known limits` item with the count of dropped claims. Then take the next artifact number and save the file as `NN-research-<2-4-word-kebab>.md` in the task directory. When the helper is unavailable (exit 3, no `node`, or no `TYPESAFE_API_KEY`), check each pointer yourself against the cited lines and add a `### Known limits` item saying judgments were skipped.

9. **Check coverage, then run the second pass**. Write the research questions as `[{id, text}]` (`id` the question number, `text` the question sentence without its role tag) to a temporary JSON file outside the repository (`mktemp`). Run `node <skills dir>/typed-judgment/judge.mjs coverage <file> <saved artifact>`, then delete the file. Each row prints `id`, `answered`, `partial`, or `missing`, and a probability. For every `missing` question, start one worker (a single call, the role its tag names) with that question alone; merge what it finds into the sections and save again. A question still `missing` after that call is listed under `## Open Questions` and named in `### Known limits`; each `partial` question is named in `### Known limits` with what is still missing. This is the only second pass; do not start another. Remove answered open questions. When the helper is unavailable (exit 3, no `node`, or no `TYPESAFE_API_KEY`), inspect `## Open Questions` yourself, start children once for factual gaps one pass could close, and add a `### Known limits` item saying judgments were skipped.

10. **Final answer**. Read references/research_final_answer.md and respond using that template only. Fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-type-slug.md](.agents/tasks/<slug>/NN-type-slug.md)`, and fill the `Known limits:` lines from the artifact's `### Known limits` list. The last lines must be one fenced `text` block copied from the template, not an inline command. Never repeat the current command `/create-research` as the next step. Fill `{next_command}` from `workflow` in `task.md`: `/create-design-discussion` for `full`, `/create-structure-outline` for `lean`, `/create-prd` for `prd`, `/create-epic-plan` for `epic`. When not run by the workflow engine, commit the saved file with `git add <path>` as `docs(task): research artifact`.

11. **Follow-up**. If the user asks follow-up questions after the artifact exists, update the same document in place.

## Document style

Write a purposeful technical explainer, not a dump or worksheet. Use prose, tables, Mermaid, call trees, file trees, component trees, type signatures, schemas, pseudocode. Keep factual and current-state only. No `diff` blocks.

- Headings state the finding: "Session rows are derived from event records", not "Sessions".
- State behavior, then cite where it appears. Use file ranges like `src/app.ts:57-80`.
- Prefer concept-first prose over path inventory.
- Code References: comprehensive for the researched area, grouped by subsystem. Say when exhaustive vs representative.
- Testing patterns: include for every major findings section (unit, e2e, harness, paths, mocking, fixtures, or "no tests found").

If open questions remain after the second pass, mention the count only in the template's designated place: "There are N open questions that need review; you can ask for another research pass, provide the answers, or tell me to remove them as irrelevant."
