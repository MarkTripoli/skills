---
"@marktripoli/skills": minor
---

Size epic children before they become pull requests. `shared/SLICING.md` states the four tests a unit passes (one obligation, one vertical slice, one day, safe to merge alone), the split to apply when it fails one, and the EARS form of acceptance criteria. `create-epic-plan` sizes every candidate child against them and records the evidence in a `## Slice Check` table; children now carry `slice`, `acceptance`, and an optional `flag`. `start-epic-delivery` rejects children that break the rules and writes each child's acceptance criteria into its `task.md`. `create-structure-outline` sizes phases the same way, and `create-prd` records one obligation per behavior.
