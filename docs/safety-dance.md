# Safety Dance

Safety Dance is a local Git gate and durable validation daemon. It is distributed as the `safety-dance` binary and installed separately from agent skills.

## Trust model

Safety Dance is a local developer tool for repositories and commands trusted by the operating-system user running the daemon. The daemon, Git hooks, operator commands, validation commands, and coding agents run under that same user account. Process checks, local capabilities, and `SD_PARENT_RUN_ID` prevent accidental recursion and ordinary cross-run interference; they are not a security boundary against malicious code already running as that user.

Do not use Safety Dance to execute untrusted repository code or untrusted validation commands. Environments that require hostile-code isolation must run validation under a separate OS principal or sandbox and place gate admission behind a separately privileged broker.

## How it works

1. `safety-dance init` creates a local gate remote and managed Git hook for the repository.
2. `git push safety-dance HEAD` sends the proposed ref through the hook. The hook authenticates to the local daemon and requests admission before repository mutation.
3. The daemon records an accepted ref and creates a durable, branch-scoped run. A newer accepted push on the same branch supersedes the older active run.
4. Safety Dance works in an owned worktree and runs the configured intent, review, validation, test, pull-request, and continuous-integration steps. Step results and operator prompts are persisted so an interrupted daemon can recover without repeating completed work.
5. Publication rechecks the reviewed candidate, live upstream head, cancellation state, and force-with-lease boundary. A changed upstream is rejected instead of overwritten.
6. After the upstream write, Safety Dance updates its gate mirror and durable publication record. If interruption happens between those operations, restart recovery reconciles the remote state before continuing.

Operators inspect durable state with `status` and `logs`, answer explicit prompts with `respond`, and stop a run with `abort`. Nested agent runs may inspect state but cannot mutate it when `SD_PARENT_RUN_ID` is set.

## Install and configure

Build from source with `cd tools/safety-dance && go build ./cmd/safety-dance`. Releases provide checksummed archives for Linux and macOS. Verify an archive against `checksums.txt` before installation. Set `SD_HOME` to select the runtime home (default `~/.safety-dance`) and configure repository policy in `.safety-dance.yaml`.

Run `safety-dance init` in a repository to create its local gate, then push to the generated `safety-dance` remote. The daemon authenticates hooks locally and stores accepted runs durably. The root repository installer owns `/safety-dance` skill files; installing the binary never downloads skills.

## Releases and recovery

Product releases use `safety-dance-v<MAJOR>.<MINOR>.<PATCH>` tags and are independent of Changesets. The workflow builds native archives and one SHA-256 manifest. A failed run can be inspected with `safety-dance status` and `safety-dance logs`; use `respond` or `abort` as appropriate. Never delete `SD_HOME` while a run is active.

## Documentation map

- [Getting started](../tools/safety-dance/docs/getting-started.md): first build, initialization, daemon start, and push.
- [CLI reference](../tools/safety-dance/docs/cli.md): available operator commands.
- [Configuration](../tools/safety-dance/docs/configuration.md): repository policy and precedence.
- [Daemon operations](../tools/safety-dance/docs/daemon.md): service lifecycle and runtime home.
- [Recovery](../tools/safety-dance/docs/recovery.md): restart and interrupted-run behavior.
- [Agent command flow](../skills/delivery/safety-dance/references/commands.md): safe command sequences for coding agents.
- [Safety invariants](../skills/delivery/safety-dance/references/safety.md): trust assumptions and publication boundaries.
