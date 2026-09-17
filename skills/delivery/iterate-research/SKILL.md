---
name: iterate-research
description: Run for /iterate-research requests. Update an existing research artifact from feedback or additional questions.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Iterate Research

Revise an existing research document. Keep it as current-state technical explanation. Do not turn it into a proposal, diagnosis, or implementation plan unless the user explicitly changes the task.

## Input

When `@artifact` is passed, resolve it against the task directory listing. If a path is supplied, confirm it is inside the task directory unless the user clearly named an external source file for evidence. Otherwise list the task directory and select the newest artifact of type `research` (exclude research-questions). Do not read `ticket.md` or an artifact the user withheld.

- One research artifact: read it fully and proceed.
- Multiple: use the newest of type `research` unless the user named one; ask when the choice is unclear.
- None: reply "I'm ready to revise the research artifact. Send the research document or the area to investigate, and I will update it with current evidence." and wait.

Beyond `task.md`, do not read `ticket.md`, research-questions files, design artifacts, plans, or PR descriptions unless the user names them. Iteration starts from the selected research document and the user's feedback.

## Steps

1. **Locate the task**. Locate the task directory and read `task.md` per the conventions; when none exists, create it from the user's message as the conventions describe.

2. **Read the artifact fully**. Read references/research_final_answer.md from this skill's directory. Read the selected research artifact completely. Understand the selected research artifact's frontmatter, research question, summary, findings, code references, architecture notes, open questions. Do not browse other files in the task directory as background.

3. **Process feedback**. Read the feedback the user supplied (message or named file) fully. Classify: additional research (gather evidence), correction (revise stale sections), clarification (improve clarity). There are no comment identifiers, no resolve step, and no delete step: apply the change, or say why it was not applied.

4. **Research when needed**. Read named files fully before starting child workers. Use `agent-codebase-locator` (find files, dirs, tests, docs, config), `agent-codebase-analyzer` (explain current behavior), `agent-codebase-pattern-finder` (gather examples and conventions), `agent-web-search-researcher` (external docs for dependencies). For each, start a child worker for role `agent-<role>` with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message. Use roles sparingly. Start with a locator if the relevant code is unknown; rank what it returns in step 5 before reading. Send analyzers to specific files, flows, or components after you have candidate paths. Use pattern-finder for examples already present in the repository. Use web-search only when external sources are relevant, and require links in the output. Start independent lanes before waiting.

5. **Rank what the locator returned before reading it**. For each question a locator served, write its candidates as `[{id, text}]` to a temporary JSON file outside the repository (`mktemp`): `id` the path or `path:lines` the locator reported, `text` the excerpt the locator quoted or, when it gave only a path and a reason, that reason plus the file's first lines from `sed -n '1,15p' <path>`; a few hundred characters each, never a whole file. Run `node <skills dir>/typed-judgment/judge.mjs rerank --query '<the question>' <file> --json`, where `<skills dir>` is the directory that contains this skill, then delete the file. Read the candidates with `level` 3 first, then 2, and level 1 only when those leave the question open; skip level 0. When `any` is below 0.2, run one more locator pass with different search terms and rank again before reading anything. This is the conventions' read budget in practice: repository files reach you through workers, and you open directly only the files you will cite, best candidates first. The ranking is recorded nowhere except as the order of the evidence in the artifact. When the helper is unavailable (exit 3, no `node`, or no `TYPESAFE_API_KEY`), read in the locator's order, entry points first, and add a `### Known limits` item saying judgments were skipped.

6. **Update in place**. Do not create a new research document for normal iteration. Wait for every child worker before editing the artifact. Revise the same artifact path. Integrate findings where they belong, ordered as step 5 ranked them. Update summary when the answer changes. Rewrite affected sections so narrative flows. Add or adjust diagrams, tables, call/file/component trees, contracts, pseudocode. Update testing patterns and code references with exact paths. Remove answered open questions. Add new open questions only for factual gaps that remain. No change log. If you encounter vague headings while editing, improve them as part of the revision. Replace the previous run's `### Known limits` items with this run's, or `None.`.

7. **Check every changed `path:line` claim, then save**. Write every claim this revision added or changed that carries a `path:line` or `path:A-B` pointer as `[{id, claim, source}]` to a temporary JSON file outside the repository (`mktemp`): `id` the pointer, `claim` the sentence as written, `source` the cited lines fetched with `sed -n 'A,Bp' <path>` (`sed -n 'Ap'` for one line); send the cited lines only, never the whole file. Run `node <skills dir>/typed-judgment/judge.mjs cite <file>`, then delete the file. Each row prints `id`, `supported`, `unsupported`, or `unclear`, and a probability. `unsupported`: reread the source; fix the claim or the pointer when the source shows something else, and drop the claim when the source contradicts it; never keep a claim the source contradicts. `unclear`: reread the source and decide yourself. When any claim was dropped, add a `### Known limits` item with the count of dropped claims. Then write the revised document to the same path. When the helper is unavailable (exit 3, no `node`, or no `TYPESAFE_API_KEY`), check each pointer yourself against the cited lines and add a `### Known limits` item saying judgments were skipped.

8. **Check coverage after saving**. Write the questions under the artifact's `## Research Question` section, plus any question the feedback added, as `[{id, text}]` (`id` the question number, `text` the question sentence without its role tag) to a temporary JSON file outside the repository (`mktemp`). Run `node <skills dir>/typed-judgment/judge.mjs coverage <file> <artifact path>`, then delete the file. Each row prints `id`, `answered`, `partial`, or `missing`, and a probability. For every `missing` question, start one worker (a single call, the role the question needs) with that question alone; merge what it finds into the sections, repeat step 7 for the new claims, and save again. A question still `missing` after that call is listed under `## Open Questions` and named in `### Known limits`; each `partial` question is named in `### Known limits` with what is still missing. Do not start a further pass. When the helper is unavailable (exit 3, no `node`, or no `TYPESAFE_API_KEY`), inspect `## Open Questions` yourself and add a `### Known limits` item saying judgments were skipped.

9. **Final answer**. Read references/research_final_answer.md and respond using that template only. Fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-type-slug.md](.agents/tasks/<slug>/NN-type-slug.md)`, and fill the `Known limits:` lines from the artifact's `### Known limits` list. The last lines must be exactly one fenced `text` block copied from the template. Never repeat the current command `/iterate-research` as the next step. Fill `{next_command}` from `workflow` in `task.md`: `/create-design-discussion` for `full`, `/create-structure-outline` for `lean`, `/create-prd` for `prd`, `/create-epic-plan` for `epic`. When not run by the workflow engine, commit the saved file with `git add <path>` as `docs(task): research artifact`.

## Document style

Document the existing codebase. Explain current behavior. Show where files, components, services, data, tests, config live. Cite concrete evidence. Include external links when used. Keep sections concept-oriented and readable. Do not recommend changes, diagnose bugs (unless asked), rate code quality, suggest refactors/optimizations, or argue for a future design.

- Headings assert the takeaway: "The daemon records session state before publishing updates", not "Daemon".
- Use tables, Mermaid, call/file/component trees, type/endpoint/schema shapes, pseudocode. No diff blocks.
- Testing patterns: document for each affected findings section (paths, type, fixtures, mocks, harnesses, or "no coverage found").

If unresolved factual questions remain after revision, add after the review sentence: "There are N open questions that need review; you can ask for another research pass, provide the answers, or tell me to remove them as irrelevant."
