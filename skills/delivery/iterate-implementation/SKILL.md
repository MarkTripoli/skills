---
name: iterate-implementation
description: Applies follow-up feedback, a failed-evidence repair, or a no-plan oneshot task to the code on the current branch, verifies it, and writes an implementation receipt. Use when the user runs /iterate-implementation, reports a bug or review comment on built work, or a verify or test run failed; not for building a planned phase from scratch (/implement-plan, /implement-outline).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Iterate Implementation

Apply task-scoped implementation or follow-up feedback on the same branch. This is also the manual oneshot implementation path: use `task.md` directly when no plan exists, without inventing a plan.

After steps 1 and 2, pick the mode:

1. The user asks to implement a plan or outline phase that has not started: delegate it in step 2, then step 6.
2. Feedback on built work: steps 3 to 6.
3. No plan or outline exists: task-only oneshot. `task.md` is the boundary; steps 3 to 6.
4. The latest evidence inspection failed: reserve the repair (step 1), then steps 3 to 6.

## Steps

### 1. Read all required inputs fully

- Locate the task directory and read `task.md` per the conventions, including the create-when-missing rule.
- Resolve any `@file` inside the task directory. Read referenced artifacts completely.
- Read the feedback the user supplied (message or named file) completely.
- Read the plan or outline and user-provided paths completely. Without `@file`, use current `planning.plan`, else current `planning.structure` from `index.json`.
- Read the plan file when it exists. If no plan exists, read the ticket or task file plus the structure outline, design discussion, PRD/TDD, and research artifacts needed to understand the implemented work.
- Do not read unrelated artifacts just because they are present. Prefer the files named by the user, the current implementation source artifact, and the minimum companion artifacts needed to make the change correctly.

In evidence-repair mode, reserve the repair once: use the attempt id your assignment names; with no id, run `node <skills-dir>/deliver/contract.mjs repair-begin "$TASK" <attempt-id>` before editing and `repair-complete` after. A human-requested revision does not reset the repair allowance; record its feedback in the receipt. Capture-only authority is not repair authority.

### 2. Understand the current state

Inspect the repository before editing:

- Check the current git status and diff.
- Identify the commit or point where the previous implementation ended, when that is knowable.
- Read commits or changes made since that point.
- Determine which phases are already implemented and whether the user is giving feedback mid-phase. A phase is incomplete when its checkboxes are not all checked.

If the user is asking to implement an unstarted phase, do not implement it inline. Start the appropriate implementer child worker; wait for it; read its final message. The child never writes task artifacts. For an indexed task, copy the current plan or outline to the next `planning.plan` or `planning.structure` iteration, apply only markers backed by recorded passing commands, and record it; never edit a recorded iteration. A legacy task without `index.json` follows the conventions' in-place rule.

### 3. Verify user feedback before accepting it

If the user supplies a correction, do not treat it as automatically true. Read the files, logs, paths, or examples they mention. Verify that paths exist, code examples match the repository, and the reported behavior is consistent with the current branch.

Proceed only after you have checked the facts. If evidence contradicts the feedback, explain the mismatch briefly and ask how they want to proceed.

### 4. Clarify the requested change

Work one feedback item at a time. Apply each item, or say why it was not applied. Ambiguous: ask the smallest question that changes the action. Several viable fixes with no default: ask, unless the delivery brief authorizes agent decisions; then choose from repository patterns, record the tradeoff, and proceed.

### 5. Apply the fix

When the fix is clear, make the smallest correct change in the shared/root-cause location. Run relevant tests, build, lint, or other checks. Every changed indexed task artifact becomes the next immutable iteration in its series; never revise a recorded artifact.

For a `/deliver` task with delegated execution, give a bounded repair to a child worker, then verify its diff and tests before integration. Model roles follow `deliver`'s Model roles; record the observed worker model or that selection was unavailable. Apply routine choices from nearby code and the delivery brief without asking again.

### 6. Commit, receipt, handoff

When feedback is addressed, checks have run, and no further implementation edits are known, commit the code per `/ci-commit`: stage explicit paths, exclude the configured task root, and validate the Conventional Commits subject. Record any changed plan or outline as an immutable successor; never stage task artifacts. When commits are forbidden, leave code unstaged and record that actual state.

After the commit and plan/outline recording, allocate the next immutable `implementation.receipt` iteration from `references/implementation_template.md`. For a numeric phase, set `completed_phase` to the highest proven plan or outline phase. Task-only work and evidence repairs record the actual revision, changes, check output and next incomplete action. Populate Human Review with exact targets, checks and limits. Record revision after the final source mutation; changed source returns to current verification, review, recording and inspection.

Then choose exactly one handoff. Populate `Check` from Human Review, fill `{artifact_link}` with the canonical receipt link and `{source_file}` with the worktree-relative plan or outline path, otherwise this receipt, and keep the final command fence last.

1. Another numbered phase remains in the selected plan or outline: read `references/implementation_phase_final_answer.md`, set `{implementation_command}` to `/implement-plan` or `/implement-outline` for the source artifact, and do not use the pull-request handoff at this boundary.
2. The highest numbered phase, a task-only implementation, or an evidence repair is complete: read `references/implementation_final_answer.md` and fill `{next_command}` with `/verify-implementation`. `{source_file}` is the source plan or outline when present, otherwise this receipt. Do not claim a numbered phase exists for task-only work. Current verification when configured, review, recording, and inspection precede publication; `/ci-commit` is only an explicitly requested in-loop gate.
