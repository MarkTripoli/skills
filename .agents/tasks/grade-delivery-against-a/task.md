---
slug: grade-delivery-against-a
title: "Grade delivery against a solo fixture"
workflow: full
created: 2026-09-27
parent: i-want-you-gpt
base: epic-i-want-you-gpt
depends_on: []
issue: 115
---
In public skills, extend evals/run.mjs and one isolated scenario to compare solo and current delivery on an identical fixed acceptance fixture. Record model ID, fixture/source revision, wall time, token/cost basis when available, and raw output locations. A deterministic grader test is required; a paid live run remains explicitly opt-in. A grader alone does not authorize a change to parallelism or policy; its fixture must have complete matched live evidence before that gate is considered.

## Acceptance criteria
- WHEN the same seeded change has two recorded runs, the evaluator shall report the solo and delivery acceptance outcomes with model, wall-time and available spend provenance.
- IF either path lacks an observed run or comparable spend data, THEN the evaluator shall label that field incomplete or unknown rather than claim a cost advantage.
