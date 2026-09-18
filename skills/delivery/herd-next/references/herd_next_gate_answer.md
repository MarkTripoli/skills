Run `<run-id>` (`<workflow name>`) <paused at `<nodeId>`, followed by "A notification was raised and a review pane is open."; or `is running; no gate is waiting yet`, followed by "A review pane is open." with no notification sentence>.

Review pane `<pane id>`, labelled `<slug>/<phase> gate`, working directory `<the run's working_path>`, running `<kind>` as `<agent name>`. Submitted there: <`/deliver --run <run-id>`, or `$deliver --run <run-id>` for a codex pane>, which reads the gated artifact and asks for your decision.

Answer in that pane. Say `approve`, or say what should change. Rejecting reopens the gate after the iterate skill revises the artifact. The agent in that pane stays with the run, so every later pause is announced there too.
