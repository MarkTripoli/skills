Ticket: [{TICKET_ID}]({TICKET_URL}) | Task: `{TASK_SLUG}` | Walkthrough: [{PR_WALKTHROUGH_URL}]({PR_WALKTHROUGH_URL})

## Purpose

{One sentence explaining the problem addressed and the capability this PR adds.}

## Acceptance criteria

Omit this section when `task.md` states none.

- {One criterion from the task, then the check that decides it: command, request, or observation. A criterion this pull request does not satisfy says what is missing.}

## Special things to note

- {Name up to three items a reviewer should not miss, such as migrations, constraints, tradeoffs, or unusual choices. Write "None." if nothing needs special attention.}

## Evidence

Publish the original recording for each required surface to a supported direct host (GitHub user-attachments or raw gist). The separate PR comment repeats the revision fields and every recording/capture pair exactly. Inspect each hosted object, not just its URL or MIME type: UI requires live video; non-UI requires the original invocation, tested SHA, successful exit/status/outcome, and observed output. Screenshots supplement UI video only.

- result: passed
- tested: {FULL_TESTED_CODE_SHA}
- current head: {FULL_PR_HEAD_SHA}
- recording: {ui-video|cli-terminal|api-probe|agent-session}
- capture: {DIRECT_HOSTED_CAPTURE_URL}
- comment: {DISTINCT_COMMENT_PERMALINK_ON_THIS_PR}

For mixed surfaces, replace the unlabeled recording/capture pair with one pair per required surface using matching, distinct lowercase-hyphenated labels (for example `- recording browser-ui: ui-video` and `- capture browser-ui: {DIRECT_VIDEO_URL}`). Each label must appear in both description and comment.

### Recorded tests

| Test | Result | Capture | Cue |
|---|---|---|---|
| {Substantive observable behavior} | passed | {primary for unlabeled pair, otherwise exact capture label} | {Video timestamp or captured output line} |

Add one substantive passed row for each capture label and a row for each other required test. State any failed or untested target and its reason/caveat honestly; a failed or required-untested target blocks `result: passed` and ready publication.

## Change outline

{Use the smallest set of structural views needed to explain the implementation. Omit unused view types.}

{Short lead-in for a data shape, API contract, or schema change.}

```diff
{Focused diff or complete target shape.}
```

{Short lead-in for changed code responsibilities.}

```text
{Shallow file tree or ownership sketch.}
```

{Short lead-in for runtime behavior.}

```diff
{Pseudocode, control flow, call tree, data flow, or component tree.}
```

{End with the one detail a reviewer needs before reading the diff.}

## Human Review

### Review targets

- {Pull request behavior, risk, and changed files the human should inspect.}

### Verify

- [ ] {Exact review or hosted-check confirmation required before the next review round.}

### Known limits

- {Known limit, or `None.`}

Closes #{ISSUE_NUMBER}
