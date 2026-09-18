---
"@marktripoli/skills": minor
---

`deliver` starts the Archon run instead of printing the command. With Archon present it runs `archon workflow run delivery-<pack> --branch <branch>` from the project root in the foreground, waits until the run pauses at its first gate or ends, and replies with the run id, the branch and worktree, the gate it stopped at, and the pauses still ahead. A worktree already in use by an earlier run is attached to with `archon workflow wait`, never started twice. Each runtime's skill notes name the mechanism for a command that runs for minutes.
