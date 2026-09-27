---
slug: offer-claude-review-guard
title: "Offer Claude review guard before PR creation"
workflow: oneshot
created: 2026-09-27
parent: i-want-you-gpt
base: epic-i-want-you-gpt
depends_on:
  - reject-stale-proof-at
  - identify-installed-blocking-hook
issue: 125
---
In public skills, implement the optional Claude Code PreToolUse adapter only for the supported command/event shape verified in Identify installed blocking hook capabilities. Delegate all policy to the merged proof decision; support its draft-hosting state, current/stale/invalid payload handling and audited non-passing override. Install in the actual plugin/runtime registration location and verify an intercepted throwaway attempt; preserve skill-level enforcement for unsupported and out-of-band actions.

## Acceptance criteria
- WHEN an installed Claude event hook sees a stale-proof ready PR attempt, it shall block the attempt with the shared decision reason.
- WHEN an attempt only creates a draft to host capture, the hook shall allow that draft without declaring final proof passed.
