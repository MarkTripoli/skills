# Workspace Configuration Receipt

Write `.agents/workspace.json` with this schema after the user accepts the proposal.

{
  "repos": [
    {
      "localPath": ".",
      "description": "Selected repository",
      "primary": true
    }
  ],
  "sourceRef": "origin/main",
  "branchTemplate": "{{ TASKSLUG }}",
  "pathTemplate": "~/.agents/workspaces/{{ TASKSLUG }}/{{ REPOBASENAME }}",
  "setupCommand": "",
  "copyGlobs": [
    ".agents/workspace.local.json",
    ".env.local",
    ".env.development.local",
    ".claude/settings.local.json",
    ".env"
  ],
  "disabled": false
}

## Validation
- repo root:
- remotes:
- repo entries checked:
- setup command:
- local override:

Report requested path and branch templates as config intent; `/setup-worktree` resolves them into the actual worktree path and branch.
