# Quality

Validating a change before it merges, and keeping the lessons afterwards. Source: `skills/quality/`. Verification of a delivery task itself (`/verify-implementation`, `/review-code`, `/test-app`, `/record-evidence`) lives in the [delivery workflow](delivery.md).

| Skill | Use it to | Produces | Runs code |
|---|---|---|---|
| [`assess-merge-risk`](../skills/quality/assess-merge-risk/SKILL.md) | Rate what users would notice if a branch merged | A checked Low, Medium or High report with cited findings | No; names the checks for a person to run |
| [`blast-radius`](../skills/quality/blast-radius/SKILL.md) | Find what a change breaks outside its diff | The one fact its safety rests on, proven by a script; risks confirmed and cleared | Yes; a scratch script against the real code |
| [`two-axis-review`](../skills/quality/two-axis-review/SKILL.md) | Review a branch since a fixed point | Separate Standards and Spec findings, never merged into one ranking | No |
| [`retrospect`](../skills/quality/retrospect/SKILL.md) | Decide whether a run, correction or revert holds a lesson | Usually "nothing to learn"; else a ledger entry and one draft pull request | No |

Which one before merging:

- "Is it safe for users?": `assess-merge-risk`. Read-only, host-aware, and its report format is machine-checked.
- "I do not trust this diff": `blast-radius`. It proves a claim instead of rating one.
- "Does it follow our standards and do what was asked?": `two-axis-review`. Inside a delivery task, `/review-code` writes the evidence-backed review artifact instead.
- Both, for a risky change: `blast-radius` first, then report its result to `assess-merge-risk` to clear or keep findings.

## Fit merge-risk surfaces to a repository

`assess-merge-risk` tags changed files by surface (migration, auth, shared UI and so on) from one data file, and works on any language or framework whose paths follow convention. Add, replace or remove surfaces per repository by committing `.agents/merge-risk.json` on the target branch; the skill's "Add or remove a surface" section has the format.
