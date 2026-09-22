---
"@marktripoli/skills": minor
---

slack-coordinator runs queued owner DM requests through the configured agent, three at a time: the dispatcher writes `prompt.md` (with the embedded assistant skill text) and an empty `messages.jsonl` into the run directory, edits a `Queued behind` ack to `Working on it` when the run starts, and on a clean exit replaces the ack with the agent's answer (or posts a long answer under a `Done` ack); a non-zero exit, timeout, or empty result marks the run `failed` and leaves the ack alone.
