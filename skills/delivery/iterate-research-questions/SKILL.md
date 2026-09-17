---
name: iterate-research-questions
description: Run for /iterate-research-questions requests. Update an existing research-questions artifact from feedback.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Iterate Research Questions

Revise an existing research-questions document. Preserve its purpose: neutral query plan for studying the current system, not a plan for the requested implementation.

## Input

The invocation may provide the research-questions file path, an `@artifact` reference (resolve it against the task directory listing), a feedback file the user names, pasted feedback, or plain-language instructions. If only a task directory or slug is given, list the task directory and select the newest artifact of type `research-questions`.

- One research-questions artifact: read it.
- Multiple: use the newest of type `research-questions` unless the user named one; ask when the choice is unclear.

Beyond `task.md`, do not read `ticket.md`, design artifacts, research artifacts, plans, PR descriptions, or unrelated task files unless the user explicitly names them. Iteration is scoped to the research-questions document and feedback.

## Steps

1. **Locate the task**. Locate the task directory and read `task.md` per the conventions; when none exists, create it from the user's message as the conventions describe.

2. **Read the artifact fully**. Read references/research_questions_final_answer.md from this skill's directory. Read the selected research-questions artifact completely. Understand the current questions, frontmatter, key context pointers, boundaries.

3. **Read feedback**. Read the feedback the user supplied (message or named file) fully, including any explicit `@...` input. There are no comment identifiers, no resolve step, and no delete step: apply the change, or say why it was not applied.

4. **Update in place**. Keep YAML frontmatter intact unless feedback specifically asks for a valid metadata correction. Preserve **Key Context Pointers**. Keep existing pointers verbatim, add newly provided links, repos, libraries, dependencies, paths, commands, issue keys.

5. **Keep questions objective**. Revised questions describe discovery only: what exists, where behavior/data lives, how pieces interact, what contracts/patterns/dependencies/tests/edge cases are present. Remove or rewrite wording that asks how to build the feature, where to put new code, whether to refactor, or what approach is preferable.

6. **Check neutrality and route the revised questions**. Write every new or rewritten question as `[{id, text}]` (`id` the question number, `text` the question sentence alone, without its role tag) to a temporary JSON file outside the repository (`mktemp`); include unchanged questions only when the artifact carries no role tags yet. Run `node <skills dir>/typed-judgment/judge.mjs neutral <file>` and `node <skills dir>/typed-judgment/judge.mjs route-question <file>`, where `<skills dir>` is the directory that contains this skill, then delete the file. Each command prints one line per question: `id`, verdict, probability or confidence.
   - `leading`: rewrite the question so it establishes before it asks, then run `neutral` once more on the rewritten questions. Before: "Why does the retry loop in `src/upload.ts` drop the last chunk?" After: "How does `src/upload.ts` handle a chunk whose upload fails, and what happens to the final chunk of a file?" A question still `leading` after the second run is kept or rewritten by your own reading of step 5 and named under `### Known limits`. `unclear`: reread it against step 5 and decide yourself.
   - End each routed question with the `route-question` role in parentheses: `locate` (`agent-codebase-locator`), `analyze` (`agent-codebase-analyzer`), `pattern` (`agent-codebase-pattern-finder`), `web` (`agent-web-search-researcher`), or `none` (answerable from the task files). Keep the tags of unchanged questions. For `undecided`, choose the role yourself by what the question asks for: where something lives (`locate`), how it works (`analyze`), existing examples (`pattern`), external documentation (`web`). The research phase dispatches each question to the worker its tag names.
   - When the helper is unavailable (exit 3, no `node`, or no `TYPESAFE_API_KEY`), keep your own reading for neutrality, choose every tag yourself, and add a `### Known limits` item saying judgments were skipped so the reply carries it in one line. Replace the previous run's `### Known limits` items with this run's, or `None.`.

7. **Final answer**. If changed, write back to the same path and fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-type-slug.md](.agents/tasks/<slug>/NN-type-slug.md)`. If no edit is needed, do not create a duplicate file. Read references/research_questions_final_answer.md and respond using that template only; fill the `Known limits:` lines from the artifact's `### Known limits` list. End with exactly one fenced `text` block containing `/create-research`. When not run by the workflow engine, commit the saved file with `git add <path>` as `docs(task): research-questions artifact`.

## Question guidelines

Questions center on codebase and systems as they are now. Do not include build instructions, solution guesses, suggest improvements (unless user requests improvement analysis), ask what changes should happen, reveal the implementation route, or turn artifact into a checklist. Good questions ask for current-state explanation: "How does [FEATURE] work end to end, and which systems participate?" "What contract connects [COMPONENT1] and [COMPONENT2], and where is it implemented?" "How does logic flow from [ENTRY POINT] to [PERSISTENCE OR EXTERNAL SERVICE]?" "Where is [DATABASE TABLE, COLUMN, EVENT, API, OR CONFIG] read or written, and what current behavior depends on it?" Use three to eight questions for most tasks. Use fewer only for narrow work; use more only when the request spans several systems.

If frontend work is plausible, keep or add design-system questions: component libraries, token systems, color values, typography, spacing, borders, shadows, responsive conventions, theming behavior.
