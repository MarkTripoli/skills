---
slug: publish-truthful-concurrent-epic
title: "Publish truthful concurrent epic outcomes"
workflow: full
created: 2026-09-27
parent: i-want-you-gpt
base: epic-i-want-you-gpt
depends_on:
  - schedule-isolated-ready-epic
issue: 127
---
In public skills, consume the isolated scheduler from Schedule isolated ready epic children. Add a truthful join gate for per-child status, artifact/approval proof and merge evidence; no false success or premature next-wave dispatch. Expose a bounded opt-in limit only after a matched live baseline with model/spend/time/acceptance provenance satisfies the approved cost-quality threshold; default remains one and missing data leaves opt-in unavailable. Exercise failed child, two successes, stale proof and missing live baseline in a focused fixture. Do not add a second orchestrator.

## Acceptance criteria
- WHEN all concurrent children have merge and proof evidence, the epic controller shall report the wave complete.
- IF one child fails or lacks merge evidence, THEN the epic controller shall leave the wave incomplete without reporting its sibling delivered.
