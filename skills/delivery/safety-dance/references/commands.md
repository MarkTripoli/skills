# Safety Dance commands

The `safety-dance` executable controls the local gate and daemon. Run commands from the repository they should affect and preserve their exit status.

## Discover and inspect

```sh
command -v safety-dance
safety-dance status
safety-dance logs
safety-dance daemon status
```

## Initialize and run

Run before any mutating command:

```sh
test -z "${SD_PARENT_RUN_ID:-}" || { echo "nested run: parent ${SD_PARENT_RUN_ID}; inspect only"; exit 1; }
```

```sh
safety-dance init
safety-dance daemon start
git push safety-dance HEAD
safety-dance status
```

`init` creates or repairs the local gate and managed hooks. The gate accepts updates only after daemon admission. Inspect the resulting status before taking another action.

## Respond and abort

```sh
safety-dance respond <run-id> --step <step> --step-id <prompt-id> --generation <generation> --action <action>
safety-dance abort <run-id>
safety-dance logs <run-id>
```

Respond only to a prompt shown by `status` or `logs`. Show the user the prompt text and its allowed actions, and send only the action the user names, unless the task brief authorizes an action for this prompt. Never invent `--step-id` or `--generation`; copy them from `status`. Abort the intended run by its durable identifier, then confirm its terminal status. Never edit the state database or gate refs directly.

## Daemon lifecycle

```sh
safety-dance daemon start
safety-dance daemon stop
safety-dance daemon restart
safety-dance daemon status
```

Service operations are scoped to the current `SD_HOME`. If the daemon is unavailable, preserve the error and inspect logs before retrying.
