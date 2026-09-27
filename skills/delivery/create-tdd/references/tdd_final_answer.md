The TDD is ready for review.

Review artifact: {artifact_link}

Check:
- {review_check}
- The `### Execution DAG` section names the phases ahead, which are gated, and what runs unattended
- Known limits: {known_limits}

Reply with the changes you want, or run `/iterate-tdd @{artifact_file}`.

Running the next command records approval only when all consequential stakeholder choices are resolved and both design review gates are approved. If a choice remains open, withhold this final template; ask its named owner the next architecture or failure-path decision question and wait rather than offering approval or `/create-plan`.

Next action:
Open a new session in {run_location}, then run:

```text
/create-plan @{artifact_file}
```
