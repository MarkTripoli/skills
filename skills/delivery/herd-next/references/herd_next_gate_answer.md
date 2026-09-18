Run `<run-id>` (`<workflow name>`) paused at `<nodeId>`. A notification was raised and a review pane is open.

Review pane `<pane id>`, labelled `<slug>/<phase> gate`, working directory `<the run's working_path>`, running `<kind>` as `<agent name>`. Staged, not submitted: the read of `<artifact path>`.

Decide from any pane once you have read it: `archon workflow respond <run-id> approve`, or `archon workflow respond <run-id> reject "<what should change>"`. <One line naming any decision beyond approve and reject that this gate declares; otherwise omit.> Rejecting reopens the gate after the iterate skill revises the artifact. This watch ended at this pause; a later gate in the same run needs `/herd-next --run <run-id>` again.
