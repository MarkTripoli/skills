---
name: implement-plan
description: Run for /implement-plan requests. Orchestrate phased implementation from a saved plan artifact.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Plan Implementation Orchestrator

Coordinate an approved plan artifact in `.agents/tasks/<slug>/`. Start focused child workers, verify them, advance on green automated checks, and hand off after implementation is complete. Do not do bulk implementation inline.

## Workflow

### 1. Locate the task and the plan

- Locate the task directory and read `task.md` per the conventions, including the create-when-missing rule.
- If the user supplied a specific plan path or `@file`, use that file.
- Otherwise use the newest artifact of type `plan`; list the task directory and resolve ambiguity before reading one.
- Read the selected plan completely. Work from the implementation overview, shared constraints, the first incomplete phase, and that phase's acceptance checks. Completed or later phase bodies matter only when the current phase depends on them. Read `task.md` or `ticket.md` again only when needed for ticket identity, deferred evidence pointers, or acceptance language.
- The current phase is the first phase whose checkboxes are not all checked. The receipt you write at the end of the phase is the review artifact for that phase.
- If no plan is found, ask for the plan path and stop.

### 2. Start the implementer child worker

For each phase that still needs work, start a child worker for role `agent-implementer` with the assignment: the plan path and the phase number (see the conventions' Child workers section); wait for it; read its final message. Do not copy plan content into the assignment.

### 3. Review the child output

The child worker's final message is its deliverable. Read it and compare it with the plan. Use only findings you have read from the worker's final message, verified against the repository.

Inspect the implementer report and confirm:

- Which files changed.
- Which plan items were completed.
- Which automated checks ran and their results.
- Which deferred human evidence is pending, with pointers.
- Whether the child reported mismatches, blockers, or intentionally skipped work.

If the child says the plan cannot be followed, present that mismatch to the user instead of improvising a new direction.

The child never writes into `.agents/tasks/`. Its final message ends with a `## Plan Checkboxes Earned` section listing each checkbox earned by an automated check that ran and passed, with the passing command. Apply those updates to the plan file yourself: edit it in place, tick only the checkboxes backed by a recorded passing command, and leave every other checkbox open. Continue phase resolution from the updated file.

### 4. Run missed automated checks

Run checks the child missed and checks the plan makes mandatory: build, test, lint, typecheck, generated-code verification, or focused acceptance scripts. Keep enough output to prove pass or fail.

### 5. Report the phase to the human

After each verified numeric phase, take the next artifact number, write one receipt `NN-implementation-<slug>.md` from `references/implementation_template.md`, and save the file in the task directory, even when later phases remain. Set `completed_phase` to the highest proven plan phase. Fill `Human Review` with exact targets, checks, and known limits.

Use `references/implementation_phase_final_answer.md` between numeric phases and `references/implementation_final_answer.md` only after the terminal phase. Fill `{artifact_link}` with a relative Markdown link to the receipt, `[NN-implementation-slug.md](.agents/tasks/<slug>/NN-implementation-slug.md)`, copy its checks, invoke this skill with the same plan between phases, and keep the command fence last.

Then summarize:

```markdown
## Phase [N] Implementation Summary

**Completed by child worker:**
- [completed work]

**Automated verification:**
- [command] -> [result]

**Deferred human evidence (recorded, not executed):**
- [evidence item and pointer, or None]

Automated checks are green, so implementation continues to the next phase.
```

### 6. Commit and continue

When every Automated Verification checkbox in the phase is checked with a recorded passing result, create a focused commit and start the next phase without waiting. Do not commit `.agents/tasks/`. Use explicit paths with `git add`; never stage the whole repository. `/ci-commit` stays the manual fallback for work outside this flow.

### 7. Repeat for the next phase

Repeat the same child-worker, review, verification, and commit cycle. A `human-gated: true` line in the executed phase block is the only reason to stop for confirmation; report it with `references/implementation_phase_final_answer.md` and wait.

## Special Instructions

### Resuming Work

If the plan already has progress markers:

- Treat checked items as complete unless the diff, test result, or user report makes that unsafe.
- Resume at the first phase whose checkboxes are not all checked.
- Ask the child to continue from that point, not to restart the whole plan.

### Handling Issues

When a child worker or local verification finds a mismatch, stop the phase loop and present:

```markdown
Issue in Phase [N]

Expected: [what the plan called for]
Found: [what the repository actually contains]
Why it matters: [impact]

How should I proceed?
```

Do not patch around unclear plan drift without user direction.

### Multiple Phases

Every phase advances on green automated checks. Start a fresh implementer worker for each phase and verify between phases. Deferred human evidence is reported with pointers and never marked executed. A `human-gated: true` line in the executed phase block stops the run for confirmation.

### Artifact Notes

Read `references/implementation_template.md`, `references/implementation_phase_final_answer.md`, and `references/implementation_final_answer.md`.

If you write an implementation receipt or update the plan artifact, take the next artifact number for a new `NN-implementation-*.md` file.

## After Final Phase Completion

When every phase is complete, automated checks pass, and any phase with `human-gated: true` received its recorded confirmation:

1. Save changed task artifacts in the task directory.
2. Commit all remaining repository work before the PR handoff. Use the `/ci-commit` conventions: inspect the diff, stage explicit files, exclude `.agents/tasks/` unless the user specifically asks for it, and write a focused message.
3. Read `references/implementation_final_answer.md`.
4. Respond with that template only, including the `/describe-pr` block.
5. If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it. The same applies to a reply that stops at a `human-gated` phase.
