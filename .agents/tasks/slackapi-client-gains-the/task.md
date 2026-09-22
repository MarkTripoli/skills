---
slug: slackapi-client-gains-the
title: "slackapi client gains the six assistant methods"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on: []
issue: 43
---
In `tools/slack-coordinator/internal/slackapi/client.go`, add methods beside `PostMessage` and `Permalink`, each one Slack Web API call:

- `UpdateMessage(ctx, channelID, ts, mrkdwn string) (string, error)` via `c.api.UpdateMessageContext` with `MsgOptionText(mrkdwn, false)` and `MsgOptionDisableLinkUnfurl()`.
- `AddReaction(ctx, channelID, ts, name string) error` via `c.api.AddReactionContext(name, slack.NewRefToMessage(channelID, ts))`.
- `OpenConversation(ctx, userID string) (string, error)` via `c.api.OpenConversationContext(&slack.OpenConversationParameters{Users: []string{userID}})`, returning `channel.ID`.
- `LookupUserByEmail(ctx, email string) (User, error)` via `GetUserByEmailContext`; `UserInfo(ctx, userID string) (User, error)` via `GetUserInfoContext`; `User` is a small struct `{ID, DisplayName, TZ string}` where `DisplayName` is `Profile.DisplayName` falling back to `RealName`.
- `ManifestCreate(ctx, configToken, manifest string) (ManifestResult, error)` and `ManifestUpdate(ctx, configToken, appID, manifest string) (ManifestResult, error)`. The slack-go SDK has no manifest helpers: post form-encoded `manifest=<yaml>` (and `app_id` for update) to `<api url>/apps.manifest.create|update` with `Authorization: Bearer <configToken>` using the client's HTTP client and API URL (respect `config.Slack.APIURL` so tests can fake it). `ManifestResult{AppID, InstallURL string}` from `app_id` and `oauth_authorize_url`; a response with `ok:false` returns an error carrying the Slack `error` string (tests need `invalid_auth` to surface verbatim).

Tests in `internal/slackapi/client_test.go` in the existing fake-server style (see the `chat.postMessage` form assertions there): one test per method asserting path, form fields, and bearer header for the manifest calls, plus the `ok:false` error path for `ManifestCreate`. Also create package `tools/slack-coordinator/internal/manifest` with `manifest.go`: `//go:embed slack-app-manifest.yaml` and `func YAML() string`; `git mv tools/slack-coordinator/slack-app-manifest.yaml tools/slack-coordinator/internal/manifest/slack-app-manifest.yaml` without changing its content, and update the path in `docs/slack-coordinator.md` Setup step 1 and anywhere else the repository names it (`grep -rn slack-app-manifest.yaml`). Scope changes belong to a sibling child.

Proof: `go test ./internal/slackapi ./internal/manifest` (a test asserts `YAML()` is non-empty and parses as YAML). Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN `UpdateMessage(ctx, channel, ts, text)` or `AddReaction(ctx, channel, ts, name)` is called, the client shall send `chat.update` with `channel`, `ts`, `text` or `reactions.add` with `channel`, `timestamp`, `name`.
- WHEN `OpenConversation(ctx, userID)` is called, the client shall send `conversations.open` with `users=<id>` and return the `D…` channel id.
- WHEN `LookupUserByEmail` or `UserInfo` is called, the client shall send `users.lookupByEmail` or `users.info` and return the user's id, display name, and `tz`.
- WHEN `ManifestCreate(ctx, configToken, manifestYAML)` or `ManifestUpdate(ctx, configToken, appID, manifestYAML)` is called, the client shall send `apps.manifest.create` or `apps.manifest.update` with `Authorization: Bearer <configToken>` and return `app_id` and the OAuth install URL, or an error carrying Slack's `error` string.
- `manifest.YAML()` in new package `internal/manifest` shall return the bytes of `slack-app-manifest.yaml`, which shall live at `internal/manifest/slack-app-manifest.yaml` and nowhere else in the module.
