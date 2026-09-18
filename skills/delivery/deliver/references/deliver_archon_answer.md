Routing is complete. The workflow is running.

Routed to `delivery-<pack>` (route confidence <confidence>, autonomy <level>): gates `<gates>`.

Started from the project root:

`archon workflow run delivery-<pack> --branch <branch> --input gates=<gates> '<request>'`

Run `<run-id>` on branch `<branch>`, worktree `<path Archon printed>`: <`paused at <gate>`, followed by what that gate reviews, the gated artifact's path and its frontmatter `summary`, its `### Verify` list, and its `### Known limits` list; or `completed`, followed by the pull request or end state Archon printed; or `failed at <node>`, followed by Archon's reason>.

Pauses still ahead:
- <one line per gate left on after the current one: its name and what it reviews; or `none: the run continues to the end without a pause`>

<Outside Herdr, the ask, byte-exact: "Say `approve`, or say what should change." Inside Herdr, the pane pointer instead: "Review pane `<pane id>`, labelled `<slug>/<phase> gate`, working directory `<the run's working_path>`, is asking there; answer in that pane." Never both.> <One sentence when judgments were skipped and the pack was picked by hand; otherwise omit.>
