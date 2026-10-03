---
name: safety-dance
description: Operates the local Safety Dance Git gate, inspecting durable runs and logs, starting the daemon, pushing through the gate, and answering or aborting runs without bypassing a parent run. Use when the user runs /safety-dance, mentions the safety-dance gate, daemon, or a validation prompt, or pushes through the safety-dance remote.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Safety Dance

Use this skill to operate a local Safety Dance Git gate without weakening its review boundary. The skill works independently from other delivery skills.

Mutating commands are `init`, `daemon start`, `daemon stop`, `daemon restart`, a push to the `safety-dance` remote, `respond`, and `abort`. Before any of them, apply the nested-run fence: when `SD_PARENT_RUN_ID` is set, run none of them and do not bypass the parent run. Inspect status or logs only, then report the parent run.

Confirm the executable first:

1. Run `command -v safety-dance`.
2. Missing: stop and tell the user it is missing and how to install it: a checksummed `safety-dance-v*` release archive verified against `checksums.txt`, or `go build ./cmd/safety-dance` from the Safety Dance source tree. Install only after the user says to, and never pipe a download into a shell.
3. Present: continue.

Read [references/commands.md](references/commands.md) for command flows and [references/safety.md](references/safety.md) for the gate invariants.
