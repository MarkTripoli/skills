Stopped: `<done | needs-human: question | blocked: prerequisite; unblock check: command | no-progress: evidence>`.

Task: [task.md](.agents/tasks/<slug>/task.md) in `<worktree path>` on branch `<branch>`. <PR link and current-head pipeline state when published.>

Evidence:
- <one line per reviewer record and check: checkpoint, round, verdict, reviewer model or `unobserved`>
- <sealed evidence and its hosted links, or `untested`/`unverified` surfaces with reasons>

Open decisions:
- <one line per question the human must settle, or `None.`>

Tool approval preflight: <observed harness and mode, or a warning that it cannot be verified; only when it was run>

Your step: <the one thing the human does. Unless the run is done, end with: then run `/deliver .agents/tasks/<slug>/` in a new session in that worktree.>
