---
type: research-questions
summary: "Establishes the query plan for documenting how this skills collection currently generates issues, epics, plans, and outline phases, and where slicing/sizing granularity is decided. Fixes seven current-state questions across create-epic-plan, create-plan, create-structure-outline, start-epic-delivery, shared/SLICING.md, and shared/CONVENTIONS.md, each routed to a research worker. A later research phase answers these to map today's decomposition and PR-granularity behavior before any change is designed."
status: complete
---

# Research Questions

## Research Goal

Document how the skills collection currently decomposes work into issues, epics, plans, and outline phases, and where the rules for task/PR granularity, sizing, dependencies, and delivery sequencing live today.

## Questions

1. In skills/delivery/create-epic-plan, how is an epic decomposed into child tasks, and what determines each child task's number, size, workflow type, and dependencies? (analyze)
2. The collection keeps slicing and sizing rules in shared/SLICING.md. Which delivery skills reference that guide, and how does each one use its four tests and split table? (locate)
3. In skills/delivery/create-structure-outline, how is work broken into phases today, and what granularity or sizing criteria are applied to each phase? (locate)
4. In skills/delivery/create-plan, how does the plan artifact express implementation units or tasks, including their structure, identifiers, and granularity? (analyze)
5. shared/CONVENTIONS.md documents task, artifact, and commit conventions. What does it state about task, artifact, and commit granularity, and about the relationship between a child task and a pull request? (analyze)
6. skills/delivery/start-epic-delivery creates child task directories from an approved epic plan. How does it create those directories and handoffs, and how does it determine the first ready wave and dependencies? (analyze)
7. Across the delivery skills, how are pull-request size, reviewability, and stacking expectations currently documented or enforced? (pattern)

### Known limits

- Questions 2 and 6 kept a `leading` verdict after a rewrite and a second neutrality run; by this skill's own reading they ask what exists and how existing skills connect, not how to build, so they were kept.

## Key Context Pointers

- Links:
  - https://github.com/rmorison/engineering-standards (inspiration repo named by the task; digested in 01-sources-engineering-standards.md)
- Repositories:
  - rmorison/engineering-standards
- Libraries / dependencies:
  - (none)
- Filepaths / directories:
  - shared/SLICING.md
  - shared/CONVENTIONS.md
  - skills/delivery/create-epic-plan/
  - skills/delivery/create-plan/
  - skills/delivery/create-structure-outline/
  - skills/delivery/start-epic-delivery/
  - .agents/tasks/we-need-do-something/01-sources-engineering-standards.md
- Commands / endpoints / schemas:
  - (none)

## Research Boundaries

- Focus on current repository behavior, existing tests, existing conventions, and current external documentation when needed.
- Do not answer what should be built.
- Do not propose a design or implementation.
