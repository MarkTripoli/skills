# Safety Dance

Safety Dance is a local Git gate and durable validation daemon. It is distributed as the `safety-dance` binary and installed separately from agent skills.

## Trust model

Safety Dance is a local developer tool for repositories and commands trusted by the operating-system user running the daemon. The daemon, Git hooks, operator commands, validation commands, and coding agents run under that same user account. Process checks, local capabilities, and `SD_PARENT_RUN_ID` prevent accidental recursion and ordinary cross-run interference; they are not a security boundary against malicious code already running as that user.

Do not use Safety Dance to execute untrusted repository code or untrusted validation commands. Environments that require hostile-code isolation must run validation under a separate OS principal or sandbox and place gate admission behind a separately privileged broker.

## Install and configure

Build from source with `cd tools/safety-dance && go build ./cmd/safety-dance`. Releases provide checksummed archives for Linux and macOS. Verify an archive against `checksums.txt` before installation. Set `SD_HOME` to select the runtime home (default `~/.safety-dance`) and configure repository policy in `.safety-dance.yaml`.

Run `safety-dance init` in a repository to create its local gate, then push to the generated `safety-dance` remote. The daemon authenticates hooks locally and stores accepted runs durably. The root repository installer owns `/safety-dance` skill files; installing the binary never downloads skills.

## Releases and recovery

Product releases use `safety-dance-v<MAJOR>.<MINOR>.<PATCH>` tags and are independent of Changesets. The workflow builds native archives and one SHA-256 manifest. A failed run can be inspected with `safety-dance status` and `safety-dance logs`; use `respond` or `abort` as appropriate. Never delete `SD_HOME` while a run is active.
