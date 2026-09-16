Epic delivery started: {summary}

Review artifact: {artifact_link}

Check:
- {review_check}
- Known limits: {known_limits}

Wave 1 children and their start commands (run each from the project root; each child runs as its own delivery run, cuts its worktree from the epic branch named by `--base`, and opens its pull request against that branch):
- `{child_slug}`: `{child_start_command}`

The child `task.md` files are committed on the epic branch as `docs(task): open epic children`. Later waves start after every dependency's pull request is merged into the epic branch. Running the epic plan's delivery recorded approval of the epic plan; reply with changes to a child's `task.md` before starting it.

No phase of the epic follows this reply:

```text
/show-me
```
