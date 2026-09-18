<When the run was started: "Run `<run-id>` of `delivery-<pack>` is running on branch `<branch>`; it pauses first at `<first gate>`." With no gates: "Run `<run-id>` of `delivery-<pack>` is running unattended on branch `<branch>`." When the request asked for the command only: "Routing is complete. Nothing has started." When the start failed: "The start failed: <first error line>.">

Routed to `delivery-<pack>` (route confidence <confidence>, autonomy <level>): gates `<gates>`.

<When the run was started: "Archon created the task directory in a worktree of the branch and drives every phase from this command:" Otherwise: "Run from the project root; Archon creates the task directory, works in a worktree of the branch, and drives every phase:">

`archon workflow run delivery-<pack> --branch <branch> --input gates=<gates> '<request>'`

Pauses:
- <one line per gate left on: its name and what it reviews; or `none: the run is unattended`>

`archon workflow wait <run-id>` blocks until the next pause or the end. At a pause, `archon workflow approve <run-id>` continues and `archon workflow reject <run-id> "<what should change>"` revises the artifact it paused on. <One sentence when judgments were skipped and the pack was picked by hand; otherwise omit.>

<When the run was started: "The run owns the chain; nothing follows this reply." Otherwise: "Run the command above to start the workflow.">
