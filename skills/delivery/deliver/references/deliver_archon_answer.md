Routing is complete. The workflow is running.

Routed to `delivery-<pack>` (route confidence <confidence>, autonomy <level>): gates `<gates>`.

Started from the project root:

`archon workflow run delivery-<pack> --branch <branch> --input gates=<gates> '<request>'`

Run `<run-id>` on branch `<branch>`, worktree `<the run's working_path>`: <`paused at <gate>`, followed by what that gate reviews, the gated artifact's path and its frontmatter `summary`, its `### Verify` list, and its `### Known limits` list; or `is running`, followed by the gate it will pause at first; or `completed`, followed by the pull request or end state Archon printed; or `failed at <node>`, followed by Archon's reason>.

Pauses still ahead:
- <one line per gate left on after the current one: its name and what it reviews; when the run is still `is running` and has not paused yet, every gate it keeps, since there is no current one to exclude; or `none: the run continues to the end without a pause`>

<When no review pane was opened for this run (outside Herdr, or inside Herdr when the gate mode opened none), the ask, byte-exact: "Say `approve`, or say what should change." When a pane was opened, the pane pointer instead: "Review pane `<pane id>`, labelled `<slug>/<phase> gate`, working directory `<the run's working_path>`, is asking there; answer in that pane." Never both.> <One sentence when judgments were skipped and the pack was picked by hand; otherwise omit.>
