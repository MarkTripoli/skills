The PRD is ready for review.

Review artifact: {artifact_link}

Check:
- {review_check}
- Known limits: {known_limits}

Reply with the changes you want, or run `/iterate-prd @{artifact_file}`.

Running the next command records approval only when all consequential stakeholder choices are resolved and the solution review gate is approved.

Next action:
If `### Ambiguity Disposition` contains an unresolved consequential stakeholder choice, do not offer approval or `/create-tdd`; ask its named owner the next decision question and wait. Once every such choice is resolved and the solution review gate is approved, open a new session in {run_location}, then run:

```text
/create-tdd @{artifact_file}
```
