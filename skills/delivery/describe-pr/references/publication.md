# GitHub publication protocol

Prepare a provisional body in a temporary file outside the task directory. A pending comment is allowed only in a draft PR while hosting a missing capture; never call it final. When no task exists, open one under the resolved task root for metadata only. Create the draft PR with `gh pr create --draft --base <base> --body-file <temporary-path> --title "<title>"`, or update an existing draft with `gh pr edit <number> --body-file <temporary-path>`.

For every required surface, host the actual recording at a supported direct destination and inspect its content as in step 3. Post a **separate** PR comment repeating `- result: passed`, full tested and current-head SHAs and every recording/capture pair exactly. Use `gh pr comment <number> --body-file <temporary-path>` for already-hosted captures, or the authenticated PR comment box to upload and verify a user attachment first. Editing the PR body does not count as a comment. On updates, edit the previous evidence comment or post a replacement explicitly superseding it; obtain the exact permalink on this PR and read back that comment by ID.

Insert the verified comment permalink in the final body, publish the complete template with every capture and Recorded tests row, then re-fetch the whole body and separate comment. Compare revisions, types, URLs, per-test results/cues and required sections; verify every capture is still the original recording. Remove transient description drafts after successful readback. Retain sealed captures, samples and provenance attachments at their recorded external paths for resumable delivery; removing them invalidates local seals. Never upload or commit task-root data. If publication fails, leave the PR draft and report incomplete.


Before changing a draft to ready, run the collection's proof command from the repository root:

```bash
node shared/publication-proof.mjs <task-dir> <repo-root> <pr-number>
```

The command validates local review and optional verification metadata against hosted PR head/base, full body, specific same-PR comment, every declared capture's actual bytes/content and recorded tests. It does not read or require a local evidence or PR-description receipt. `stale` requires new review/capture after behavior changes; `incomplete` requires repairing missing hosted proof.

The Claude plugin offers an optional Bash `PreToolUse` guard when `SKILLS_PUBLICATION_TASK_DIR` names this task directory: direct `gh`/`./gh pr create --draft` can host capture but cannot pass final proof, and `gh pr ready [number]` requires the shared decision above. Direct shell calls outside Claude, unsupported tools/runtimes, and out-of-band GitHub publication are not guarded; perform this skill's proof and read-back steps regardless of hook registration. Unsupported targeted Bash PR syntax is denied in the selected task.

When a draft exists solely to host a capture that has not yet been uploaded, the provisional check is:

```bash
node shared/publication-proof.mjs <task-dir> <repo-root> <pr-number> --draft-host-capture
```

This may return `allowed: true` with `ready: false` and `status: "incomplete"` only for an existing draft PR. It does not authorize final body publication or ready status. After uploading and verifying the capture, complete the ordinary comment/body ordering above and run the final decision again.
Re-fetch the PR and confirm URL, title, number, base, head, complete hosted template, every recording/capture pair, Recorded tests rows, and same-PR comment. Retitle an existing PR that fails the title rule with `gh pr edit <number> --title "<title>"`. Mark a draft PR ready only after the proof command passes. If upload, comment, link verification, capture inspection, or final-body readback fails, publication is incomplete.

When task.md carries slack_run_id and you own the run, send `run event` with the observed PR URL and next current-head checks; do not finish a run whose requested follow-up remains. Direct feature-thread visibility updates only its existing root per agent-slack-control-plane. Slack failures are reported without changing publication outcome unless Slack was requested as a gate.

