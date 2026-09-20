---
type: research-questions
summary: "This query plan scopes current-state research into repository installation ownership, rerun behavior, setup metadata, tracker integrations, and workflow-skill conventions. It directs the research phase to inspect existing code and tests plus current Linear, Jira, and GitHub Issues documentation without selecting an implementation."
status: complete
---

# Research Questions

## Research Goal

Document how this repository currently installs and updates managed resources, records repository-level setup, integrates with ticketing providers, and adds workflow skills. Identify current external provider contracts only where they explain the surrounding systems in use or under consideration.

## Questions

1. How do `scripts/install.mjs` and its runtime adapters distinguish and reconcile collection-managed state from user-owned state across repeated installs, partial installs, uninstalls, and project or user scopes? (analyze)
2. Where does the repository currently define, create, read, or document repository-level setup metadata, including `ai-utilities.json`, `ticketing.tool`, and `vcs.platform`? (analyze)
3. Which current skills reference GitHub Issues, GitLab, `gh`, or `glab`, and what authentication checks, remote detection, mutations, rerun behavior, and failure reporting does each reference implement? (locate)
4. What existing files and checks record the rules and integration points for workflow skills across canonical sources, references, generated runtime resources, validation, documentation, and optional Atomic orchestration? (locate)
5. What existing tests and evaluations cover repeatable setup, preservation of unrelated repository or user state, provider-dependent behavior, and rerun outcomes? (locate)
6. Across Linear's, Atlassian's, and GitHub's current web documentation, what API or CLI contracts cover authentication, repository or project discovery, and repeatable label creation or update? (web)

### Known limits

- Questions 1, 2, and 4 were retained as neutral by this skill's own reading after the judgment helper returned `unclear`.
- Question 3 remained `leading` after the required rewrite and second neutrality pass; this skill kept it because it inventories existing references and behavior without asserting an outcome.
- Question 6 is tagged `web` from the worker-role definitions after the route helper returned `locate` despite the question requiring current external documentation.

## Key Context Pointers

- Libraries / dependencies: `Linear`; `Jira`; `GitHub Issues`
- Filepaths / directories: `.agents/tasks/i-want-you-help/`; `.agents/tasks/i-want-you-help/task.md`

## Research Boundaries

- Focus on current repository behavior, existing tests, existing conventions, and current external documentation when needed.
- Do not answer what should be built.
- Do not propose a design or implementation.
