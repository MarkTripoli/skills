---
slug: schedule-isolated-ready-epic
title: "Schedule isolated ready epic children"
workflow: oneshot
created: 2026-09-27
parent: i-want-you-gpt
base: epic-i-want-you-gpt
depends_on:
  - grade-delivery-against-a
issue: 123
---
In public skills, update atomic/workflows/delivery.ts scheduler only, with a fixture-controlled concurrency limit two for independent ready children and disjoint write-path ownership. Keep production/default limit one and do not expose the opt-in setting until Publish truthful concurrent epic outcomes consumes this enabler. Preserve existing child artifact/approval protocol and do not launch dependent children in the same wave. Prove overlap and path conflict in focused controller tests.

## Acceptance criteria
- WHEN a test-only concurrency limit of two is requested, the scheduler shall start two independent ready children in separate worktrees.
- IF children depend on one another or own the same write path, THEN the scheduler shall serialize those children.
