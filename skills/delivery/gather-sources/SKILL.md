---
name: gather-sources
description: Run for /gather-sources requests. Fetch the external sources a task names (docs, an existing PRD or spec, tickets, repositories, pages) and save a cited digest artifact that later phases read instead of fetching again.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Source Gathering Phase

You turn the sources a task points at into one artifact in the task directory: for each source, where it is, who owns it, what it says that bears on the task, and the exact passages a later phase would cite. Research, PRD, and TDD sessions select this artifact by its `type: sources` frontmatter and read it in place of fetching the sources themselves. An existing product document (a PRD in Notion, a spec in a wiki, a ticket thread) is a source like any other: its requirements arrive here as quoted excerpts, and `create-prd` builds this collection's PRD from them.

## Critical boundary: record what the sources say

Report each source in its own terms. Do not evaluate, rank, propose, or reconcile with the codebase; that is the research phase's work. Where sources disagree with each other, record both positions under `## Conflicts` and stop there.

## Steps

1. **Locate the task**. Locate the task directory and read `task.md` per the conventions; when none exists, create it from the user's message as the conventions describe.

2. **Read inputs fully**. Read references/sources_template.md and references/sources_final_answer.md from this skill's directory. Collect the source list from the user's message, files named with `@...`, `task.md`, and `ticket.md` when present: URLs, page links, issue or ticket keys, repository names, local paths, package names. Preserve every pointer exactly; do not normalize or paraphrase. When the task directory already holds an artifact of type `sources`, read it fully: this run extends that file in place and never allocates a new number for it. Do not read other artifacts.

3. **Fetch each source**. Use the mechanism the runtime provides, in this order: a read or fetch tool that accepts a URL or path; an MCP resource for the hosting product (Notion, Confluence, Jira, Google Docs, GitHub); `curl` with credentials already present in the environment; a browser tool with the user's session. For a documentation site, fetch `llms.txt` and the `.md` or `.txt` form of the page before the HTML. For a repository, clone it into a temporary directory outside the project (`mktemp -d`), read the paths the task names plus its README and top-level docs, and delete the clone before saving. For a PDF, use `pdftotext` when installed, otherwise the read tool. Fetch one source at a time and record how and when it was fetched. When no mechanism reaches a source, ask the user once for an export or a paste, record what they supply as `Fetched: provided by user`, and list anything still missing under `## Unreachable` with the cause and what the user can supply. Never write a token, cookie, or credential into the artifact.

4. **Digest each source**. Write one `### <source title>` section per source following the template. The digest states what the source says that bears on the task, in the source's own terms, in at most a few short paragraphs. Under `#### Excerpts`, quote verbatim every passage a later phase would cite: requirement statements, acceptance criteria, user flows, decisions and their dates, owners, API signatures, configuration keys, limits, numbers, deadlines. Give each excerpt a pointer inside the source (heading, section number, page, line, or anchor). Quote, never retype; a long list becomes its first lines plus the pointer to the rest. Leave out navigation, marketing, and anything unrelated to the task. Keep the artifact readable in full by a later phase: a source that needs more than about a page of excerpts gets the passages that name obligations, and a pointer to the rest.

5. **Record conflicts and gaps**. Fill `## Conflicts` with each place two sources disagree, quoting both, or `None.`. Fill `## Unreachable` from step 3, or `None.`. Fill `### Known limits` with sources fetched without a version or date, pages fetched as HTML because no text form existed, exports the user supplied instead of a live fetch, and anything else a later phase must know, or `None.`.

## Output

Follow references/sources_template.md. Frontmatter `summary` names the sources gathered and what a later phase gets from them. Take the next artifact number and save the file as `NN-sources-<2-4-word-kebab>.md` in the task directory, or save the existing sources artifact in place. Commit it with `git add <path>` as `docs(task): sources artifact`. Respond using references/sources_final_answer.md only: fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-sources-slug.md](.agents/tasks/<slug>/NN-sources-slug.md)`, fill the `Known limits:` lines from the artifact's `### Known limits` list, and add no prose before or after it.

`{next_command}` names the skill that owns the next artifact:

- The request asks to convert, import, adopt, or port an existing document that the sources hold, and no research is asked for: `/create-prd` when that document is a product one (a PRD, product spec, feature brief, requirements page); `/create-tdd` when it is a technical one (an RFC, design document, technical spec, architecture decision record). The owning skill writes its artifact from the excerpts in one pass.
- Otherwise the chain's first skill for the `workflow` in `task.md`: `/create-research-questions` for `full`, `lean`, and `epic`; `/create-research` for `prd`, `program`, and `oneshot`; `/reproduce-bug` for `bugfix`.

Use that mapping literally; source completeness does not advance the chain. A sources artifact is not codebase research. In a `lean`, `full`, or `epic` task, never jump from source gathering to an outline, design, plan, or implementation.

End with exactly one fenced `text` block holding that command.
