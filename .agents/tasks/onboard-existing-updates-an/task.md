---
slug: onboard-existing-updates-an
title: "onboard --existing updates an installed app's manifest and re-verifies"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - onboard-finishes-only-when
issue: 62
---
In `tools/slack-coordinator/internal/onboard/`, implement `--existing`: `Run` with the flag loads `config.yaml` (must exist; else exit 2 naming `onboard` without the flag), prompts for the configuration token, takes `AppID` from `onboard.json` or a prompt (`A…` prefix check), calls `ManifestUpdate(token, appID, manifest.YAML())`, prints `Manifest updated. Reinstall the app at <install URL or https://api.slack.com/apps/<AppID>/install-on-team> to grant the new scopes, then paste the new bot token (Enter to keep the current one):`; a pasted `xoxb-` value replaces only `Slack.BotToken` through `config.Save` with the loaded struct (all other keys preserved); then step 7 (verify) as already implemented. Remove the `not implemented yet` stub from `internal/cli/onboard.go`. `invalid_auth` prints the rejected-token line and exits 2.

Tests: manifest update called with the embedded YAML and the app id; config round trip keeps `agent`, `retention`, `jira` keys and changes only `bot_token`; Enter keeps the token; `invalid_auth` → exit 2 with the fixed line; the verify step runs after.

Proof: `go test ./internal/onboard ./internal/cli`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN `onboard --existing` runs, it shall prompt for the configuration token, read `app_id` from `onboard.json` or prompt for it, call `apps.manifest.update` with the embedded manifest, and print that the app must be reinstalled to grant the new scopes.
- WHEN the user pastes a new bot token at the reinstall prompt, `onboard --existing` shall write only `slack.bot_token` and keep every other `config.yaml` key.
- WHEN the user presses Enter at the reinstall prompt, `onboard --existing` shall keep the existing bot token.
- WHEN the manifest update and reinstall prompt complete, `onboard --existing` shall run the verify step and exit per its outcome.
- IF `apps.manifest.update` returns `invalid_auth`, THEN `onboard --existing` shall print `configuration token rejected; create a new one at api.slack.com/apps` and exit 2.
