---
slug: grade-seeded-security-findings
title: "Grade seeded security findings and reports"
workflow: oneshot
created: 2026-09-27
parent: i-want-you-gpt
base: epic-i-want-you-gpt
depends_on:
  - expose-normalized-semgrep-findings
  - expose-normalized-secret-findings
  - honor-expiring-accepted-security
  - explain-high-risk-findings
issue: 124
---
In public skills, extend a small deterministic security fixture under evals/ to grade opt-in /security-check findings and report against seeded ground truth. Measure TP/FN and extra emissions, suppression expiry, absence of secret values, unknown reachability and required coverage/report fields. Do not make paid model runs part of npm test; retain raw output with revision/tool provenance. A structural grader is not a claimed live recall benchmark.

## Acceptance criteria
- WHEN a seeded multi-finding assessment is graded, the grader shall report expected detections, missed defects and extra findings separately.
- IF the report omits tool status, redaction, expiry or uncertain-disposition evidence, THEN the grader shall fail its report-completeness check.
