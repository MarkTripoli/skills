---
"@marktripoli/skills": patch
---

fix(iterate-evidence): R6 structural fixes for reservation step fields, grader scoping, answer link form, and worker commit guidance

**activeReservation (evals/iterate-evidence.mjs)**: The combined "current step / last completed step / next incomplete step" handler no longer pushes false when parts.length===1. In that case the semicolon-split pattern already extracts labeled sub-lines ("last completed:", "next incomplete:") which are handled by the individual key handlers. Regressions added for the semicolon/colon form and the canonical three-labeled-lines form.

**Continuation grader (evals/scenarios/iterate-evidence-continuation.mjs)**: IE-001 resolution is now read only from the `## Findings` section. Guardrail table rows that mention IE-001 no longer shadow a resolved Findings row. Regression added covering a guardrail-only IE-001 mention after a resolved Findings row.

**Answer templates**: Both passed and stopped templates now show `[{artifact_file}]({artifact_link})` as the first line, making the markdown link form explicit and forbidding bare/backtick paths.

**SKILL.md**: Step 4.2 now requires committing delegated source changes as a separate source commit before the receipt commit, even when the round yields no progress. Terminal delivery section now specifies the markdown link requirement for the artifact link. Delegation step is clear that tracked source files must not remain uncommitted.

**Template (evidence_iteration_template.md)**: "Delivery and known limits" section replaces the combined "Current step / last completed step / next incomplete step" line with three explicit labeled lines as the canonical form.
