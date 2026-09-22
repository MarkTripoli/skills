---
name: iterate-implementation
description: Run for /iterate-implementation requests. Apply follow-up implementation feedback on the same branch.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Iterate Implementation

Use this when implementation already happened and the user has follow-up feedback. The feedback may be a bug report, an adjustment, a missing phase, or a small extension on the same branch.

## Steps

### 1. Read all required inputs fully

- Locate the task directory and read `task.md` per the conventions, including the create-when-missing rule.
- Resolve any `@file` inside the task directory. Read referenced artifacts completely.
- Read the feedback the user supplied (message or named file) completely.
- Read the plan or outline and user-provided paths completely. Without `@file`, use current `planning.plan`, else current `planning.structure` from `index.json`.
- Read the plan file when it exists. If no plan exists, read the ticket or task file plus the structure outline, design discussion, PRD/TDD, and research artifacts needed to understand the implemented work.
- Do not read unrelated artifacts just because they are present. Prefer the files named by the user, the current implementation source artifact, and the minimum companion artifacts needed to make the change correctly.

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

Use the feedback type to choose the next action:

- Bug report: inspect logs, database state, reproduction steps, and relevant code until the remaining work is clear.
- Code change request: update the specific code or behavior after verifying the target files.
- Ambiguous request: ask the smallest question that changes what you will do.
- Missing evidence: add targeted logging or ask the user to reproduce with the needed output.

If there are several viable fixes and no clear default, ask before editing.

### 5. Apply the fix

When the fix is clear, make the smallest correct change in the shared/root-cause location. Run relevant tests, build, lint, or other checks. Every changed indexed task artifact becomes the next immutable iteration in its series; never revise a recorded artifact.

### 6. Update the user

When the iteration completes a numeric phase, record the updated source iteration first, then record the next immutable `implementation.receipt` from `references/implementation_template.md`. Set `completed_phase` to the highest proven phase and populate `Human Review`. Save this receipt even when later phases remain.

Read `references/implementation_phase_final_answer.md` when another numeric phase remains, and set `{implementation_command}` for the current source artifact. Read `references/implementation_final_answer.md` only for terminal implementation. Populate `Check` from the receipt's `Human Review`, fill `{artifact_link}` with its canonical task-root-relative path, and keep the final command fence last.

## Guidance

### Feedback

Read only the feedback the user supplied (message or named file). Work one feedback item at a time when feedback drives the change. Apply each item, or say why it was not applied.

## When Iteration Is Complete

When feedback is addressed and checks ran, commit code with explicit paths and keep task artifacts out of the code commit. Commit the new source iteration, receipt, and `index.json` separately as `docs(task): implementation artifact`. Then choose exactly one handoff:

1. If another numbered phase remains in the selected plan or outline, save any changed task artifact in the task directory, read `references/implementation_phase_final_answer.md`, and point its command back to the same implementation skill. Do not use the pull-request handoff at this boundary.
2. Only when the completed phase is terminal, record all changed task artifacts, read `references/implementation_final_answer.md`, and respond with that template. The next step is `/describe-pr`.
