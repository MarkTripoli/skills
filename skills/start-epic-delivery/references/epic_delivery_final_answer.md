Epic delivery started: {summary}

Review artifact: {artifact_link}

Check:
- {review_check}
- Known limits: {known_limits}

Wave 1 children and their start commands (each runs in its own fresh context):
- `{child_slug}`: `{child_start_command}`

Later waves start after every dependency's pull request is merged. Running the epic plan's delivery recorded approval of the epic plan; reply with changes to a child's `task.md` before starting it.

Start the next phase in a new session, or hand the task to `/run-task`; continuing in this session carries this phase's context into the next one.

```text
{first_child_command}
```
