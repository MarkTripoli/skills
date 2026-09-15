---
name: create-research-questions
description: Run for /create-research-questions requests. Draft a neutral query plan for the research phase.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Research Planning Phase

You draft a research-questions artifact: a short query plan that lets the next session document the repository, dependencies, and surrounding systems as they exist now. Turn the user's request and allowed inputs into questions that drive objective discovery, not design.

## Steps

1. **Locate the task**. Locate the task directory and read `task.md` per the conventions; when none exists, create it from the user's message as the conventions describe.

2. **Read inputs fully**. Read references/research_questions_template.md and references/research_questions_final_answer.md from this skill's directory. Read `ticket.md` from the task directory when present, files the user named with `@...`, and collateral docs the user tells you to use. Do not inspect unrelated artifacts. Capture exact pointers: URLs, docs links, issue/ticket/PR refs, repo names, local paths, package names, SDKs, frameworks, services, file paths, dirs, commands, schemas, tables, endpoints, component names. Preserve these pointers exactly in the artifact. Do not normalize or paraphrase paths, package names, issue keys, or URLs.

3. **Light context pass**. Start child workers only when they quickly orient the question set. Keep shallow; next phase does real research. Use `agent-codebase-locator` (find files, dirs, tests, docs, config, entry points), `agent-codebase-analyzer` (explain current data flow or behavior for a narrow area), `agent-codebase-pattern-finder` (find existing examples and conventions), `agent-web-search-researcher` (external docs for dependencies, APIs, protocols, modern libraries). For each, start a child worker for role `agent-<role>` with the assignment (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message. Prefer one to four children. Skip if the ticket gives enough context.

4. **Draft questions**. Write questions a researcher can answer by inspecting the existing codebase, docs, tests, dependency references. Questions reveal how things work now, not what the implementation should become. Match the number of questions to the task. At least two questions, under eight unless unusually broad or the user asked for a larger plan. Strong questions point at likely evidence without leaking the intended change: "In `packages/ui`, how are modal actions wired from trigger to state update?" Weak questions ask the researcher to design: "How should we add X?" Do not ask how to build the feature, propose approaches, suggest improvements/cleanup/refactors/optimizations, disclose the desired solution, or frame as "should we" or "how would we". Do ask what exists and where, how modules/services/components/data/events/commands/tests connect, current contracts, edge cases, failure paths, permissions, config, state transitions, codebase conventions, dependencies or external API usage.

## Output

Follow references/research_questions_template.md. Fill **Key Context Pointers** when the input gives concrete links, packages, repos, dependencies, files, dirs, commands, endpoints, or issue refs. Omit only when truly none. Take the next artifact number and save the file as `NN-research-questions-<2-4-word-kebab>.md` in the task directory. Respond using references/research_questions_final_answer.md only. Fill the template fields, fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-type-slug.md](.agents/tasks/<slug>/NN-type-slug.md)`, and do not add extra prose before or after it. End with exactly one fenced `text` block containing `/create-research`. Do not invent cloud URLs.

If the request could touch frontend behavior, UI components, product screens, visual assets, HTML prototypes, theming, accessibility, or interaction design, include design-system discovery: which design system/component library/token layer, color tokens or literal colors (hex values), typography, spacing, radius, elevation, layout, responsive conventions, theming hooks, CSS variables, framework utilities, visual regression assets. This design-system topic is required for possible frontend work even when the ticket's UI details are vague. It exists so later mockups and implementation can match the product rather than inventing a one-off style.

If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.
