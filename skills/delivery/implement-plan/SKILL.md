---
name: implement-plan
description: Orchestrates phased implementation of a saved plan; starts one agent-implementer per phase, verifies its checks, ticks the plan, commits, and writes a receipt. Use when the user runs /implement-plan or a /deliver builder assignment names a plan; not for a structure outline (/implement-outline) or follow-up feedback (/iterate-implementation).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Plan Implementation Orchestrator

Coordinate an approved plan artifact in `<task-root>/<slug>/`, as a builder assignment inside `/deliver` or standalone. Start focused implementers, verify them, advance on green automated checks, and hand off after implementation is complete. Do not do bulk implementation inline.

## Workflow

Copy this checklist for each phase:

```text
- [ ] locate plan and phase
- [ ] dispatch agent-implementer
- [ ] verify its report
- [ ] tick the plan
- [ ] run missed checks
- [ ] commit
- [ ] write receipt
- [ ] reply or start next phase
```

### 1. Locate the task and the plan

- Locate the task directory and read `task.md` per the conventions, including the create-when-missing rule.
- If the user supplied a specific plan path or `@file`, use that file.
- Otherwise use current `planning.plan` from `index.json`.
- Read the selected plan completely. Work from the implementation overview, shared constraints, the first incomplete phase, and that phase's acceptance checks. Completed or later phase bodies matter only when the current phase depends on them. Read `task.md` or `ticket.md` again only when needed for ticket identity, deferred evidence pointers, or acceptance language.
- The current phase is the first phase whose checkboxes are not all checked. The receipt you write at the end of the phase is the review artifact for that phase.
- If no plan is found, ask for the plan path and stop.

When the task's evidence policy needs a baseline and none is sealed, run `/record-evidence --baseline`; once implementation has begun it captures from a temporary `git worktree add <tmp> <base-sha>`. It never blocks dispatching an implementer. `node <skills-dir>/deliver/contract.mjs status <task-dir>` is optional and prints artifact currency.

When the latest evidence inspection failed, reserve the repair once: use the attempt id your assignment names; with no id, run `node <skills-dir>/deliver/contract.mjs repair-begin "$TASK" <attempt-id>` before editing and `repair-complete` after.

### 2. Start the implementer

For each phase that still needs work, start a child worker for role `agent-implementer` with the assignment: the plan path and the phase number (see the conventions' Child workers section); wait for it; read its final message. Do not copy plan content into the assignment. The assignment does not ask the implementer to commit; step 5 commits. Model roles follow `deliver`'s Model roles; record the observed worker model or that selection was unavailable.

### 3. Review the implementer's output

The implementer's final message is its deliverable. Read it, compare it with the plan, and use only findings verified against the repository. Confirm:

- Which files changed.
- Which plan items were completed.
- Which automated checks ran and their results.
- Which deferred human evidence is pending, with pointers.
- Whether it reported mismatches, blockers, or intentionally skipped work.

If the implementer says the plan cannot be followed, present that mismatch to the user instead of improvising a new direction.

The implementer never writes task artifacts. Its final message ends with a `## Progress Markers Earned` section listing each checkbox earned by an automated check that ran and passed, with the passing command. Apply those updates to the plan file yourself: update a staged immutable successor, tick only the checkboxes backed by a recorded passing command.

### 4. Run missed automated checks

Run checks the implementer missed and checks the plan makes mandatory: build, test, lint, typecheck, generated-code verification, or focused acceptance scripts.

### 5. Commit

When every Automated Verification checkbox in the phase is checked with a recorded passing result, create a focused code commit with a Conventional Commits subject (conventions, Commits section). Stage explicit code paths with `git add`; never stage the whole repository, and exclude the configured task root from every code commit. Append a dated line to the plan's `## Progress` (phase, commit, reviewer verdict when a reviewer ran). Save the ticked plan locally; never stage, commit, or push task artifacts. When commits are explicitly forbidden, leave code unstaged and record that actual state. `/ci-commit` stays the manual fallback for work outside this flow.

### 6. Write the receipt, then reply or continue

After the commit and recording the plan successor, allocate the next immutable `implementation.receipt` iteration from `references/implementation_template.md`, even when later phases remain. Set `completed_phase` to the highest proven plan phase. Fill `Human Review` with exact targets, checks, and known limits. Record baseline and policy paths, actual completed phase, remaining verification, review and evidence, first incomplete action, and the source revision; later source changes invalidate the revision. Do not report delivery complete from implementation checks alone.

Then take the first case that applies:

0. A required check still fails after step 4: present it as in Handling Issues; commit nothing.
1. The assignment names one phase, or the phase block has `human-gated: true`: reply and stop. Use `references/implementation_phase_final_answer.md` when another phase remains, and the terminal answer in case 2 when none does.
2. No phase remains (every phase complete, and any `human-gated: true` phase confirmed): reply with `references/implementation_final_answer.md`, with `{next_command}` set to `/verify-implementation`.
3. Otherwise: start the next phase at step 2 with a fresh implementer, and send no reply.

Fill `{artifact_link}` with the canonical receipt link and `{source_file}` with the selected plan's worktree-relative path, copy its checks, and keep the command fence last. Add no prose around the template. Deferred human evidence is reported with pointers and never marked executed.

## Special Instructions

### Resuming Work

Treat checked items as complete unless the diff, test result, or user report makes that unsafe. Ask the implementer to continue from the first unchecked phase.

### Handling Issues

When an implementer or local verification finds a mismatch, stop the phase loop and present:

```markdown
Issue in Phase [N]

Expected: [what the plan called for]
Found: [what the repository actually contains]
Why it matters: [impact]

How should I proceed?
```

Do not patch around unclear plan drift without user direction.
