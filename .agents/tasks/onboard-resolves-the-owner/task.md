---
slug: onboard-resolves-the-owner
title: "onboard resolves the owner, writes config.yaml, and starts the daemon"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - onboard-creates-the-slack
issue: 52
---
In `tools/slack-coordinator/internal/onboard/steps.go`, add steps 5 and 6 and make the command run through step 6 (then print `Setup written; verification arrives in a later change.` and exit 0; a sibling adds verification). `Deps` gains `LookupUserByEmail(ctx, bot token, email) (slackapi.User, error)`, `UserInfo(ctx, bot token, id)`, `AuthTest`, `ProbeSocketMode` (the fakes take the token so tests can assert it), `SaveConfig func(*config.Config) error`, `LoadConfig func() (*config.Config, error)` (nil when absent), `InstallService func() error` (wraps the existing `daemon.Install` path used by `service install`), `StartDaemon func() error` (wraps the existing detached re-exec in `internal/cli/daemon.go`). Step 5 `owner`: `Prompt("Owner email or Slack user id")`; contains `@` → `LookupUserByEmail`, else must match `^[UW][A-Z0-9]+$` → `UserInfo`; `users_not_found` or a non-matching id → `No such user in this workspace.` and re-prompt; print `Owner: <DisplayName> (<ID>). Correct? [Y/n]`; `n` re-prompts; record `OwnerUserID`, `OwnerDisplayName`, `Step 5`. Step 6 `write config and start`: build a `slackapi.Client` from the pasted tokens, `AuthTest` then `ProbeSocketMode`; load the existing config when present and overwrite only the three `slack` keys, keep `agent`, `retention`, `jira`; `config.Save` (0600); `--no-service` → `StartDaemon` and print `The daemon runs until you log out or reboot; run slack-coordinator service install to keep it running.`; else `InstallService` and set `ServiceInstalled`; `Step 6`. Wire the real dependencies in `internal/cli/onboard.go`.

Tests in `internal/onboard/onboard_test.go`: email path and id path resolve and record; `users_not_found` re-prompts; `n` re-prompts; step 6 writes 0600 config with the three keys and preserves a pre-existing `agent:` block; `--no-service` calls `StartDaemon` not `InstallService`; `AuthTest` failure prints `write config and start: <cause>` and leaves `step: 5`. `internal/cli/onboard_test.go`: run `setup` and `onboard` (scripted stdin, fake Slack for `auth.test`, `apps.connections.open`, `users.info`) into two roots and compare the two `config.yaml` bytes.

Proof: `go test ./internal/onboard ./internal/cli ./internal/config`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN `onboard` resumes past step 4, it shall prompt for the owner's email or `U…`/`W…` id, resolve it through `users.lookupByEmail` or `users.info`, print `Owner: <display name> (<id>). Correct? [Y/n]`, and on `Y` record `owner_user_id` and `owner_display_name` at `step: 5`.
- IF the email or id resolves to no user, or the user answers `n`, THEN `onboard` shall re-prompt without writing config.
- WHEN step 6 runs, `onboard` shall call `auth.test` and `apps.connections.open` with the pasted tokens, write `config.yaml` at 0600 with `slack.bot_token`, `slack.app_token`, `slack.owner_user_id` while preserving any existing `agent`, `retention`, and `jira` keys, and install and start the user service.
- WHERE `--no-service` is passed, step 6 shall start the daemon through the existing detached `daemon start` path instead of installing a service and shall say the daemon runs until logout or reboot.
- WHEN `setup` and `onboard` both write config for the same tokens and owner, the two `config.yaml` files shall be identical.
