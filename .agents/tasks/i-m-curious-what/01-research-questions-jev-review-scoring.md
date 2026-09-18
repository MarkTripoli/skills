---
type: research-questions
summary: "Query plan for researching this collection's current review loop (review-code, fix-code-review, verify-implementation, agent-implementation-reviewer, resolve-pr-reviews, typed-judgment) alongside the jev-review repository the user linked, which wraps the same TypeSafe System One API this collection's typed-judgment helper calls. Fixes seven questions across artifact schema, loop gating, and the shared vendor API's capabilities. No design or adoption decision is made here."
status: complete
---

# Research Questions

## Research Goal

This investigates how this collection's review loop (`review-code`, `fix-code-review`, `verify-implementation`, `agent-implementation-reviewer`, `resolve-pr-reviews`, `typed-judgment`) currently scores and gates a task diff, and what structure the `jev-review` repository (a local MCP server wrapping the TypeSafe System One API) currently uses to produce structured multi-dimension quality scores for a coding agent.

## Questions

1. In `skills/delivery/review-code/references/code_review_template.md`, what fields and severity/finding structure does the current code-review artifact capture, and how are findings categorized or scored? (analyze)
2. In `workflows/delivery.md`, what are the current stopping conditions and round limits for the review-code / fix-code-review loop group, and what currently triggers a `blocked` outcome? (analyze)
3. In `skills/delivery/typed-judgment/judge.mjs`, what request does the helper currently send to the TypeSafe System One API at `api.typesafe.ai`, and what response fields does it parse? (analyze)
4. What does `agents/agent-implementation-reviewer.md` currently instruct the reviewer subagent to compare and report, and how does its behavior compare to the SKILL.md wrapper at `skills/delivery/agent-implementation-reviewer/SKILL.md`? (analyze)
5. In `skills/delivery/resolve-pr-reviews/SKILL.md`, how does the current process track review rounds, reviewer identity, and thread state across iterations? (analyze)
6. What does `skills/delivery/verify-implementation/SKILL.md` currently check before a task enters the review loop, and how does a pass/fail/blocked verdict currently route to the next phase? (analyze)
7. On the TypeSafe System One API at `https://api.typesafe.ai/v1/systemone` (model `jev-latest`), what question types, input schema, and response schema does the API currently document or expose beyond what `judge.mjs` sends and reads today? (web)

### Known limits

- Typed-judgment neutrality/routing check (`typed-judgment/judge.mjs neutral` / `route-question`) skipped: `TYPESAFE_API_KEY` is unset in this environment. Questions above were checked for neutrality and routed to a worker role by this skill's own reading of the drafting rules instead.

## Key Context Pointers

- Links: https://github.com/NiazMorshed2007/jev-review, https://typesafe.ai/, https://console.typesafe.ai/
- Repositories: NiazMorshed2007/jev-review
- Libraries / dependencies: `@modelcontextprotocol/sdk` (jev-review runtime dep), `zod` (jev-review runtime dep); TypeSafe System One model `jev-latest`, env var `TYPESAFE_API_KEY` (shared by jev-review and this collection's `typed-judgment`)
- Filepaths / directories: `skills/delivery/review-code/`, `skills/delivery/fix-code-review/`, `skills/delivery/resolve-pr-reviews/`, `skills/delivery/review-artifact-comments/`, `skills/delivery/agent-implementation-reviewer/`, `skills/delivery/verify-implementation/`, `skills/delivery/typed-judgment/judge.mjs`, `agents/agent-implementation-reviewer.md`, `workflows/delivery.md`
- Commands / endpoints / schemas: jev-review's MCP tool `jev_review`; `POST https://api.typesafe.ai/v1/systemone`

## Research Boundaries

- Focus on current repository behavior, existing tests, existing conventions, and current external documentation when needed.
- Do not answer what should be built.
- Do not propose a design or implementation.
