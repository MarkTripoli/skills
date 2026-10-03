---
name: iterate-research-questions
description: Revises an existing research-questions artifact from feedback, keeping the questions neutral and role-tagged. Use when running /iterate-research-questions, or when the user wants questions added, reworded, or removed before research; not for a first draft, which /create-research-questions writes.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Iterate Research Questions

Revise an existing research-questions document. Preserve its purpose: neutral query plan for studying the current system, not a plan for the requested implementation.

## Input

The invocation may provide a research-questions path, an `@artifact` reference, a feedback file, pasted feedback, or instructions. Resolve the selected artifact within the task directory; if only a task directory or slug is given, select the current `research.questions` through `index.json`. Do not substitute a different artifact when an explicit one was named.

- One research-questions artifact: read it.
- Multiple: use the newest of type `research-questions` unless the user named one; ask when the choice is unclear.

Beyond `task.md`, do not read `ticket.md`, design artifacts, research artifacts, plans, PR descriptions, or unrelated task files unless the user explicitly names them. Iteration is scoped to the research-questions document and feedback.

## Steps

1. **Locate the task**. Locate the task directory and read `task.md` per the conventions; when none exists, create it from the user's message as the conventions describe.

2. **Read the artifact fully**. Read the selected research-questions artifact completely. Understand the current questions, frontmatter, key context pointers, boundaries.

3. **Read feedback**. Read the feedback the user supplied (message or named file) fully, including any explicit `@...` input. There are no comment identifiers, no resolve step, and no delete step: apply the change, or say why it was not applied.

4. **Create the revision**. Copy current questions into the next `research.questions` iteration and edit that new file; never edit a recorded iteration. Preserve frontmatter and **Key Context Pointers**. Keep existing pointers verbatim and add newly provided links, repositories, libraries, dependencies, paths, commands, and issue keys. A legacy task without `index.json` follows the conventions' in-place rule.

5. **Check neutrality and route the revised questions**. Write every new or rewritten question as `[{id, text}]` (`id` the question number, `text` the question sentence alone, without its role tag) to a temporary JSON file outside the repository (`mktemp`); include unchanged questions only when the artifact carries no role tags yet. Run `node <skills-dir>/typed-judgment/judge.mjs neutral <file>` and `node <skills-dir>/typed-judgment/judge.mjs route-question <file>`, where `<skills-dir>` is the directory that contains this skill, then delete the file. Each command prints one line per question: `id`, verdict, probability or confidence.
   - `leading`: rewrite the question so it establishes before it asks, then run `neutral` once more on the rewritten questions. Before: "Why does the retry loop in `src/upload.ts` drop the last chunk?" After: "How does `src/upload.ts` handle a chunk whose upload fails, and what happens to the final chunk of a file?" A question still `leading` after the second run is kept or rewritten by your own reading of the question guidelines below and named under `### Known limits`. `unclear`: reread it against the question guidelines and decide yourself.
   - End each routed question with the `route-question` role in parentheses: `locate` (`agent-codebase-locator`), `analyze` (`agent-codebase-analyzer`), `pattern` (`agent-codebase-pattern-finder`), `web` (`agent-web-search-researcher`), or `none` (answerable from the task files). Keep the tags of unchanged questions. For `undecided`, choose the role yourself by what the question asks for: where something lives (`locate`), how it works (`analyze`), existing examples (`pattern`). Use `web` only for current external facts no repository file, task file, or sources artifact holds; a vendor API reference the task supplies is not web. The research phase dispatches each question to the worker its tag names.
   - Without the helper, apply the conventions' typed-judgments fallback (your own reading for neutrality, your own tag for each question) and add a `### Known limits` item saying judgments were skipped.
   - Replace the previous run's `### Known limits` items with this run's, or `None.`.

6. **Check neutrality and route the revised questions**. Write every new or rewritten question as `[{id, text}]` (`id` the question number, `text` the question sentence alone, without its role tag) to a temporary JSON file outside the repository (`mktemp`); include unchanged questions only when the artifact carries no role tags yet. Run `node <skills-dir>/typed-judgment/judge.mjs neutral <file>` and `node <skills-dir>/typed-judgment/judge.mjs route-question <file>`, where `<skills-dir>` is the directory that contains this skill, then delete the file. Each command prints one line per question: `id`, verdict, probability or confidence.
   - `leading`: rewrite the question so it establishes before it asks, then run `neutral` once more on the rewritten questions. Before: "Why does the retry loop in `src/upload.ts` drop the last chunk?" After: "How does `src/upload.ts` handle a chunk whose upload fails, and what happens to the final chunk of a file?" A question still `leading` after the second run is kept or rewritten by your own reading of step 5 and named under `### Known limits`. `unclear`: reread it against step 5 and decide yourself.
   - End each routed question with the `route-question` role in parentheses: `locate` (`agent-codebase-locator`), `analyze` (`agent-codebase-analyzer`), `pattern` (`agent-codebase-pattern-finder`), `web` (`agent-web-search-researcher`), or `none` (answerable from the task files). Keep the tags of unchanged questions. For `undecided`, choose the role yourself by what the question asks for: where something lives (`locate`), how it works (`analyze`), existing examples (`pattern`), external documentation (`web`). The research phase dispatches each question to the worker its tag names.
   - When the helper is unavailable (exit 3, no `node`, or no `TYPESAFE_API_KEY`), keep your own reading for neutrality, choose every tag yourself, and add a `### Known limits` item saying judgments were skipped so the reply carries it in one line. Replace the previous run's `### Known limits` items with this run's, or `None.`.

7. **Final answer**. If changed, record the next immutable `research.questions` iteration through the conventions' Recording an artifact flow. If no edit is needed, do not create an iteration. Read references/research_questions_final_answer.md and respond using that template only; fill `{artifact_link}` and `{artifact_file}` with the saved canonical task-root-relative path (the template already carries the `@`), and fill the `Known limits:` lines from the artifact's `### Known limits` list. End with exactly one fenced `text` block containing `/create-research @<the saved path>`. A legacy task without `index.json` follows the conventions' legacy rules.

## Question guidelines

Questions center on the codebase and systems as they are now: what exists, where behavior and data live, how pieces interact, which contracts, patterns, dependencies, tests, and edge cases are present. Remove or rewrite wording that asks how to build the feature, where to put new code, whether to refactor, or which approach is preferable. Do not include build instructions or solution guesses, suggest improvements unless the user requests improvement analysis, reveal the implementation route, or turn the artifact into a checklist. Use two to eight questions; more only when the request spans several systems. If the request could touch frontend behavior, UI, theming, or accessibility, keep or add a question on the design system in use: component library, tokens or literal colors, typography, spacing, radius, elevation, responsive and theming conventions, visual regression assets.
