---
name: issue-intake
description: Opt-in GitHub issue queue triage with deterministic eligibility, local claims, duplicate checks, and serial handoff to existing delivery.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Issue intake

Issue intake is explicitly opt-in. It is an adapter into existing `/deliver` or installed Atomic `delivery`, not a parallel implementation or publication path. It never writes to GitHub: no labels, comments, issue state, or PR mutation. It never merges.

## Dry-run first

Run from the repository containing `skills/delivery/issue-intake/issue-intake.mjs`:

```sh
node skills/delivery/issue-intake/issue-intake.mjs --repo=OWNER/REPO --task-root=.agents/tasks --label=ready
```

Dry-run is the default and performs deterministic eligibility only: issue must be open and match every requested label. Queue order is ascending issue number. Before proposing allocation, it checks local `task.md` issue metadata and existing PRs. Claims live outside the task root by default at `~/.local/state/skills/issue-intake.json`; override with `--state=PATH`. Review the proposed task paths and duplicates before executing.

## Execute and recover

Execution requires an explicit handoff executable and creates one task at a time:

```sh
node skills/delivery/issue-intake/issue-intake.mjs --repo=OWNER/REPO --task-root=.agents/tasks --label=ready --execute --handoff=deliver-handoff --cost-report='actual accrued usage report'
```

The handoff executable receives the task directory and an accrued-cost disclosure as final arguments. Its adapter must start the existing `/deliver` chain or the registered Atomic `delivery` workflow; it must not bypass their route, gates, or review policy. Process one issue serially. Local claims are idempotent by issue number. A running claim blocks duplicate execution; after 30 minutes it is reported recoverable and can resume the same task after checking the task and PR lookup again. A failed handoff preserves the claim and task for recovery. Do not remove or reset a claim to force a second task.

Cost reporting is honest accrued usage only. This CLI has no provider reservation or reliable future-cost bound; neither a supplied report nor serial execution is a cost-cap guarantee. Publication still requires its mandatory hosted recording and human approval. Keep task files, claims, reports, receipts, and recordings local; never upload them.

The CLI requires authenticated `gh` access for read-only issue/PR listing. `GH_BIN` can point to a compatible CLI executable for isolated fixtures. Eligibility and all lookup results are observations, not authorization to mutate a GitHub issue. No live mutation, automatic merge, or cost guarantee is supported.
