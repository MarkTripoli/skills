---
slug: map-publication-proof-transitions
title: "Map publication proof transitions"
workflow: oneshot
created: 2026-09-27
parent: i-want-you-gpt
base: epic-i-want-you-gpt
depends_on: []
issue: 117
---
In public skills, inspect skills/delivery/describe-pr/SKILL.md, atomic/lib/controller.mjs and task artifact records; produce a bounded decision table and runnable fixture cases under shared/ for draft capture hosting, artifact-only HEAD advancement, clean review, verification when required, untested capture policy, final hosted comment/body ordering and bypass. No runtime gate yet. This is the consumed enabler for Reject stale proof at public PR publication; keep existing behavior unchanged.

## Acceptance criteria
- WHEN a draft PR exists only to host capture, the proof map shall record that incomplete proof permits draft hosting but not ready publication.
- WHEN HEAD contains only indexed task-artifact commits after tested code, the proof map shall record the evidence reuse rule and substantive-change boundary.
