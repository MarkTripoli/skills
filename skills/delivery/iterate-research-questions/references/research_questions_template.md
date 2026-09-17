---
date: [ISO timestamp]
git_commit: [commit]
branch: [branch]
repository: [repo]
topic: "[topic]"
type: research-questions
summary: "[Two to four sentences: what this document establishes, the decisions it fixes, and what a later phase needs from it. Downstream sessions read this instead of the full file.]"
tags: [research-questions, iteration]
status: complete
---

# Research Questions

## Research Goal

[One or two neutral sentences describing the current-state area to investigate. Do not describe the requested implementation.]

## Key Context Pointers

[_Include only concrete starting points used in this pass. Preserve exact spelling for URLs, repository names, package names, file paths, issue keys, commands, schemas, tables, endpoints, or component names._]

- Links:
- Repositories:
- Libraries / dependencies:
- Filepaths / directories:
- Commands / endpoints / schemas:

## Questions

[Each question ends with the worker role that answers it, in parentheses: `locate` (agent-codebase-locator), `analyze` (agent-codebase-analyzer), `pattern` (agent-codebase-pattern-finder), `web` (agent-web-search-researcher), or `none` (answerable from the task files).]

1. [Question about how an existing flow, module, service, screen, dependency, or data contract works today.] (analyze)
2. [Question about where the relevant code, tests, configuration, or documentation lives and how it is organized.] (locate)

### Known limits

- [Judgments skipped because the helper was unavailable, questions kept by this skill's own reading after a `leading` or `unclear` verdict, or `None.`]

## Open Questions

[List unknowns that blocked sharper questions. Use "None." when there are none.]

## Next Step
Name the command from the final-answer template.
