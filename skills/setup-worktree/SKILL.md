---
name: setup-worktree
description: Run for /setup-worktree requests. Create or reuse the task worktree from the workspace config, copy files, run setup, and hand off to implementation.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

## Steps

### 0. Decide whether setup is skipped

Locate the task directory and read `task.md` per the conventions (create one from the request when none exists) before reading other files. Use its slug and `workflow`.

Read workspace config:

```text
.agents/workspace.json
.agents/workspace.local.json
```

Local overrides shared. If the effective root config has `disabled: true`, do not continue with setup unless the user explicitly asks you to override it. Disabled: check branch suitable (check out branch `<slug>` first when it does not exist), handoff to `/implement-outline` (`lean`) or `/implement-plan` (`full`, `prd`).

Check if already in a task worktree:

```bash
git worktree list
git rev-parse --git-dir
```

Already in a worktree (the git dir path contains `/worktrees/`): continue with the setup work in the current worktree: resolve workspace config from the current checkout, apply copyGlobs, run setupCommand, and verify the branch. Do not create another worktree.

### 1. Gather task information

Read `task.md` or `ticket.md`, then plan artifact (`/implement-plan`) or outline (`/implement-outline`).

List the task directory if the source artifact is not already selected: the newest artifact of type `plan` (`full`, `prd`) or `structure-outline` (`lean`).

### 2. Create default config when none exists

Run this step only if neither workspace config file exists.

Check legacy setup:

```text
scripts/create_worktree.sh
README.md
Makefile
package.json
```

Legacy script: read usage, ask before running it, verify the worktree it creates, and skip creation in Step 3.1 for that path. Do not create second worktree unless user requests.

No convention: write `.agents/workspace.json`:

```json
{
  "repos": [{"localPath": ".", "description": "Selected repository", "primary": true}],
  "disabled": false,
  "sourceRef": "HEAD",
  "branchTemplate": "{{ TASKSLUG }}",
  "pathTemplate": "~/.agents/workspaces/{{ TASKSLUG }}/{{ REPOBASENAME }}",
  "setupCommand": "",
  "copyGlobs": [".agents/workspace.local.json", "CLAUDE.local.md", ".env*", ".claude/settings.local.json"]
}
```

Multi-repo: add siblings with `localPath` relative, one `primary: true`.

Repository config files are normal repository files and should be committed through the regular git flow, not saved as task artifacts.

### 3. Create or reuse the worktree and apply setup

Create the worktree with git, then perform file-copy and setup-command.

Source for copyGlobs: the current checkout of each repo (its root).

Resolve effective config: defaults, workspace.json, workspace.local.json, per-repo overrides.

Only `{{ TASKSLUG }}` and `{{ REPOBASENAME }}` template variables. Unsupported variables are errors.

For each repo:

#### 3.1: Create or reuse worktree

Resolve `<path>` from `pathTemplate` (expand `~`) and `<branch>` from `branchTemplate`.

```bash
git -C <localPath> worktree list
git -C <localPath> worktree add <path> -b <branch> <sourceRef>
git -C <path> status --short --branch
```

When `git worktree list` already shows `<path>`, reuse it and skip `worktree add`. When branch `<branch>` already exists, add without `-b`: `git -C <localPath> worktree add <path> <branch>`. Report requested vs actual path, branch, and source ref.

#### 3.2: Copy files

Build `copyGlobs` additively, de-duplicate. Copy only files that exist in the source checkout and are safe to copy. Preserve the relative path under the target worktree.

For the primary repo, also copy `.agents/tasks/<slug>/` into the worktree so later phases find the task directory there.

Record: files copied, no-match patterns, skipped items, already present.

No `node_modules` unless user configured and confirms.

#### 3.3: Run setup command

Non-empty `setupCommand`: run from worktree path. Capture command, status, output.

If the command fails, stop before Step 4. Report the failure and work with the user on retrying, skipping, or changing the config.

### 4. Report success

Only after all repos verified, all setup commands succeeded or skipped.

Receipt from `references/worktree_template.md`. Task artifact: take the next artifact number, write `NN-worktree-setup-*.md` into the task directory, save the file, then copy it into the worktree's task directory copy.

`{implementation_command}`: `/implement-outline` for `lean`, `/implement-plan` for `full` and `prd`.

Read and use `references/worktree_final_answer.md`. Fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-worktree-setup-slug.md](.agents/tasks/<slug>/NN-worktree-setup-slug.md)`. `{summary}` names the worktree path and branch; the next command runs from that path. The final answer must end with exactly one fenced `text` block containing the manual next command. Running the next command records approval.

If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.

## Rules

- `.agents/workspace.json` matches research schema.
- `.agents/workspace.local.json` gitignored, machine-specific.
- Multi-repo setup sequential, record all.
- Verify the worktree with git, not just config existence.
- Read only: task file, plan/outline, @file args, feedback the user supplied.
