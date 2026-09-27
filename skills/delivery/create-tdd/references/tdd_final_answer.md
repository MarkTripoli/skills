The TDD is ready for review.

Review artifact: {artifact_link}

Check:
- {review_check}
- The `### Execution DAG` section names the phases ahead, which are gated, and what runs unattended
- Known limits: {known_limits}

Reply with the changes you want, or run `/iterate-tdd @{artifact_file}`.

Running the next command records approval only when all consequential stakeholder choices are resolved and both design review gates are approved.

Next action:
If `### Ambiguity Disposition` contains an unresolved consequential stakeholder choice, do not offer approval or `/create-plan`; ask its named owner the next architecture or failure-path decision question and wait. Once every such choice is resolved and both design review gates are approved, open a new session in {run_location}, then run:

```text
/create-plan @{artifact_file}
```
