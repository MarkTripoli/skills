---
slug: honor-expiring-accepted-security
title: "Honor expiring accepted security risks"
workflow: oneshot
created: 2026-09-27
parent: i-want-you-gpt
base: epic-i-want-you-gpt
depends_on:
  - expose-normalized-semgrep-findings
issue: 120
---
In public skills, add opt-in accepted-risk processing over normalized findings. Match exact rule ID and canonical repository with exact file path by default; a broader anchored path glob requires explicit entry scope. Require reason and expiry; retain suppression in an audit record and keep expired findings active. Invalid entries mark coverage incomplete rather than suppressing. Test matching, expiry and invalid input with the seeded fixture; do not use upstream ambiguous source_ref.

## Acceptance criteria
- WHEN a current accepted-risk entry matches a normalized finding, the assessment shall retain its suppressed disposition in an audit record.
- IF a matching accepted-risk entry has expired, THEN the assessment shall keep the finding active.
