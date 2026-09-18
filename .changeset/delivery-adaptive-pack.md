---
"@marktripoli/skills": minor
---

`delivery-start` now routes a judged `oneshot`, `lean`, `full`, or `prd` request to the new `delivery-adaptive` pack, which re-judges research, the design phases, plan vs. structure outline, per-phase review, and app testing at four boundaries (after the task, after research, after design, after planning) instead of choosing once up front. Each boundary writes or rewrites `NN-execution-plan-<slug>.md`, a Mermaid flowchart and table of the chain as composed for that run. `create-tdd` and `create-design-discussion` now require a `### Execution DAG` section embedding that artifact (`create-tdd` also requires `### Engineering Work Breakdown`); `scripts/validate.mjs` enforces both.
