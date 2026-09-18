---
"@marktripoli/skills": minor
---

Add `gather-sources`, which fetches the external docs, specs, tickets, pages, and repositories a task names into a cited `sources` artifact that research, PRD, and TDD sessions read instead of fetching again; when the request converts an existing PRD or RFC, it hands off to `create-prd` or `create-tdd`, which now convert such a document in one pass without their interviews and leave what the source does not state as `Known limits` and `Verify` items. Add `npm run evals`, which runs the conversions and the full chain against a live model, one fresh session per phase.

The structure-outline template names its sections `## Phase N`, as the skill and the implementation loop already do.
