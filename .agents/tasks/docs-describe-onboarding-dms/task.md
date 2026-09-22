---
slug: docs-describe-onboarding-dms
title: "docs describe onboarding, DMs, and standing tasks, and the changeset records the release"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - no-drops-a-pending
  - answers-over-4000-characters
  - running-rows-from-a
  - the-hourly-run-cap
  - each-message-tasks-run
  - three-consecutive-task-failures
  - the-purge-removes-run
  - onboard-existing-updates-an
issue: 72
---
Update the operator and agent documentation for the slack-coordinator assistant.

`docs/slack-coordinator.md`: add `## Onboarding` (steps 1 to 8 as the terminal prints them, the two browser steps, `--no-service`, `--existing` for existing installs, repair mode, `onboard.json` resume, where the configuration token comes from and that it is never stored); `## Assistant DMs` (the eight `!` verbs with one line each, request threads: eyes reaction, `Working on it`/`Queued behind <n>`, answer edit or `Done` plus replies, `Failed` with stderr tail, follow-ups, non-owner refusal); `## Standing tasks` (proposal handshake with the confirm sentence and the confirm/cancel words, triggers `schedule`/`window end`/`each message`, 5-minute default debounce, 10-minute floor, `agent.max_runs_per_hour`, delivery header `t<id> · #chan · N new items`, three-failure pause, `!resume`); `## Configuration` with the `agent:` (`command`, `approval` edits|full and what each permits per binary, `timeout`, `max_runs_per_hour`, `extra_dirs`) and `retention:` (`days`, `consumed_days`) keys and the purge bounds table; a `## Trust boundary` paragraph: the agent runs in `<root>/workspace/runs/<id>` with a scrubbed environment, never holds a Slack token, and `edits` is the default. Link the embedded skill text at `tools/slack-coordinator/internal/assistant/skill/ASSISTANT.md` and the manifest at `tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml`. Keep the existing run-thread sections; ensure no `run start --owner` remains anywhere in `docs/` or `skills/delivery/slack-coordinator/`.

`skills/delivery/slack-coordinator/SKILL.md`: in the binary-prerequisite paragraph add one sentence that operators set up the daemon with `slack-coordinator onboard` (or `setup` non-interactively); do not touch line 6 or the frontmatter. `README.md` `## Slack coordinator`: one sentence naming DMs and standing tasks. Add `.changeset/slack-assistant-bot-dms.md` with `"@marktripoli/skills": minor` and a body naming owner DMs, standing tasks, and `onboard`.

Proof: `node scripts/validate.mjs` passes; `grep -rn 'run start --owner' docs skills/delivery/slack-coordinator` returns nothing; the changeset file exists. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- `docs/slack-coordinator.md` shall contain sections headed `Onboarding`, `Assistant DMs`, `Standing tasks`, `Configuration`, and `Trust boundary` covering `onboard`, `--no-service`, `--existing`, repair mode, the eight verbs, the request thread flow, triggers, debounce, floor, cap, retention bounds, and the `agent`/`retention` keys.
- WHEN `grep -rn 'run start --owner' docs skills/delivery/slack-coordinator README.md` runs, it shall print nothing.
- WHEN `node scripts/validate.mjs` runs, it shall exit 0 with `EXPECTED_SKILL_COUNT` unchanged and `skills/delivery/slack-coordinator/SKILL.md` line 6 byte-identical.
- A `.changeset/slack-assistant-bot-dms.md` file shall exist with `"@marktripoli/skills": minor` and a body naming owner DMs, standing tasks, and `onboard`.
