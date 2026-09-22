Ticket: [#47](https://github.com/MarkTripoli/skills/issues/47) | Task: `onboard-creates-the-slack`

## Purpose

First-run setup of the coordinator still required copying a manifest and two tokens by hand; `slack-coordinator onboard` now creates the Slack app from the embedded manifest and collects the bot and app-level tokens through a checkpointed walkthrough (steps 1 to 4) that resumes where an interrupted run stopped and never writes the configuration token to disk.

## Acceptance criteria

- Fresh run with no `onboard.json`: prompts for the configuration token and app name, calls `apps.manifest.create` with `manifest.YAML()`, opens the returned install URL, prompts for the bot token, opens `https://api.slack.com/apps/<app_id>/general`, prompts for the app-level token, writes `onboard.json` (0600) with `step: 4`, `app_id`, `app_name`, `bot_token`, `app_token`: `TestFreshRunCompletesFourStepsAndRecordsBothTokens` (`internal/onboard/onboard_test.go:98`) asserts the prompt order, the manifest bytes, both opened URLs, the file mode, and the four fields; `TestOnboardCreatesTheAppAndSavesBothTokens` (`internal/cli/onboard_test.go:37`) drives the cobra command against a fake `apps.manifest.create` and checks the bearer token and the saved file; pass.
- A bot token without `xoxb-` or an app-level token without `xapp-` is named and re-prompted without advancing the step: `TestWrongBotTokenPrefixRepromptsWithoutAdvancing` (`onboard_test.go:135`) feeds a `xoxp-` paste, sees two bot-token prompts and `does not start with xoxb-`, and the run still ends at `step: 4`. Both prompts share `promptToken` (`steps.go:214`), so the `xapp-` path is the same code; no separate test.
- `apps.manifest.create` failure prints `create app: <cause>` (or the fixed `configuration token rejected; create a new one at api.slack.com/apps` for `invalid_auth`), exits 2, and leaves `onboard.json` at `step: 1` with no token: `TestCreateAppFailureLeavesStepOneWithoutTokens` (`onboard_test.go:159`), `TestInvalidAuthNamesTheExpiredConfigurationToken` (`onboard_test.go:183`), and `TestOnboardManifestFailureExitsTwoAndKeepsStepOne` (`cli/onboard_test.go:83`, asserts exit code 2 through `exit.go`); pass.
- Re-run at `step: 2` skips app creation and resumes at step 3 from the stored `app_id`, asking for the configuration token only when a remaining step needs it: `TestResumeFromStepTwoSkipsCreateAndUsesStoredAppID` (`onboard_test.go:192`) records zero `ManifestCreate` calls, no configuration-token prompt, and `https://api.slack.com/apps/A0STORED/install-on-team` as the first opened URL; pass.
- `onboard.json` never contains the configuration token: `Checkpoint` has no field for it (`checkpoint.go:17-26`), and the written file is asserted free of the token in `onboard_test.go:130`, `onboard_test.go:175` (after the create failure), and `cli/onboard_test.go:78`; pass.

Proof command: `cd tools/slack-coordinator && go test -count=1 ./internal/onboard ./internal/cli` (both `ok`). `npm test`, formatters, and linters were not run, per `task.md`.

## Special things to note

- The step ends at 4 by design: after the fourth save the command prints `Tokens saved to onboard.json; the remaining steps arrive in a later change.` and exits 0. `--existing` exits 2 with `not implemented yet`; `--no-service` is parsed and stored in `onboard.Flags` but unread until the later children. `setup` stays registered beside `onboard`.
- `Created app <id> from the embedded manifest; recorded as "<name>".` is deliberate: Slack names the app from `display_information.name` in the manifest, so the prompted name goes only into `app_name` in the checkpoint (code review CR-001, fixed in `5999460`). A browser-opener failure (`xdg-open` absent) is printed as a warning and the step continues to its prompt, since the URL is already on screen.
- Left as recorded advisories, no behavior change in this child: a hand-edited `{"step": 2}` without `app_id` resumes with empty URLs (ADV-002); `invalid_auth` is matched by error-string suffix until the `apps.manifest.update` child introduces a typed `slackapi` error (ADV-003). `golang.org/x/term` moves from indirect to direct in `go.mod` for `term.ReadPassword`.

## Change outline

`onboard.json` is the checkpoint; `Checkpoint` is its whole schema, and the configuration token has no field.

```diff
+type Checkpoint struct {
+  Step             int    // last completed step; 0 = fresh
+  AppID, AppName   string // set by step 2
+  BotToken         string // step 3
+  AppToken         string // step 4
+  OwnerUserID, OwnerDisplayName string // later children
+  ServiceInstalled bool                 // later children
+}
+LoadCheckpoint(path) (*Checkpoint, error)  // absent → zero value; step < 0 rejected
+(*Checkpoint).Save(path) error             // CreateTemp + chmod 0600 + rename
```

The walkthrough lives in `internal/onboard`; `Deps` is its only edge to the terminal, browser, and Slack, and the CLI binds real I/O.

```text
tools/slack-coordinator/internal/
  onboard/
    checkpoint.go   Checkpoint, LoadCheckpoint, Save
    steps.go        Deps, Flags, Run, step table [1..4], promptToken, ErrConfigTokenRejected
  cli/
    onboard.go      newOnboard (cobra), onboardDeps (stdin/term.ReadPassword/open|xdg-open/slackapi.New)
    root.go         + newOnboard()
```

`Run` starts at `Step+1`, saves after every step, and runs step 1 only when a later step in this invocation calls Slack with the token.

```text
Run(ctx, deps, cp, cpPath, flags)
  start = cp.Step + 1
  if start > 1 and needsToken(start):  runStep(1)        # resume that still needs the token; Step not advanced
  for i in start..4:
    if i == 1 and not needsToken(2):   skip
    runStep(i)   → error "<step name>: <cause>" | ErrConfigTokenRejected
    cp.Step = i; cp.Save(cpPath)

1 configuration token  PromptSecret(xoxe.xoxp-|xoxe-)     → state.configToken (memory only)
2 create app           Prompt(App name [Slack assistant]); ManifestCreate(token, manifest.YAML()) → AppID, AppName, installURL
3 install app          OpenURL(installURL | /apps/<id>/install-on-team); PromptSecret(xoxb-) → BotToken
4 app-level token      OpenURL(/apps/<id>/general); PromptSecret(xapp-)                       → AppToken
```

Read `steps.go:83-107` first: the token-step rule (`needsToken`) is the only branching in `Run`, and `cp.Step` is assigned only after a step returns, which is what makes a re-prompt unable to advance the checkpoint.

## Human Review

### Review targets

- `internal/onboard/steps.go` `Run` and `needsToken`: resume from `step: 1` re-asks the token without regressing; resume from `step: 2` or later never prompts for it in this child (no remaining step calls Slack).
- `internal/onboard/checkpoint.go` `Save`: temp file in the same directory, chmod 0600 before write, rename over `onboard.json`.
- `internal/cli/onboard.go` `onboardDeps`: `term.ReadPassword` only when stdin is a terminal; piped stdin (the tests) falls back to line reads.

### Verify

- [ ] `cd tools/slack-coordinator && go test -count=1 ./internal/onboard ./internal/cli` passes on the head commit.
- [ ] The `Commits` check passes on the four subjects between `epic-slack-assistant-bot-dms` and head.

### Known limits

- Not run against real Slack; the `open`/`xdg-open` and `term.ReadPassword` paths run only with a terminal on stdin, which the tests bypass by piping.
- No `.changeset/` entry in this child; the epic's docs child owns the user-facing changelog.

Closes #47
