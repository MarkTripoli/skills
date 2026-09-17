Routed to `<pack>` (route confidence <confidence>, autonomy <level>): gates `<gates>`. Archon is not installed here, so each phase runs as a skill in its own session.

Task directory: [task.md](.agents/tasks/<slug>/task.md), committed as `docs(task): open <slug>`.

Chain: <the pack's skills in order, `(gate)` after each one whose gate stays on>. Each phase ends with the next command; a phase marked `(gate)` is a reply you review before pasting it. <For `oneshot`: "The change is small enough to implement in this session: on your go it is implemented, verified, and committed per the `ci-commit` conventions, then reviewed with the command below." Otherwise omit.> <One sentence when judgments were skipped and the pack was picked by hand; otherwise omit.>

Start the next phase in a new session; continuing in this session carries this phase's context into the next one.

```text
{next_command}
```
