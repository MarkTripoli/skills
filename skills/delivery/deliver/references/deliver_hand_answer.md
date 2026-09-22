Routing is complete. Product work has not started.

Routed to `<workflow>` (route confidence <confidence>, autonomy <level>): gates `<gates>`. Manual delivery: each phase runs as an independent skill in its own session.

Worktree: `<worktree path>` on branch `<branch>`. Every session of this task runs from there, so the commits land on the branch and your checkout is untouched. <One sentence when the worktree was skipped: which case of the conventions applied.>

Task directory: [task.md](<task-root>/<slug>/task.md) in that worktree. <Replace task-root with the resolved path. State the observed task commit, or that the file is uncommitted outside git. Reused tasks keep their existing artifacts.>

Chain: <the workflow's skills in order, `(gate)` after each one whose gate stays on>. Each phase ends with the next command; a phase marked `(gate)` is a reply you review before pasting it. <For `oneshot`: "The change is small enough to implement in this session: on your go it is implemented, verified, and committed per the `ci-commit` conventions, then reviewed with the command below." Otherwise omit.> <One sentence when judgments were skipped and the workflow was picked by hand; otherwise omit.>

Next action:
Open a new session in {run_location}, then run:

```text
{next_command}
```
