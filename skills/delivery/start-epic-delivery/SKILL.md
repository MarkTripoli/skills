---
name: start-epic-delivery
description: Creates indexed child tasks and GitHub issues from an approved epic plan, computes dependency waves, and hands off the first ready wave. Use when the user runs /start-epic-delivery after /create-epic-plan; not for planning the children or launching their implementation.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Epic Delivery Start

Running this skill records approval of the epic plan. `<skills-dir>` holds the installed delivery skills.

Copy this checklist:

```text
- [ ] task directory and current epic plan located
- [ ] epic branch recorded
- [ ] dry run clean
- [ ] child tasks and issues created or missing access recorded
- [ ] child worktrees prepared
- [ ] immutable receipt recorded
- [ ] first ready wave handed off
```

## Steps

1. Locate the task directory and read `task.md` per the conventions. Use the user's explicit `@file`; otherwise select current `planning.epic` through the validated index. Only a genuinely unindexed legacy task uses numbered discovery. Read the epic plan completely; no plan means stop and ask for it.
2. Read `git rev-parse --abbrev-ref HEAD`. `HEAD`, `main` or `master` means stop: children need a recorded epic branch as their base. Create the task branch per the conventions before rerunning. Record the branch as `<epic branch>` and the parent task slug as `<epic slug>`.
3. Validate without mutations:

   ```sh
   node <skills-dir>/start-epic-delivery/scripts/start-epic.mjs <epic-plan-file> --epic-branch <epic-branch> --epic-slug <epic-slug> --tasks-dir <task-root> --dry-run
   ```

   `scripts/check-children.mjs` is the imported child-schema validator; `scripts/start-epic.mjs` executes validation, wave computation and task initialization. Fix reported violations through `/create-epic-plan`, not by editing the approved plan here. An existing directory with another parent or a symlink stops before writes; a same-epic child is a resumable partial run. Invalid indexes fail closed.
4. Rerun the same command without `--dry-run`. It creates each child's `task.md` and empty `index.json`, resolves the configured task root, and attempts authenticated GitHub issue creation through `gh` in wave order. Issues include the prompt, dependencies, epic reference and task directory. The returned issue number becomes `issue:` and the child's branch identity. Missing access or an individual issue failure is a known limit, not a reason to discard created tasks. A rerun reuses same-epic tasks, skips existing issues and preserves legacy task ownership; it never resets an index.
5. Prepare each child worktree from its recorded epic base and branch per the conventions. Copy only that child's local task files into the same configured task-root path in the new worktree. Existing child worktrees retain their own local artifacts. Do not stage or commit task directories, and do not copy the epic's artifact history into a child.
6. Record the next immutable `delivery.epic` iteration from `references/epic_delivery_template.md`. Include epic branch, child paths and issue numbers or `none`, waves, partial-run outcomes and known limits. Keep the index and receipt local.
7. Read `references/epic_delivery_final_answer.md` and fill the canonical receipt link. List each wave-one child's slug, task directory, issue and first manual skill. Full/lean starts with `/create-research-questions`, prd with `/create-research`, bugfix with `/reproduce-bug`, and oneshot with `/deliver` on its child task. Each child starts in its own worktree and fresh session; an existing-behavior change seals an authentic base-commit baseline before implementation.

## Boundaries

- No child phases start here. Later waves start only after every dependency's pull request is merged.
- Report only issue numbers returned by GitHub, never inferred identifiers.
- Every child repeats current verification, review, recording and inspection before publication. An initialization receipt is not delivery proof.
- Task files stay local and ignored; code commits belong to the separate implementation phases.
