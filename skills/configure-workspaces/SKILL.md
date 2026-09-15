---
name: configure-workspaces
description: Run for /configure-workspaces requests. Propose, write, and validate workspace config files that define task worktrees.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Configure Workspaces

## Purpose

Propose, write, and validate `.agents/workspace.json` (shared, committable) and `.agents/workspace.local.json` (machine-specific overrides, gitignored). These configure worktree path and branch templates, source refs, setup commands, file-copy requests, and multi-repo intent; `/setup-worktree` creates the task worktree from them.

## Steps to Follow

### Step 0: Select the repository

Locate the task directory and read `task.md` per the conventions when the request belongs to a task. No task: continue as repo config session, no artifact saved.

Check location:

```bash
pwd
printf '%s\n' "$HOME"
git rev-parse --path-format=absolute --show-toplevel
```

If git confirms a repo, use it. If home or not git, ask once:

```text
Which repository should I configure? Send its path.
```

Confirm given path:

```bash
git -C <path> rev-parse --show-toplevel
```

Use returned root.

### Step 1: Read the project

Read current config:

```text
.agents/workspace.json
.agents/workspace.local.json
```

Inspect setup signals:

```text
.claude/settings.json
package.json
Makefile
README.md
```

Check siblings and remotes:

```bash
ls -la ../
git remote -v
```

Multiple plausible remotes and no clear base: ask which remote.

Read task.md, ticket.md, or @file artifacts only when they change the proposal.

### Step 2: Draft workspace config

Defaults:

- Single repo unless siblings clearly needed.
- `localPath: "."`, `primary: true` for one repo.
- One primary in multi-repo.
- Repo with shared agent settings or team policy is usually primary.
- `pathTemplate: "~/.agents/workspaces/{{ TASKSLUG }}/{{ REPOBASENAME }}"`.
- `branchTemplate: "{{ TASKSLUG }}"`.
- `sourceRef: "origin/main"` when it exists, else `HEAD`.
- Setup command from package.json, Makefile, or README.
- `copyGlobs`: env files, machine settings, `.agents/workspace.local.json`.
- Machine-specific paths, secrets, local-only commands go in `.agents/workspace.local.json`.

Multi-repo: mark one repo `primary: true`, add siblings as `../api`, `../web`.

Present shared config as `json` fence. Machine overrides as separate `json` fence.

End:

```text
Tell me what to change, or approve this config.
```

Changes requested: print full updated JSON. Do not write before approval.

### Step 3: Validate the proposal

Single-repo shape:

```json
{
  "repos": [{"localPath": ".", "description": "Selected repository", "primary": true}],
  "disabled": false,
  "sourceRef": "origin/main",
  "branchTemplate": "{{ TASKSLUG }}",
  "pathTemplate": "~/.agents/workspaces/{{ TASKSLUG }}/{{ REPOBASENAME }}",
  "copyGlobs": [".agents/workspace.local.json", ".env.local", ".claude/settings.local.json", ".env"],
  "setupCommand": ""
}
```

Multi-repo: list all repos with one `primary: true`.

Rules:

- `localPath: "."` is this repo.
- Only `{{ TASKSLUG }}` and `{{ REPOBASENAME }}` template variables.
- `copyGlobs` merges additively with de-duplication.
- Repo entry can override `sourceRef`, `setupCommand`, `copyGlobs`, `primary`.
- `branchTemplate` on root only.
- `.agents/workspace.local.json` may use `{"$patch": "delete"}` to remove a repo locally.
- `disabled: true` disables setup.
- `sourceRef` valid for worktree creation: `HEAD`, absent, `origin/<branch>`, named branch. Raw SHAs invalid.

Validate:

```bash
git remote -v
ls -la <localPath>
git -C <localPath> rev-parse --git-dir
git -C <localPath> remote -v
```

Confirm directory exists, is git repo. Verify remote exists if named. State setup command intent.

### Step 4: Write the approved config

Write `.agents/workspace.json`.

If local overrides needed, write `.agents/workspace.local.json` and ensure it is ignored by git:

```text
.agents/workspace.local.json
```

Read `.gitignore`. Add the ignore entry only when missing.

Repo config files are normal files, not task artifacts. A receipt, when written, is a normal file save into `.agents/tasks/<slug>/`.

### Step 5: Confirm and summarize

Confirm: files written, repo count, primary repo, path/branch templates, source ref, setup command, copy files.

Next step:

```text
Workspace configuration ready. /setup-worktree creates or reuses the worktree from this config, copies files, runs setup, and hands off to implementation.
```

Team repos: commit `.agents/workspace.json`, not `.agents/workspace.local.json`.

Task receipt: take the next artifact number, write from `references/workspace_template.md` into the task directory, save the file, read and use `references/workspace_final_answer.md` exactly. Fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-workspace-config-slug.md](.agents/tasks/<slug>/NN-workspace-config-slug.md)`.

If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.

## Key Concepts

### Template variables

- `{{ TASKSLUG }}`: task slug.
- `{{ REPOBASENAME }}`: repo basename.

Reject others.

### Config precedence

```text
defaults -> workspace.json -> workspace.local.json
```

`repos[]`: same `localPath` merges, later wins. New `localPath` adds repo. `$patch: "delete"` removes locally.

### copyGlobs

Lists extend inherited, de-duplicate. Root lists apply to all repos. Repo lists add specific files. No removal syntax.

### Primary repo

Default working directory for the task session. Single-repo implicitly primary. Multi-repo: mark one. Choose repo owning agent settings and implementation. Unclear: ask.

### disabled

`disabled: true` disables setup. Local override can re-enable.

## References

Read from this skill directory:

- `references/workspace_template.md`
- `references/workspace_final_answer.md`
