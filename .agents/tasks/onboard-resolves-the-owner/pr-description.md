Ticket: [#52](https://github.com/MarkTripoli/skills/issues/52) | Task: `onboard-resolves-the-owner` | Walkthrough: none

## Purpose

`slack-coordinator onboard` stopped after collecting tokens; this change adds steps 5 (resolve and confirm the owner) and 6 (check both tokens, write `config.yaml`, start the daemon) so a fresh run ends with a running daemon.

## Acceptance criteria

- Owner prompt, resolution, confirmation, and `step: 5` record: `TestFreshRunCompletesSixStepsAndInstallsTheService` (email through `users.lookupByEmail`) and `TestOwnerByIDUsesUsersInfoWithTheBotToken` (id through `users.info`) in `internal/onboard/onboard_test.go` assert the `Owner: <name> (<id>). Correct? [Y/n]` prompt, the bot token on the call, and `owner_user_id` and `owner_display_name` in `onboard.json`.
- Unknown user or `n` re-prompts without writing config: `TestUnknownOwnerRepromptsWithoutWritingConfig` feeds `users_not_found`, a malformed id (never sent to Slack), and `user_not_found`; `TestDecliningTheOwnerReprompts` answers `n`; both check `config.yaml` is absent until the accepted owner.
- Step 6 calls `auth.test` and `apps.connections.open` with the pasted tokens, writes 0600 `config.yaml` with the three `slack` keys, keeps `agent`, `retention`, `jira`, and installs the service: `TestFreshRunCompletesSixStepsAndInstallsTheService` (tokens on each call, mode, one `InstallService`) and `TestWriteConfigKeepsAnExistingAgentBlock` (pre-existing `agent:` and `retention:` survive).
- `--no-service` starts the daemon detached and says it runs until logout: `TestNoServiceStartsTheDaemonInstead` asserts one `StartDaemon`, zero `InstallService`, and the sentence.
- `setup` and `onboard` write identical `config.yaml` for the same tokens and owner: `TestOnboardWritesTheConfigSetupWritesAndInstallsTheService` in `internal/cli/onboard_test.go` runs both commands against one fake Slack into two roots and compares the file bytes.

Proof: `go test -count=1 ./internal/onboard ./internal/cli ./internal/config` in `tools/slack-coordinator` passes (`ok` on all three packages).

## Special things to note

- `config.Load` is split: new `config.Read` parses without defaults or validation and returns `nil, nil` for an absent file, so step 6 can rewrite only the `slack` keys of a partial file. `Load` keeps its previous behavior on top of `Read`.
- Step 6 rewrites the whole file from the parsed struct with defaults applied (the `setup` behavior, required for byte equality): a hand-written `config.yaml` gains explicit `retention` and `agent` defaults and loses comments and key order.
- Slack not-found codes are recognized by error-string suffix (`users_not_found`, `user_not_found`) because `internal/slackapi` returns slack-go's bare-code error; a typed error is assigned to the `--existing` child. With the service path, an unsupported platform is discovered inside `InstallService`, after `config.yaml` is written, leaving `step: 5`.

## Change outline

`Deps` grows one function per outside effect; each Slack call takes the token it authorizes with so fakes assert it:

```diff
 type Deps struct {
   Prompt, PromptSecret, OpenURL, Slack, Out
+  LookupUserByEmail(ctx, botToken, email) (slackapi.User, error)
+  UserInfo(ctx, botToken, id)             (slackapi.User, error)
+  AuthTest(ctx, botToken)                 error
+  ProbeSocketMode(ctx, appToken)          error
+  LoadConfig()                            (*config.Config, error)  // nil when absent
+  SaveConfig(*config.Config)              error
+  InstallService()                        error
+  StartDaemon()                           error
 }
```

Ownership after the change:

```text
internal/onboard/steps.go      steps 5-6: resolveOwner, lookupUser, writeConfigAndStart
internal/cli/onboard.go        binds Deps to slackapi, config.Read/Save, service(), startDetachedDaemon
internal/cli/daemon.go         startDetachedDaemon(out, interval) shared by `daemon start` and `onboard --no-service`
internal/cli/setup.go          uses the shared newSlack seam (test URL override)
internal/config/config.go      Read (parse only) under Load (defaults + validate)
```

Step 6 control flow:

```text
writeConfigAndStart
  AuthTest(botToken)          fail -> "write config and start: bot token rejected by auth.test: ..." , step stays 5
  ProbeSocketMode(appToken)   fail -> same shape, step stays 5
  cfg = LoadConfig() or empty
  cfg.Slack.{BotToken,AppToken,OwnerUserID} = checkpoint
  cfg.ApplyDefaults(); cfg.Validate(); SaveConfig(cfg)   0600
  NoService ? StartDaemon() + "runs until you log out" : InstallService(); ServiceInstalled = true
```

The one detail before reading the diff: `resolveOwner` loops on `errNoSuchUser` and on a leading `n`; an empty confirmation counts as `Y`.

## Human Review

### Review targets

- `internal/onboard/steps.go:218-312`: owner routing (`@` vs `^[UW][A-Z0-9]+$`), not-found normalization, and the order of checks before `SaveConfig`.
- `internal/cli/onboard.go:122-161`: real bindings; `InstallService` mirrors `service install`, `StartDaemon` reuses the `daemon start` re-exec.
- `internal/config/config.go:67-99`: `Load` semantics unchanged for every other caller.

### Verify

- [ ] `cd tools/slack-coordinator && go test -count=1 ./internal/onboard ./internal/cli ./internal/config` passes.
- [ ] `Commits` hosted check passes on the branch.

### Known limits

- No run against real Slack, launchd, or systemd; `startDetachedDaemon` is exercised by hand through `daemon start` only.
- `onboard.json` still holds the bot and app tokens (0600) beside `config.yaml` after step 6; the verification sibling owns cleanup.
- Docs and the `.changeset/` entry belong to the epic's last child.

Closes #52
