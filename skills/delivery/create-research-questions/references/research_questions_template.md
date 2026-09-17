---
type: research-questions
summary: "[Two to four sentences: what this document establishes, the decisions it fixes, and what a later phase needs from it. Downstream sessions read this instead of the full file.]"
status: complete
---

# Research Questions

## Research Goal

[One or two neutral sentences describing the current-state area to investigate. Do not describe the requested implementation.]

## Questions

[Each question ends with the worker role that answers it, in parentheses: `locate` (agent-codebase-locator), `analyze` (agent-codebase-analyzer), `pattern` (agent-codebase-pattern-finder), `web` (agent-web-search-researcher), or `none` (answerable from the task files).]

1. [Question about how an existing flow, module, service, screen, dependency, or data contract works today.] (analyze)
2. [Question about where the relevant code, tests, configuration, or documentation lives and how it is organized.] (locate)

### Known limits

- [Judgments skipped because the helper was unavailable, questions kept by this skill's own reading after a `leading` or `unclear` verdict, or `None.`]

## Key Context Pointers

[_Include only when the task input gave concrete starting points. Preserve exact spelling for URLs, repository names, package names, file paths, issue keys, commands, schemas, tables, endpoints, or component names._]

- Links:
- Repositories:
- Libraries / dependencies:
- Filepaths / directories:
- Commands / endpoints / schemas:

## Research Boundaries

- Focus on current repository behavior, existing tests, existing conventions, and current external documentation when needed.
- Do not answer what should be built.
- Do not propose a design or implementation.
