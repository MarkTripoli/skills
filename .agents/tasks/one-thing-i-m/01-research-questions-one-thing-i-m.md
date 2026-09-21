---
type: research-questions
summary: "This document defines three neutral questions for tracing model defaults, JEV escalation, and model availability in the current delivery system. The research phase must identify current ownership, runtime boundaries, tests, and fallback behavior before proposing changes. JEV classified q1 as neutral at 0.35 and q2/q3 as unclear at 0.58 and 0.46; the latter two were retained after applying the neutrality rules."
status: complete
---

# Research Questions

## Research Goal

Trace how this repository currently selects execution models, records model decisions, and represents provider or account availability across delivery workflows and runtime adapters.

## Questions

1. How does this repository represent model names, provider capabilities, and availability across runtime installation, model routing, and skill execution? (analyze)
2. How do delivery workflows and runtime adapters choose models for planning, implementation, verification, review, and tool-oriented work, and where are defaults enforced? (analyze)
3. What tests, fixtures, documentation, and configuration currently define model selection behavior, including JEV or TypeSafe integration and fallback behavior? (locate)

### Known limits

- JEV returned `unclear` for q2 and q3; the questions were retained after rereading them against the requirement to describe current behavior without proposing a solution.
- Child-worker dispatch was unavailable in this Pi session, so research will be performed inline with direct repository evidence.

## Key Context Pointers

- Links:
- Repositories: `git@github.com:MarkTripoli/skills.git`
- Libraries / dependencies: `@bastani/atomic/workflows`, `typebox`, `typed-judgment/judge.mjs`
- Filepaths / directories: `atomic/lib/models.mjs`, `atomic/lib/controller.mjs`, `atomic/workflows/delivery.ts`, `docs/model-routing.md`, `tests/atomic-model-routing.test.mjs`, `tests/judge.test.mjs`
- Commands / endpoints / schemas: `model`, `model_routing`, `reasoning_model`, `workflow=auto`, `systemOne`

## Research Boundaries

- Focus on current repository behavior, existing tests, existing conventions, and current external documentation when needed.
- Do not answer what should be built.
- Do not propose a design or implementation.
