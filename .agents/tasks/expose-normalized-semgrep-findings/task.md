---
slug: expose-normalized-semgrep-findings
title: "Expose normalized Semgrep findings on request"
workflow: full
created: 2026-09-27
parent: i-want-you-gpt
base: epic-i-want-you-gpt
depends_on: []
issue: 116
---
In public skills, add an opt-in /security-check skill and a deterministic Semgrep adapter. Define a versioned finding with finding_id derived from this scan target revision/scanner/rule/location, canonical repository ID, revision, path, line, severity, message and redacted evidence reference. Output coverage and tool version. Seed a relevant fixture and prove that a tool failure or missing tool is incomplete, never clean. Do not alter normal deliver or upload source.

## Acceptance criteria
- WHEN an operator requests a scan of a repository with Semgrep available, the security check shall emit versioned repository-revision-bound findings with source locations.
- IF Semgrep is absent or fails, THEN the security check shall report incomplete coverage instead of a clean scan.
