---
name: safety-dance
description: Operate the local Safety Dance Git gate, inspect durable runs, and respond to validation prompts without bypassing parent-run controls.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Safety Dance

Use this skill to operate a local Safety Dance Git gate without weakening its review boundary. The skill works independently from Atomic and other delivery skills.

Before any mutating command, apply the nested-run fence: when `SD_PARENT_RUN_ID` is set, do not initialize a repository, start a run, respond to a prompt, abort a run, or bypass the parent run. Inspect status or logs only, then report the parent run.

Confirm that the `safety-dance` executable is available before operating it. If it is missing, diagnose the installation and point to the repository installer or `scripts/install.mjs`; do not download or install a binary implicitly.

Read [references/commands.md](references/commands.md) for command flows and [references/safety.md](references/safety.md) for the gate invariants.
