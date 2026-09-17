Phase {completed_phase} automated checks are green after iteration.

Review artifact: {artifact_link}

Check:
- {review_check}
- Known limits: {known_limits}

Deferred human evidence (recorded, not executed):
- {evidence item and pointer, or None}

Phase {next_phase} has not started. The command below starts it with the same implementation target.

Next action:
Open a new session, then run:

```text
{implementation_command} @{plan_file}
```
