# Existing-issue rewrite policy

Resolve the Jira site from the supplied issue/Epic URL or the authenticated accessible-resource inventory; no company site is the default. Use the cloud identifier accepted by the active MCP interface on every Atlassian call, verifying it matches that site. For an Epic batch, substitute the supplied Epic key into `parent = <EPIC-KEY> ORDER BY key ASC`; call `searchJiraIssuesUsingJql` with `view: "evidence"` and `maxResults: 100`, then follow `nextPageToken` until complete. For a single issue, inspect only that issue and its relevant links. Do not use Rovo search as a substitute for the live issue.

## Rating and QA header

| Clarity for QA | Meaning |
|---|---|
| High | QA knows what fixed looks like. |
| Medium | Goal clear, pass/fail line missing. |
| Low | No defined outcome to test. |
| N/A | No app behavior for QA to test: infrastructure/build setup, investigation finding, design exploration without a specification, umbrella placeholder, or a backend fix explicitly signed off without QA. |

Use the supplied rating and QA notes as leads, not truth; verify against ticket and comments. Without them, self-rate and say so. `panel-success` says `QA: Required.` with observed fix status and test prerequisites when testable and ready. `panel-warning` says `QA: Required, but…` with the missing merged fix, build, data, or contradictory evidence before testing. `panel-note` says `QA: Excluded.` with the N/A reason and the condition that would make it testable. A future feature pending implementation is warning, not excluded. Do not infer a merge or deployment from an open PR or local evidence.

## Proposed description order

1. QA header panel, always.
2. Rewrite where it improves clarity: Summary (two or three plain sentences); What was happening for bugs or Background for features; Expected result; **Functional specifications** with checkable source-backed outcomes; What the developer changed only when evidenced; Open questions with proposed decisions clearly labeled; Related; Found in with observed build/server/source link. Omit inapplicable headings. An empty original stays identified as empty and has missing facts under Open questions.
3. QA guide for every non-excluded ticket: heavy setup first; What you need (device, build, roles, data, network, tools); numbered Steps with one action and observation each; Pass; Fail; Report (step, build, screenshots, timings when relevant). Use exact button labels only from observed sources. If no known reproduction exists, say the goal is to try to trigger the bug, list situations to try, and accept a documented `couldn't reproduce` result. Mark beyond-scope regressions `Extra check` and report them separately.
4. The full original description in a collapsed `<details>` block at the end, outside the panel. The source HTML is fetched again at approved write time; the proposal records its hash and shows readable rewrite text, not a duplicate full raw body.

Pull confirmed rules out of comments; remove guesses that later evidence disproved while retaining the original below. Label every added unsourced behavior `(proposed; confirm with product)`. Never include secrets. Present batch proposals in priority order, five at a time, with each issue's key/title, what changes, readable proposed text, note that the original will be preserved, and specific questions to confirm. Show the HTML skeleton once in the first batch. Jira writing requires explicit approval by key or named batch and source-drift recheck.
