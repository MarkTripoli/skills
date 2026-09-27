The updated plan is ready for review.

Review artifact: {artifact_link}

Check:
- {review_check}
- Known limits: {known_limits}

Reply with the changes you want, or run `/iterate-plan @{artifact_file}`.
The next command records approval only when all consequential owner choices are resolved and the independent acceptance critique has no unresolved actionable findings.

Next action:
If any consequential owner choice is unresolved or critique finding remains actionable, do not offer `/implement-plan`; open a new session in {run_location} and run `/iterate-plan @{artifact_file}` to resolve the decision, revise, and rerun the critique.
Otherwise open a new session in {run_location}, then run:

```text
/implement-plan @{artifact_file}
```
