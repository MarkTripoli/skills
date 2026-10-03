---
name: fix-bug
description: Fixes the bug recorded in the newest reproduction artifact by following its fix steps until its reproduction passes, commits the code and records a fix receipt. Use when the user runs /fix-bug or /reproduce-bug reports status reproduced; not for a bug nobody has reproduced yet (use /reproduce-bug first) or for fixing review findings (use /fix-code-review).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Fix Bug

## Steps

1. Locate the task directory and read `task.md` and the newest reproduction artifact completely.

   When your assignment says so:
   - Latest evidence inspection failed: reserve the repair. Use the attempt id your assignment names and do not reserve again; with no id, call `node <skills-dir>/deliver/contract.mjs repair-begin "$TASK" <attempt-id>` before editing and `repair-complete` after.
   - Delegated execution for a `/deliver` task: assign the bounded fix to a child worker and verify the result. Model roles follow `deliver`'s Model roles; record the observed worker model or that selection was unavailable.
2. Follow the artifact's `## Fix` steps.
3. Run the reproduction's `Run:` command and confirm it now passes; then run the narrowest existing check for the same path from `## Fix`. Record both commands and their output in the receipt.
4. Commit the code with explicit paths per `ci-commit`, excluding the configured task root. Keep the reproduction as a regression test when it is one. Do not open a pull request.
5. Record the next immutable `implementation.fix` receipt with artifact type `fix`, recording the cause, change, and verification. Save it locally; never stage, commit, or push task artifacts.
6. Read `references/fix_answer.md`. Fill `{next_command}` with `/verify-implementation`. Use the template for the final answer.

For a delivery task, save the output of `node <skills-dir>/deliver/contract.mjs revision <task-dir>` as `revision`, never a git hash, record the policy and baseline paths, and report the evidence still missing. A source change makes earlier verification, review, recording and inspection historical. `node <skills-dir>/deliver/contract.mjs status <task-dir>` reports currency; optional for manual work.
