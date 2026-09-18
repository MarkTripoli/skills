---
slug: any-time-any-work
title: "Any time   we do any work with this skill, we should be opening up a work tree.     Without question, by default, we hav"
workflow: oneshot
complexity: large
suggested_workflow: full
created: 2026-09-17
---
Any time   we do any work with this skill, we should be opening up a work tree.     Without question, by default, we have to do it.

## Scope

This branch carries two related changes to the by-hand delivery flow, both in scope for this task:

1. Every by-hand task opens its own git worktree by default (the request above).
2. `deliver` starts the Archon run in the foreground and reports the run id and first pause, instead of printing the command for the user to paste (commit `d15a47e`).

Change 2 was folded into this task per the `03` code review (CR-001, option 2): rather than split it to its own branch, its scope and acceptance live here so it is verified before merge.

## Acceptance

- A by-hand `/deliver` in a repository without `archon` on PATH opens the worktree at `~/.agents/worktrees/<repo>/<slug>` on branch `<slug>`, commits `task.md` in it, and the reply names the worktree path and branch.
- With Archon present, `/deliver` starts `archon workflow run delivery-<pack>` in the foreground, waits for its first pause or end, and replies with the run id and the gate it stopped at (no command is printed for the user to paste).
- `workflows/delivery.md`, `docs/cheatsheet.md`, `AGENTS.md`, and the four `runtimes/*.md` describe the deliver-starts-run behavior consistently, with no contradicting "prints the command" wording.
- `npm test` exits 0.
