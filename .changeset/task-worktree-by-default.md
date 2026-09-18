---
"@marktripoli/skills": minor
---

A task run by hand now gets its own git worktree, the way an Archon run gets one from `--branch`. The conventions' new Task worktree section is the rule: a skill that opens the task directory first runs `git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug> <target>`, where `<repo>` is the main worktree's basename and `<target>` the merge target (pull request base, `task.md` `base:`, else the default branch), so the task branch forks from the base and not from whatever the session has checked out; it creates the directory there so `task.md` and every later commit land on the task branch, and reports the path. It is the default and no skill asks about it; the only cases that skip it are a session already on the task's branch, a task directory that already existed, a project that is not a git work tree, and the user asking for the current checkout in that session. `deliver`'s by-hand reply names the worktree and its branch.
