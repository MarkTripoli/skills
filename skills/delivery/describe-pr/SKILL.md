---
name: describe-pr
description: Run for /describe-pr requests. Create or update the pull request description for the current task.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Pull Request Description

Create or update PR description. Explain why and how.

## Workflow

### 0. Load context

Locate the task directory and read `task.md` per the conventions before reading other files; list the task directory to find artifacts. When no task directory matches the request, continue without one and use the `pr-<number>` path in step 5.

Read from this skill directory:

- `references/pr_description_template.md`
- `references/show-me.md`
- `references/pr_walkthrough_example.html` (user wants HTML walkthrough only)
- `references/pr_description_final_answer.md`

### 1. Read template

Read `references/pr_description_template.md`. Keep body in template. No changelog, verification report, plan appendix, long narrative.

### 2. Identify or create PR

Discover the pull request and diff with git and `gh` (GitHub) or `glab` (GitLab):

```bash
git status --short --branch
gh pr view --json url,title,number,baseRefName,headRefName
git diff --name-status <base>...HEAD
git diff <base>...HEAD
```

On GitLab, `glab mr view` replaces the `gh pr view` line. `<base>` is the existing pull request's base, else `base:` from `task.md` when present, else the repository default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`).

If no PR exists, inspect branch status and committed changes. Commit and push only when required: code commits stage explicit code paths; uncommitted task artifacts go in their own `docs(task): <artifact type> artifact` commit per the conventions' Commits section. Then create the pull request with `gh pr create` or `glab mr create`. With neither CLI, print the branch and base for a manual pull request.

### 3. Gather context

Read `task.md` or `ticket.md`, explanatory artifacts: plan, outline, PRD/TDD, design, receipts, @file inputs. When the task directory holds an `evidence` artifact (newest `NN-evidence-*.md`), read it: its sessions, results table, caveats, and where the video was posted go into the description.

Read full diff plus surrounding code.

If the task has a plan, start a child worker for role `agent-implementation-reviewer` with the assignment "Compare <plan path or task dir> with the current implementation against <base>. Return only reviewer-relevant deviations." (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message.

Verify important child worker claims against the diff.

### 4. Write description

Template exactly:

- `Why the change`: one sentence.
- `Special things to note`: one to three bullets. `- None.` when no warnings, migrations, constraints, omissions, surprises.
- `Acceptance criteria` (only when `task.md` lists them): one bullet per criterion in task order, each naming the command, request, or observation that decides it. A criterion this diff does not satisfy is listed with what is missing; never drop one.
- `Evidence` (only when an `evidence` artifact exists): the result line, one bullet per recorded surface linking its `report.md`, and the video location; a failed test is never described as passing.
- `Change outline`: compact structural view from `references/show-me.md`. Views that help: data shape, endpoint contract, pseudocode, file tree, component tree, call/control/data flow. `diff` for changes, full shape for new. Focus on files, calls, fields, components, boundaries.

Task artifacts are committed on the branch, so the body may link them as branch-relative paths (`.agents/tasks/<slug>/NN-plan-<slug>.md`); the hosting site renders them from the head branch. Link only files that `git ls-files .agents/tasks/<slug>` lists.

Do not include walkthrough artifacts in the PR body unless asked. When requested, create a separate HTML artifact from `references/pr_walkthrough_example.html`, fill it with real diff nodes, write it under the task directory, and save it.

### 5. Save and publish

Write `.agents/tasks/<task-slug>/pr-description.md` (no task dir: `.agents/tasks/pr-<number>/description.md`).

Save the file. When not run by the workflow engine, commit it with `git add <path>` as `docs(task): pr-description artifact` and push before publishing. Publish:

1. `gh` on PATH, GitHub PR: `gh pr edit <number> --body-file <path>` (new PR: `gh pr create --base <base> --body-file <path>`).
2. `glab` on PATH, GitLab MR: `glab mr update <number> --description "$(cat <path>)"` (new MR: `glab mr create --target-branch <base> --description "$(cat <path>)"`).
3. Otherwise: print the branch, base, and description path for a manual pull request.

Confirm URL, title, number, base, head.

### 6. Report

Read and use `references/pr_description_final_answer.md` exactly. Include PR URL, file-change summary, deviation summary or `No plan file found`. Fill `{artifact_link}` with a relative Markdown link to the saved file, `[pr-description.md](.agents/tasks/<slug>/pr-description.md)`.

The final answer must end with exactly one fenced `text` block. This is a human gate; running the next command records approval.

## Feedback

When `pr-description.md` already exists and the user (or the invoking prompt) supplies feedback, revise that file in place and publish it again with the step 5 command so the pull request body matches. Never write a second description.

## Style

- Engineer to engineer.
- Reviewable in one pass.
- Risk before summaries.
- No filler, slang, unexplained acronyms.
- Use `gh` for GitHub remotes and `glab` for GitLab remotes; otherwise print the branch and base for a manual pull request.
