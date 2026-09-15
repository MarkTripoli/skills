Phase {completed_phase} automated checks are green.

Review artifact: {artifact_link}

Check:
- {review_check}
- Known limits: {known_limits}

Deferred human evidence (recorded, not executed):
- {evidence item and pointer, or None}

Implementation continues to Phase {next_phase}. This command re-enters the skill with the same outline if the run is interrupted.

Start the next phase in a new session, or hand the task to `/run-task`; continuing in this session carries this phase's context into the next one.

```text
/implement-outline @{plan_file}
```
