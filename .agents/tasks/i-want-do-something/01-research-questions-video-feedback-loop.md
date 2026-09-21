---
type: research-questions
summary: "Seven current-state questions cover recording, video inspection, repair and re-verification workflows, evidence-backed tests and guardrails, design-system discovery, and skill integration. They preserve the requested record-video, inspect-video, repair-code, repeat scope without choosing a design. Research planning is complete; the existing parent session retains coordination and all approval gates."
status: complete
---

# Research Questions

## Research Goal

Establish how this collection currently records and inspects application evidence, connects findings to code repairs, and verifies outcomes. Identify existing tests, guardrails, visual conventions, and skill integration contracts relevant to those behaviors.

## Questions

1. Where are the current skills, templates, scripts, documentation, and evaluations for recording evidence, inspecting application behavior, reviewing defects, and repairing code? (locate)
2. How does `record-evidence` currently connect live actions, assertions, narration, recording, and saved reports across supported capture targets, including failures and unavailable prerequisites? (locate)
3. What existing video-inspection capabilities and documented limitations govern how agents view recordings, identify defects, and link findings to timestamps, observed behavior, and expected behavior? (analyze)
4. What existing workflow patterns connect findings, code repairs, re-verification, and repeated review, including artifact handoffs, human gates, stop conditions, and interrupted or unsuccessful runs? (pattern)
5. How do existing tests, live evaluations, and repository guardrails establish correctness for evidence and repair workflows, and what records connect observed failures to changes in those checks? (pattern)
6. What existing conventions identify a recorded application's design system, component library, color tokens or literal hex colors, typography, spacing, radius, elevation, layout, responsive behavior, theming hooks, CSS variables, framework utilities, accessibility requirements, and visual regression assets? (locate)
7. How are delivery skills and their supporting resources registered, installed, adapted across runtimes, and mechanically validated, including independent invocation and optional orchestration? (pattern)

### Known limits

- The neutrality helper marked questions 1, 2, 3, 5, 6, and 7 `unclear`. Manual review retained them: each asks about existing behavior or evidence, not a proposed design.

Judgment record:

| Question | Neutrality verdict and probability | Worker route and confidence |
| --- | --- | --- |
| 1 | unclear, 0.40 | locate, 1.00 |
| 2 | unclear, 0.50 | locate, 1.00 |
| 3 | unclear, 0.50 | analyze, 0.75 |
| 4 | neutral, 0.39 | pattern, 0.75 |
| 5 | unclear, 0.44 | pattern, 0.70 |
| 6 | unclear, 0.53 | locate, 0.62 |
| 7 | unclear, 0.40 | pattern, 0.86 |

- `neutral`: model `jev-1.13.0`, 974 input tokens / 130 output tokens.
- `route-question`: model `jev-1.13.0`, 1779 input tokens / 386 output tokens.

## Key Context Pointers

- Task input: `.agents/tasks/i-want-do-something/task.md`; artifact directory: `.agents/tasks/i-want-do-something/`.
- Named existing skill: `record-evidence`; canonical entry: `skills/delivery/record-evidence/SKILL.md`, with `references/` and `scripts/` beside it.
- Collection ownership pointers: `skills/delivery/<name>/SKILL.md`, `skills/delivery/agent-*/`, `scripts/sync-plugin.mjs`, `agents/`, `scripts/lib/build.mjs`, `runtimes/<runtime>.md`, and `scripts/install.mjs`.
- Verification pointers: `docs/testing.md`, `scripts/validate.mjs`, `evals/`, and `evals/results/`.
- Workflow and convention pointers: `workflows/delivery.md`, `atomic/workflows/delivery.ts`, `atomic/lib/`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `shared/SLICING.md`.
- Planning judgment helper: `skills/delivery/typed-judgment/judge.mjs`; commands: `neutral` and `route-question`.
- Recorded delivery context: `workflow: full`, `gates: all`, `base: main`, `orchestrator: existing-omp-session`, and `phase_sessions: fresh-herdr-panes`.

## Research Boundaries

- Preserve the user's requested scope: create or enhance a skill building on `record-evidence` for record-video, inspect-video, repair-code, repeat.
- Preserve evidence-backed improvement of tests, guardrails, and other repository checks based on what works and what fails; the request is not limited to video production or UI fixes.
- Focus research on current repository behavior, existing tests, existing conventions, and current external documentation when needed. Report absent capabilities or evidence as absent, not as implied requirements.
- Include design-system discovery for possible frontend work. The request names no target application, screen, framework, or defect; distinguish collection conventions from application-specific evidence.
- Do not answer what should be built or choose between a new skill and enhancing an existing skill. Do not propose a design or implementation.
- This phase saves and commits research planning only. Do not record video, repair code, launch later skills, or open other Herdr panes.
- The existing parent session coordinates the user-approved full delivery with `gates=all`; this artifact does not approve the next phase.
- Skip formatters, linters, builds, and project-wide tests in this planning phase.
