---
slug: reject-stale-proof-at
title: "Reject stale proof at public PR publication"
workflow: full
created: 2026-09-27
parent: i-want-you-gpt
base: epic-i-want-you-gpt
depends_on:
  - map-publication-proof-transitions
issue: 122
---
In public skills, implement the mapped proof decision as a small host-neutral command and call it from skills/delivery/describe-pr/SKILL.md at final/ready publication, preserving the current draft-hosting path, indexed artifact-only SHA exception, clean review, optional verification policy, capture status/hosted URL and separate comment/body ordering. Read public immutable records through shared/task-artifacts.mjs. Return pass/incomplete/stale with reason; an explicit audited override must never report pass or relax existing mandatory evidence. Prove current, artifact-only, substantive-changed and draft-hosting fixtures. Do not replace Atomic or Safety Dance.

## Acceptance criteria
- WHEN a task has clean current review and all required passing proof for tested code, the final-publication decision shall pass even after indexed artifact-only HEAD commits.
- IF a substantive diff changes after review or capture, THEN the final-publication decision shall report stale rather than pass.
- WHEN a draft PR is needed solely to host capture, the proof decision shall permit that draft without allowing ready-for-review publication.
