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

Discover the pull request and diff with `git` and GitHub CLI (`gh`):

```bash
git status --short --branch
gh pr view --json url,title,number,baseRefName,headRefName
git diff --name-status <base>...HEAD
git diff <base>...HEAD
```

`<base>` is the existing pull request's base, else `base:` from `task.md` when present, else the repository default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`).

If no PR exists, inspect branch status and committed changes. Commit and push only when required: code commits stage explicit code paths; uncommitted task artifacts go in their own `docs(task): <artifact type> artifact` commit per the conventions' Commits section. Then create the pull request with `gh pr create --title "<title>"`. If `gh` is unavailable or unauthenticated, report the missing prerequisite; do not claim publication.

The title is a Conventional Commits subject under the conventions' rule: `<type>(<scope>): <description>`, lower-case description, no trailing period, at most 72 characters including the type and scope. Write it for the change as a whole, not the first commit. Before creating or retitling, run `node scripts/check-commits.mjs --title "<title>"` when the repository has that script; otherwise count the characters and match the pattern yourself. A title that fails is shortened or rewritten; it is never sent to GitHub, because the `Commits` check fails the pull request on it.

### 3. Gather context

Read `task.md` or `ticket.md`, explanatory artifacts selected through current index records, and `@file` inputs. Read current `review.verification` and `evidence.recording` when present. An untested verification item is described as untested, never as passing.

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
- `Closes #{ISSUE_NUMBER}`, the template's last line: keep it only when `task.md` has `issue: <number>` (an epic child whose issue `start-epic-delivery` opened), filled with that number, so the merge closes the issue; otherwise delete the line and the blank line before it, so the body ends with the Known limits bullet.

Task artifacts are committed on the branch, so the body may link their canonical task-root-relative paths. Link only files that `git ls-files <task-root>/<slug>` lists.

Do not include walkthrough artifacts in the PR body unless asked. When requested, create a separate HTML artifact from `references/pr_walkthrough_example.html`, fill it with real diff nodes, write it under the task directory, and save it.

### 5. Save and publish

Record the body-only description as the next immutable `pull-request.description` iteration through the conventions' Recording an artifact flow. It has no frontmatter. When no task exists, open one under the resolved task root first.

Save the file. Commit it with `git add <path>` as `docs(task): pr-description artifact` and push before publishing. Publish:

Publish with GitHub CLI:

1. Existing PR: `gh pr edit <number> --body-file <path>`.
2. New PR: `gh pr create --base <base> --body-file <path> --title "<title>"`.

Confirm URL, title, number, base, and head. Retitle an existing PR that fails the rule above with `gh pr edit <number> --title "<title>"`.

### 6. Report

Read and use `references/pr_description_final_answer.md` exactly. Include PR URL, file-change summary, deviation summary or `No plan file found`. Fill `{artifact_link}` with the saved canonical task-root-relative path. Commit that path and `index.json` explicitly as `docs(task): pr-description artifact`.

The final answer must end with exactly one fenced `text` block. This is a human gate; running the next command records approval.

## Feedback

When `pull-request.description` already has a current iteration and feedback arrives, use it as input, record the revised body as the next iteration, and publish that new path so the pull request body matches. Never rewrite a recorded iteration. A legacy task without `index.json` follows the conventions' legacy rules.

## Style

- Engineer to engineer.
- Reviewable in one pass.
- Risk before summaries.
- No filler, slang, unexplained acronyms.
- Use `gh` for GitHub remotes; otherwise report the branch, base, and description path for a manual pull request.
