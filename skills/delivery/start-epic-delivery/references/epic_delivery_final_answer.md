Epic delivery started: {summary}

Review artifact: {artifact_link}

Check:
- {review_check}
- Known limits: {known_limits}

Wave 1 children and their first manual skill commands:
- `{child_slug}` ({child_issue}), task directory `.agents/tasks/{child_slug}/`: `{child_start_command}`

Each child starts in a fresh session in its own worktree cut from the epic branch recorded as `base` in its `task.md`. <Name the epic branch and the worktree creation command for each child; identify existing child worktrees from observed state. For oneshot children, say to choose manual delivery, implement, verify, and commit before review.> The child's pull request targets that epic branch and closes its recorded issue when present.

The child task files and this receipt are committed on the epic branch. Running this skill recorded approval of the epic plan; review any child changes before starting that child. Later waves start only after every dependency's pull request is merged into the epic branch. Optional workflow automation may launch ready children; none were launched by this skill.
