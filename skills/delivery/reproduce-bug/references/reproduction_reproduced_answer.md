{summary}

Review artifact: {artifact_link}

Check:
- {review_check}

Known limits:
- {known_limits}

Reply with changes, or run `/reproduce-bug` again with corrections; either records the next `debugging.reproduction` iteration. Running the next command records approval: the fix goes ahead from the artifact's `## Fix` steps.

The fix phase has not started. It applies the artifact's `## Fix` steps, makes the reproduction pass, commits with explicit paths, and then runs the review.

Next action:
Open a new session in {run_location}, then run:

```text
/fix-bug
```
