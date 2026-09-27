---
slug: expose-normalized-secret-findings
title: "Expose normalized secret findings on request"
workflow: oneshot
created: 2026-09-27
parent: i-want-you-gpt
base: epic-i-want-you-gpt
depends_on:
  - expose-normalized-semgrep-findings
issue: 119
---
In public skills, extend the opt-in /security-check scanner adapters and normalized contract from the merged Semgrep slice with Gitleaks on a bounded seeded repository fixture. Scrub secret values from findings and raw diagnostics, retain repository and revision identity, and report absent/failing tool coverage as incomplete. Do not scan arbitrary .env files on every edit or alter normal delivery.

## Acceptance criteria
- WHEN an operator scans a seeded secret-bearing repository, the security check shall identify the finding without printing its value.
- IF the secret scanner is unavailable, THEN the security check shall mark secret coverage incomplete.
