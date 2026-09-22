---
slug: slack-assistant-bot-dms
title: "Slack assistant bot with DMs, standing tasks, and onboarding"
workflow: program
gates: none
routed_by: deliver
created: 2026-09-22
base: main
---
I want to ensure that these bots:
1. Are owned by a single user and are the ones that can directly steer them
2. Can handle DMs
3. Can work as a personal assistant to a user along with working with coding agents and other things
4. Handle structured messages but can also be tasked to handle impromptu type tasks (ex. listen to all feedback on thjis channel and DM me a daily digest. Or, listen to all feedbackl during this bug bash and triage them as issues)
5. We need a way to onboard this skill. Meaning, we need to help users create a new bot (maybe even automate it), walk them through it, set their secrets/env vars/etc

## Decisions recorded when the task was opened

Builds on the merged `slack-coordinator` daemon and skill (pull request #39, `tools/slack-coordinator/`, `skills/delivery/slack-coordinator/`, `docs/slack-coordinator.md`). The user chose these in the session that opened this task:

- Route: land #39 as the substrate, deliver this scope as a program of epic children on top of it.
- Brain: the daemon spawns a headless coding agent (`omp`, `claude -p`, `codex exec`, or similar) per DM or scheduled standing task, passing the skill and the collected messages as input; the daemon does not embed an LLM client, and no long-lived agent session is required for the bot to act.
- Onboarding: `slack-coordinator onboard` takes a Slack app configuration token, creates the app through `apps.manifest.create`, opens the install URL, prompts for the bot and app-level tokens, writes config, installs the service, and verifies with `auth.test` and a test DM. The install click and the app-level token stay browser steps.

Gaps observed in the merged code at opening time: the manifest declares only `message.channels` and `message.groups` with no `im:*` scopes; `internal/coordinator/inbound.go` keeps only thread replies from the owner inside an active run thread, so DMs are dropped; `run start --owner` allows a per-run owner override; the daemon has no scheduler for standing tasks and no executor.
