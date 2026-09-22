---
slug: onboard-creates-the-slack
title: "onboard creates the Slack app and collects both tokens through a resumable checkpoint"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - slackapi-client-gains-the
  - config-yaml-loads-agent
issue: 47
---
Create package `tools/slack-coordinator/internal/onboard` and the cobra command `internal/cli/onboard.go` (`onboard [--no-service] [--existing]`; both flags are parsed; in this child the command runs steps 1 to 4 and then prints `Tokens saved to onboard.json; the remaining steps arrive in a later change.` and exits 0; `--existing` prints `not implemented yet` and exits 2).

The manifest comes from `internal/manifest.YAML()` (already embedded); do not copy the file. `checkpoint.go`: `Checkpoint{Step int; AppID, AppName, BotToken, AppToken, OwnerUserID, OwnerDisplayName string; ServiceInstalled bool}` with `LoadCheckpoint(path) (*Checkpoint, error)` (absent → zero value) and `Save(path)` writing 0600 via a temp file rename. `steps.go`: `Deps{Prompt func(label string) (string, error); PromptSecret func(label string) (string, error); OpenURL func(url string) error; Slack ManifestAPI (ManifestCreate(ctx, token, manifest) (slackapi.ManifestResult, error)); Out io.Writer}` and `Run(ctx, deps Deps, cp *Checkpoint, cpPath string, flags Flags) error`. Steps, each `func(ctx, *state) error` in a slice indexed from 1: 1 `configuration token` (`PromptSecret`, prefix `xoxe.xoxp-` or `xoxe-`; re-prompt on mismatch; held in memory only); 2 `create app` (`Prompt("App name")` default `Slack assistant`, `ManifestCreate`; record `AppID`, `AppName`; `invalid_auth` → the fixed rejected-token line); 3 `install app` (`OpenURL(InstallURL)`, print where the bot token appears, `PromptSecret("Bot token (xoxb-…)")`, prefix check with re-prompt); 4 `app-level token` (`OpenURL("https://api.slack.com/apps/<AppID>/general")`, print the `connections:write` scope to add, `PromptSecret("App-level token (xapp-…)")`, prefix check). `Run` loads the checkpoint, starts at `Step + 1`, saves after each step, and on error prints `<step name>: <cause>` and returns an error the CLI maps to exit 2 through `internal/cli/exit.go`. Step 1 runs only when a following step in this invocation needs the token.

Tests in `internal/onboard/onboard_test.go` with scripted `Deps` (queued prompt answers, recorded URLs, fake `ManifestAPI`): steps 1 to 4 record `step: 4` and the four values; a wrong `xoxb` prefix re-prompts once; `ManifestCreate` error → `create app:` message, `step: 1`, file lacks the token; `invalid_auth` → the fixed line; re-run from `step: 2` skips `ManifestCreate` and opens the install URL built from the stored `AppID`; the checkpoint file mode is 0600 and never contains the configuration token. `internal/cli/onboard_test.go` runs the command against a fake Slack server serving `apps.manifest.create`.

Proof: `go test ./internal/onboard ./internal/cli`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN `slack-coordinator onboard` runs with no `config.yaml` and no `onboard.json`, it shall prompt for the configuration token and app name, call `apps.manifest.create` with `manifest.YAML()`, open the returned install URL, prompt for the bot token, open `https://api.slack.com/apps/<app_id>/general`, prompt for the app-level token, and write `onboard.json` (0600) with `step: 4`, `app_id`, `app_name`, `bot_token`, `app_token`.
- IF a pasted bot token lacks the `xoxb-` prefix or an app-level token lacks `xapp-`, THEN `onboard` shall say so and re-prompt without advancing the step.
- IF `apps.manifest.create` fails, THEN `onboard` shall print `create app: <cause>` (or `configuration token rejected; create a new one at api.slack.com/apps` for `invalid_auth`), exit 2, and write `onboard.json` with `step: 1` and no token.
- WHEN `onboard` re-runs with `onboard.json` at `step: 2`, it shall prompt for the configuration token only if a later step needs it, skip the app creation, and resume at step 3 using the stored `app_id`.
- `onboard.json` shall never contain the configuration token string.
