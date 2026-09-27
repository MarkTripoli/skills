---
slug: explain-high-risk-findings
title: "Explain high-risk findings with reachability evidence"
workflow: full
created: 2026-09-27
parent: i-want-you-gpt
base: epic-i-want-you-gpt
depends_on:
  - expose-normalized-semgrep-findings
issue: 121
---
In public skills, extend opt-in /security-check to dispatch one focused reviewer only for normalized high-severity findings. Save a bounded disposition with exact source references and reachability_basis; allow uncertain instead of inventing proof. Render a concise operator report listing scanner coverage and active/suppressed/uncertain findings and limits. Reuse reviewer worker mechanics; do not create another controller or make ordinary deliver depend on this assessment.

## Acceptance criteria
- WHEN the security check contains a high-severity finding, the assessment shall return a cited reachability disposition for that finding.
- IF the reviewer cannot establish reachability, THEN the assessment shall report an uncertain disposition.
