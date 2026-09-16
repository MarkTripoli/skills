Artifact saved: {artifact_link}

Report: {report_link}

Summary:
{summary}

Check:
- <one line per test: result, test name, video timestamp>

Caveats:
- <one line per item in the report's Caveats section, or "None.">

Posted to: <PR comment link, tracker issue, or "requester only">

At least one test failed on video, so the implementation changes before a pull request is described. The failed tests above are the feedback for the next phase; the recording is the "before" half of the fix's evidence.

Start the next phase in a new session, or hand the task to `/run-task`; continuing in this session carries this phase's context into the next one.

```text
/iterate-implementation @{plan_file}
```
