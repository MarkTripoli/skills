---
name: issue-intake
description: Opt-in GitHub issue queue triage with deterministic dry-run eligibility, duplicate lookup, local claim receipts, and serial delivery handoff.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Issue intake

Issue intake is explicitly opt-in. It is a read-only adapter into existing `/deliver` or installed Atomic `delivery`, not a parallel implementation or publication path. It never mutates GitHub or merges.

## Dry-run first

Run from the repository containing `skills/delivery/issue-intake/issue-intake.mjs`:

```sh
node skills/delivery/issue-intake/issue-intake.mjs --repo=OWNER/REPO --task-root=.agents/tasks --label=ready
```

Dry-run is the default. Eligibility is deterministic: issue must be open and match every requested label. Labels are passed to `gh issue list` before pagination and rechecked locally. Queue order is ascending issue number; rows without a positive safe-integer issue number fail closed. Before proposing work, intake matches local tasks only when both `repository: OWNER/REPO` and `issue: N` occur in YAML frontmatter. It scans target-repository pull requests for local `#N`, canonical `OWNER/REPO#N`, or `https://github.com/OWNER/REPO/issues/N` references; external repository references do not match. Any related PR blocks recovery even when a local task exists. Listing is bounded at 1,000 items; reaching the bound aborts rather than claiming complete coverage.

The task root must be outside the checkout or Git-ignored inside it. Claim state defaults outside the checkout at `~/.local/state/skills/issue-intake.json`; override with `--state=PATH`, also outside or Git-ignored. State is repository-and-issue scoped. Existing schema-1 state fails closed and requires operator migration; it is never guessed across repositories.

## Execute and recover

Execution requires an explicit idempotent handoff adapter:

```sh
node skills/delivery/issue-intake/issue-intake.mjs --repo=OWNER/REPO --task-root=.agents/tasks --label=ready --execute --handoff=deliver-handoff
```

The adapter receives `--intake-key=<stable-id>`, `--receipt=<local-file>`, `--repo=OWNER/REPO`, `--issue=N`, and the complete issue request as its final argument. It must durably deduplicate by intake key before dispatching to the existing `/deliver` chain or registered Atomic `delivery`, pass repository identity into task frontmatter as `repository: OWNER/REPO` plus `issue: N`, and let that flow allocate the task in its dedicated worktree. Intake never creates a task directory or writes task files in the caller checkout. Adapter exit status zero means the keyed handoff was durably accepted. An ambiguous launch or failure is recorded `handoff-unknown` and never automatically relaunched; an operator must reconcile it against the adapter receipt, task, and PR before taking further action. A related PR blocks even this recovery.

Execute holds an atomic local claim lock from lookup through handoff. Claim creation, dead-owner takeover, and release are serialized through a short reaper guard, so contenders cannot remove a newly acquired live lock based on an earlier stale observation. A competing process fails closed while the owner PID remains live, regardless of elapsed time. A dead claim-lock owner can be reclaimed only while holding the reaper guard and after the moved owner token is rechecked. The lock is released by its owner even on errors. If the short reaper guard itself is left by a process crash, intake fails closed; an operator must verify its recorded PID is dead before removing that guard. Dispatch intent and idempotency key are persisted before launching the adapter; accepted receipt is persisted before the claim is marked complete. Crashes therefore remain visibly pending/unknown instead of launching duplicate work.

`--execute` is a flag; values such as `--execute=false` are rejected. `--execute` without `--handoff` fails before creating a claim. `--cost-report` is an operator-supplied note only and is stored as `verified: false`; it is not measured usage. No cost-cap guarantee is provided. Publication still requires its mandatory hosted recording and human approval. Keep task files, claims, receipts, reports, and recordings local; never upload them.

The CLI requires authenticated `gh` access for read-only issue/PR listing and local Git for task-root ownership checks. `GH_BIN` can select a compatible CLI executable for isolated fixtures. No live issue mutation, automatic merge, publication approval bypass, or cost guarantee is supported.
