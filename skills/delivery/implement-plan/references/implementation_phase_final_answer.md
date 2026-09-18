Phase {completed_phase} automated checks are green.

Review artifact: {artifact_link}

Check:
- {review_check}
- Known limits: {known_limits}

Deferred human evidence (recorded, not executed):
- {evidence item and pointer, or None}

Phase {next_phase} has not started. The command below starts it with the same plan.

Next action:
Open a new session in {run_location}, then run:

```text
/implement-plan @{plan_file}
```
