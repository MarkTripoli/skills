Routing is complete. Product work has not started.

Routed to `delivery-<pack>` (route confidence <confidence>, autonomy <level>): gates `<gates>`.

Archon creates the task directory, works in a worktree of the branch, and drives every phase.

Start the workflow from the project root:

`archon workflow run delivery-<pack> --branch <branch> --input gates=<gates> '<request>'`

Pauses:
- <one line per gate left on: its name and what it reviews; or `none: the run is unattended`>

The command prints "Workflow paused" and the run id at each pause; `archon workflow approve <run-id>` continues, `archon workflow reject <run-id> "<what should change>"` revises the artifact it paused on, `archon workflow wait <run-id>` blocks until the next pause or the end. <One sentence when judgments were skipped and the pack was picked by hand; otherwise omit.>

Run the command above to start the workflow.
