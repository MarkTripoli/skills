# Publication proof policy

The delivery recording is mandatory for every PR, including oneshot, bugfix, Atomic and epic-child deliveries. Record one authentic hosted capture per required behavior surface before ready publication. Derive surfaces from the task's acceptance criteria and actual behavior, not file extensions. UI requires playable live-session video; still images only supplement it. CLI, API/performance and agent work require the original command/request/tool invocation, tested full SHA, successful exit/status/outcome and observed output in the hosted transcript. A readable URL, MIME header, screenshot, HTML landing page or self-reported result does not establish proof.

## Storage and supported hosts

Keep recordings, raw output, reports, receipts, and description drafts in temporary scratch **outside** `.agent/tasks/` and `.agents/tasks/`; never upload task-root data. The final durable proof is the directly inspected hosted recording plus the full PR description and a distinct, verified comment on that same PR. The public gate supports direct GitHub user-attachments and raw gists, including original text attachments; other hosts need explicit support before a delivery can claim gate approval. The standalone recording path hosts the capture and reports its URL/results without inventing a PR or comment. When a tracker issue is supplied, link the already-hosted capture in an issue comment and read it back.

## Hosted Evidence contract

Use exact fields in the final `## Evidence` section:

- result: passed
- tested: <full tested code SHA>
- current head: <full PR head SHA>
- recording: <ui-video|cli-terminal|api-probe|agent-session>
- capture: <direct hosted URL>
- comment: <specific permalink on this PR>

For mixed surfaces, replace the single recording/capture pair with paired `- recording <label>: <type>` and `- capture <label>: <URL>` fields, one distinct lowercase-hyphenated label per capture. The separate comment repeats result, tested/head SHAs, and **every** recording/capture pair with identical values. A same-PR permalink is necessary; another PR's comment is not proof. Each declared capture must actually contain the appropriate recording.

The Evidence section has `### Recorded tests` and the columns `| Test | Result | Capture | Cue |`. At least one substantive `passed` row per capture label (`primary` for an unlabeled pair) gives an actual video timestamp or output-line cue; every required acceptance test must pass. Report failures and untested targets with reasons, but any failed or required-untested target blocks `result: passed` and ready status. Add caveats and tested environment/revision details to the body, not a local report link. The **complete** final PR template includes Purpose, optional task Acceptance criteria, Special things to note, Evidence, Change outline, and Human Review with Review targets, Verify, and Known limits. A provisional draft Evidence section is not a final description.

## Publication decision

1. A draft PR may be created only to host a missing attachment. Upload to the supported host, inspect the real content, and bind observations to the tested full SHA. Draft existence, an assertion, or a link alone cannot pass.
2. Any behavior-changing difference between tested code and publication head requires fresh recording and review. Metadata-only commits may advance HEAD only after checking the intervening diff; they never excuse a substantive source change. Optional verification remains conditional on task/policy requirements, but mandatory recording is never waived. A clean current review is still required where the workflow calls for it.
3. Publish a **separate** evidence comment on this PR, read it back by ID and obtain its exact permalink; then publish the complete final body with that permalink. Read back full body, exact revision/type/URL pairs, per-test observations, and same-PR comment. Failed publication stays draft.
4. Run the publication proof gate. Ready status requires the current passing recording(s), matching hosted records and full template, current clean review and required verification, and an applicable current-head check. If any target is failed or required-but-untested, missing, stale, unsupported, or unreadable, stay draft and report the blocker. Explicit bypass requests cannot be reported as passed.

On review feedback that changes behavior, repeat recording and refresh every affected hosted capture, comment and final description. Approval alone does not replace recorded evidence or the human review gate.
