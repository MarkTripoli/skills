---
"@marktripoli/skills": minor
---

`deliver` stewards the Archon run it starts instead of printing `archon workflow approve|reject|wait` for a person to run. It waits on the run in bounded chunks, announces each pause from the gated artifact's summary, Verify list, and Known limits, takes the decision in plain language (through `judge.mjs feedback-intent` when the reply is not one word), and calls `archon workflow respond` itself. `/deliver --run <run-id>` attaches to a run whose steward was lost, whether started by `deliver` or reopened by `herd-next`'s Archon gate mode.
