Routing is complete. The workflow is running.

Routed to `delivery-<pack>` (route confidence <confidence>, autonomy <level>): gates `<gates>`.

Started from the project root:

`archon workflow run delivery-<pack> --branch <branch> --input gates=<gates> '<request>'`

Run `<run-id>` on branch `<branch>`, worktree `<path Archon printed>`: <`paused at <gate>`, followed by what that gate reviews and the artifact it points at; or `completed`, followed by the pull request or end state Archon printed; or `failed at <node>`, followed by Archon's reason>.

Pauses still ahead:
- <one line per gate left on after the current one: its name and what it reviews; or `none: the run continues to the end without a pause`>

`archon workflow approve <run-id>` continues, `archon workflow reject <run-id> "<what should change>"` revises the artifact it paused on, `archon workflow wait <run-id>` blocks until the next pause or the end. <One sentence when judgments were skipped and the pack was picked by hand; otherwise omit.>
