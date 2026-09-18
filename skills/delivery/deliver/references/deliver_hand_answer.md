Routing is complete. Product work has not started.

Routed to `<pack>` (route confidence <confidence>, autonomy <level>): gates `<gates>`. Archon is not installed here, so each phase runs as a skill in its own session.

Task directory: [task.md](.agents/tasks/<slug>/task.md). <In a git work tree: "Committed as `docs(task): open <slug>` on branch `<branch>`; the task directory and each artifact are committed there, so run every phase from the same checkout and branch, where each `@<file>` handoff resolves." Not a git work tree: "This is not a git work tree, so `task.md` is written but not committed; run every phase from the same checkout, where the artifacts and each `@<file>` handoff live.">

Chain: <the pack's skills in order, `(gate)` after each one whose gate stays on>. Each phase ends with the next command; a phase marked `(gate)` is a reply you review before pasting it. <For `oneshot`: "The change is small enough to implement in this session: on your go it is implemented, verified, and committed per the `ci-commit` conventions, then reviewed with the command below." Otherwise omit.> <One sentence when judgments were skipped and the pack was picked by hand; otherwise omit.>

Next action:
Open a new session in {run_location}, then run:

```text
{next_command}
```
