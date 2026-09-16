{summary}

Review artifact: {artifact_link}

Check:
- {review_check}

Known limits:
- {known_limits}

Reply with the changes you want, or run `/reproduce-bug` again with corrections; either revises the artifact in place. Running the next command records approval: the fix goes ahead from the artifact's `## Fix` steps.

Start the next phase in a new session; continuing in this session carries this phase's context into the next one.

Apply the `## Fix` steps and make the reproduction pass, commit with explicit paths, then run the review:

```text
/review-code
```
