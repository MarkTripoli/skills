# Recovery

Run records and step results are durable before execution. On restart, the daemon classifies pending and running records, preserves worktrees referenced by recoverable runs, and does not infer publication from a mutable upstream ref.

A publication is complete only after the upstream ref equals the candidate, the gate mirror is reconciled, and the publication binding is stored. A matching upstream ref without that binding is reconciled rather than assumed complete.
