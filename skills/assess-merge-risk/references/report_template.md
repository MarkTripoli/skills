**Merge risk: {High|Medium|Low}**: `{source}` into `{target}` ({source short SHA} onto {target short SHA})

{One or two sentences: the user-facing outcome that sets the level, who meets it, and whether a revert undoes it.}

| # | What users would see | Who | Severity | Reach | Level | Evidence | Intent |
|---|---|---|---|---|---|---|---|
| 1 | {outcome in user terms} | {screens, journeys or clients} | {S1-S4} | {Narrow, Feature or Wide} | {High, Medium or Low, then each adjustment key in parentheses, e.g. `Medium (down: flag)`} | {repository-relative `path:line` of the change and of each affected consumer; filenames need not have extensions} | {Specified (<source>), Stated (<source>), Contradicts (<source>) or Unexplained} |

Intent: {one sentence on what the change means to change for users}. Read: {each source read: ticket key, artifact or doc path, page link}. Not available: {sources looked for and not found or not readable, or "None."}

Merge: {conflicts and files changed on both sides, or "No conflicts; no file changed on both sides"}

Not verified: {what could not be read or traced, or "None."}

Retracted:
- {the withdrawn finding, in user terms}. Cleared by: {the check run, with the source commit as `<sha>`, or the evidence}. Observed: {what the run or evidence showed}

Advisories:
- Finding {n}. Test: {an integration test that would catch this finding's failure: where it goes and what it asserts}

Before merging:
1. Finding {n}. Test: {the integration test to add: where it goes, the setup, and what it asserts}. Local check: {exact steps a developer runs on their machine, with at least one run `<command>`, then "expect" and the result that clears the finding}
