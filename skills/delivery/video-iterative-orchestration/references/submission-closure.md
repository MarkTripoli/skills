# Submission closure gate

Run this gate immediately before the orchestrator assigns `submitted`. It validates a receipt assembled from the orchestrator's own remote probes, not from worker claims alone.

Write the receipt under the ignored orchestration evidence directory, then run:

```bash
node <video-iterative-orchestration-skill-dir>/scripts/validate-submission-closure.mjs <receipt.json>
```

The receipt shape is:

```json
{
  "ticket": "APP-1234",
  "local_commit": "0123456789abcdef0123456789abcdef01234567",
  "intended_target": "main",
  "required_evidence": ["android_video"],
  "remote": {
    "branch": "feature/app-1234-example",
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "verified": true
  },
  "pull_request": {
    "url": "https://github.com/example/project/pull/123",
    "head_commit": "0123456789abcdef0123456789abcdef01234567",
    "source_branch": "feature/app-1234-example",
    "target_branch": "main",
    "verified": true
  },
  "evidence": {
    "pr_description_verified": true,
    "items": [
      {
        "kind": "android_video",
        "location": "https://github.com/user-attachments/assets/01234567-89ab-cdef-0123-456789abcdef",
        "playability_verified": true,
        "content_sha256": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "authenticated_download_verified": true,
        "expected_bytes": 12345
      }
    ]
  },
  "slack": {
    "requested": true,
    "run_id": "01RUN",
    "thread_permalink": "https://workspace.slack.com/archives/C123/p123",
    "submission_event_acknowledged": true
  },
  "actions": {
    "push": {
      "status": "succeeded",
      "approval": "managed_approval_granted",
      "verification": "remote branch resolves to local_commit"
    },
    "pull_request": {
      "status": "succeeded",
      "approval": "not_required",
      "verification": "GitHub API returned the intended source and target"
    },
    "evidence": {
      "status": "succeeded",
      "approval": "not_required",
      "verification": "PR description and authenticated download verified"
    },
    "slack": {
      "status": "succeeded",
      "approval": "not_required",
      "verification": "coordinator acknowledged the submitted event"
    }
  }
}
```

Use `approval: "not_required"` when the runner executed the action directly and `approval: "managed_approval_granted"` when its managed approval completed. No conversational-approval or pending state is valid. If Slack coordination was not requested, set `slack.requested` to `false` and omit `actions.slack`.

An API-only ticket may use an `api_contract` evidence item with a non-empty `summary` or durable `location`; it does not invent a video upload. An assigned video item (`android_video`, `chrome_video`, or `ios_video`) requires a durable HTTPS hosted URL without credentials or signed query parameters, verified download, positive expected byte count, SHA-256 matching the downloaded capture, and verified playability. `required_evidence` comes from the assignment, not the worker; every listed kind must be present. The independently probed PR head must equal the full local and remote commit, and its target must equal `intended_target`. Every evidence item must already appear in the verified PR description.

Exit `0` accepts the receipt. Exit `1` returns it to recovery with machine-readable issues. Exit `2` means the command was used incorrectly. Never assign `submitted` while the receipt is invalid.

For a cross-layer ticket with several PRs, independently probe and validate one JSON receipt per participating repository/PR. The indexed ticket-level closure record names the complete assignment-owned repository/PR set and every validated receipt path/SHA-256. A missing repository, invalid receipt, moved head, or stale proof prevents `submitted` for the ticket; validating only its frontend or backend is insufficient. On resume, re-probe every named PR rather than accepting the last receipt alone.

After validation, exclusively create a versioned JSON snapshot and record a `submission-closure` receipt in `delivery.closure` under the resolved task directory. Bind the snapshot path/SHA-256, ticket, observed source head, and validation result. Every revision creates the next immutable iteration. Validate the index and referenced snapshot digest on resume; the operational cache never overrides this receipt.
