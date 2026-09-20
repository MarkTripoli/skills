# Safety Dance invariants

- Treat `SD_PARENT_RUN_ID` as a hard nested-run fence. A child validation process must not initialize, start, respond to, abort, or bypass its parent run.
- Admission is authenticated by the local daemon and bound to the gate, ref, launch token, and parent-run policy. Do not bypass hooks or call private IPC endpoints.
- Accepted refs become durable branch-scoped runs before validation starts. A newer update supersedes only the same repository and full branch ref; different branches may run concurrently.
- Validation runs in its own disposable worktree. Do not modify the user's working tree to repair or force a run.
- Publication requires reviewed-head continuity, a live upstream-head check, an explicit lease for approved rewrites, post-push ref verification, gate-mirror reconciliation, and durable publication binding in that order.
- A failed notification after Git accepts a ref is not a rollback. Inspect logs and durable status instead of retrying an accepted ref blindly.
- Keep binary installation separate from skill installation. The skill may point to `scripts/install.mjs`, but never installs a binary implicitly.
