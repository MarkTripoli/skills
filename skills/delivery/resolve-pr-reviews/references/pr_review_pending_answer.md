The pull request review round needs another human review.

Review artifact: {artifact_link}

Review round:
{summary}

Check:
- {review_check}
- Known limits: {known_limits}

When repository changes are needed, run `/iterate-implementation` with the changes you want, then `/verify-implementation`, `/review-code`, `/record-evidence`, `/iterate-evidence`, and `/describe-pr` before another review round. Re-record every behavior change and update both the PR description and distinct evidence comment.
Starting another review round does not record approval; pull request approval remains external.

Another review round has not started.

Next action:
Open a new session in {run_location}, then run:

```text
/resolve-pr-reviews
```
