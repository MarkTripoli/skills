<Observed launch result: the delivery workflow is running, an existing run is connected, or launch is pending in Atomic.>

Workflow `delivery`, chain `<workflow>`, gates `<gates>`. <Route confidence when known; otherwise say judgments were skipped.>

<When launched or connected: run `<run-id>`, its observed status, task directory, branch and worktree when reported. When not launched: the missing prerequisite or exact native `/workflow delivery request="..." workflow=... gates=...` command to enter in Atomic. Never invent a run id or claim launch from a proposed command.>

<When awaiting input: the artifact link, its summary, its `### Verify` items and its `### Known limits` items. Otherwise omit.>

<For a run: enter `/workflow connect <run-id>` in Atomic to inspect it and answer pending prompts. For a pending launch: enter the native launch command in Atomic. These are Atomic commands, not shell commands or skill handoffs.>
