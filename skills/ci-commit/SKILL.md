---
name: ci-commit
description: Run for /ci-commit requests. Create focused commits for completed work.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Commit Changes

Create commits for completed work. No approval pause; this skill is the commit step.

## Process

### 1. Locate the task

Locate the task directory and read `task.md` per the conventions, including the create-when-missing rule. Use its slug and the task directory listing to name the receipt. Read only files needed for the work.

### 2. Review changes

```bash
git status --short --branch
git diff
```

Inspect staged. Read changed files. Decide one or multiple commits.

Do not stage `.agents/tasks/`, scratch, dummy scripts, one-off tests, unrelated output.

### 3. Plan commits

Group by purpose. Imperative subjects, reason over file lists.

Unrelated edits: leave unstaged, mention. Mixed file: ask how to split unless obvious.

### 4. Execute

```bash
git add <path> <path>
git commit -m "<subject>"
```

Never `git add -A`, `git add .`, broad staging. Verify.

### 5. Save receipt

Useful: take the next artifact number, write `NN-commit-<slug>.md` from `references/commit_template.md`, save the file in the task directory.

Read and use `references/commit_final_answer.md` exactly. Fill `{artifact_link}` with a relative Markdown link to the saved receipt, `[NN-commit-slug.md](.agents/tasks/<slug>/NN-commit-slug.md)`; when no receipt was saved, write `none` in its place. End with single fenced `text` command.

If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.

## Rules

- Use current session context; do not ask the user to restate it.
- Focused commits.
- No task directory, unrelated files.
- Failed tests, unsafe git: blockers.
