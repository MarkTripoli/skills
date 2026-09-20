# Command line

- `safety-dance init` initializes or repairs the current repository gate.
- `safety-dance run` starts a durable run for the current branch.
- `safety-dance status` prints runtime status.
- `safety-dance respond <run-id> --step <step> --action <action>` records a prompt response through authenticated IPC.
- `safety-dance abort <run-id>` requests cancellation.
- `safety-dance logs` prints daemon logs.
- `safety-dance daemon start|stop|restart|status` manages the local daemon.

Mutation commands refuse to run when `SD_PARENT_RUN_ID` identifies a validation child. Plain output contains no terminal control sequences.
