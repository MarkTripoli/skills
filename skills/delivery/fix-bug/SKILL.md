---
name: fix-bug
description: Fix the bug recorded in the newest reproduction artifact so its reproduction passes. Use after reproduce-bug reports reproduced.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Fix Bug

Fix the bug recorded in the newest reproduction artifact so its reproduction passes.

## Steps

1. Locate the task directory and read `task.md` and the newest reproduction artifact completely.
2. Follow the artifact's `## Fix` steps. Make the failing test or command it names pass.
3. Run the narrowest checks that prove nothing else broke.
4. Commit the code with explicit paths per `ci-commit`. Keep the reproduction as a regression test when it is one. Do not open a pull request.
5. Record the next immutable `implementation.fix` receipt through the conventions' Recording an artifact flow, with artifact type `fix` and the cause, change, and verification. Commit its canonical path and `index.json` explicitly as `docs(task): fix artifact`. A legacy task without `index.json` follows the conventions' legacy rules.
6. Read `references/fix_answer.md` and use it for the final answer.
