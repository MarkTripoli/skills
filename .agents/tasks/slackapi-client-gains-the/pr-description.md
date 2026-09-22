Ticket: [#43](https://github.com/MarkTripoli/skills/issues/43) | Task: `slackapi-client-gains-the`

## Purpose

The assistant DM children (message edits, reactions, DM channels, user lookups, manifest onboarding) need seven Slack Web API calls the `slackapi.Client` did not expose, and the app manifest becomes one embedded artifact so the repository file and the bytes `apps.manifest.create` sends cannot drift.

## Acceptance criteria

- `UpdateMessage` sends `chat.update` with `channel`, `ts`, `text`; `AddReaction` sends `reactions.add` with `channel`, `timestamp`, `name`: `TestUpdateMessage` and `TestAddReaction` (`internal/slackapi/client_test.go:288-308`) assert those form fields against the fake server; pass.
- `OpenConversation(ctx, userID)` sends `conversations.open` with `users=<id>` and returns the `D…` id: `TestOpenConversation` (`client_test.go:310-321`) asserts `users=U0000000001` and the returned `D0000000001`; pass.
- `LookupUserByEmail` and `UserInfo` send `users.lookupByEmail` and `users.info` and return id, display name, `tz`: `TestLookupUserByEmail` and `TestUserInfoFallsBackToRealName` (`client_test.go:323-358`) compare the full `User` value, the second also with an empty `profile.display_name`; pass.
- `ManifestCreate` and `ManifestUpdate` send `apps.manifest.create` and `apps.manifest.update` with `Authorization: Bearer <configToken>` and return `app_id` and the install URL, or Slack's `error` string: `TestManifestCreate`, `TestManifestUpdate`, `TestManifestCreateSurfacesSlackError` (`client_test.go:360-402`) assert path, bearer header, `manifest`/`app_id` fields, no `token` form field, and that `invalid_auth` appears in the error; pass.
- `manifest.YAML()` returns `slack-app-manifest.yaml`, which lives only at `internal/manifest/slack-app-manifest.yaml`: `TestYAMLIsTheEmbeddedManifest` (`internal/manifest/manifest_test.go:9-28`) parses the YAML and checks `display_information.name`; `git ls-files | grep slack-app-manifest.yaml` prints exactly the new path (`R100` rename); pass.

Proof command: `cd tools/slack-coordinator && go test ./internal/slackapi ./internal/manifest` (both `ok`, 9 new tests pass). `npm test` was not run, per `task.md`.

## Special things to note

- `ManifestCreate`/`ManifestUpdate` bypass slack-go: its `CreateManifestContext` takes a typed `*slack.Manifest` re-encoded as JSON and its create response type has no `app_id` or `oauth_authorize_url`. The client form-posts the YAML verbatim through its own `http.Client` and `apiURL`, so `config.Slack.APIURL` still redirects every outbound call in tests. The configuration token travels only in the `Authorization` header, never in the form.
- `apps.manifest.update` returns no `oauth_authorize_url` in production, so `ManifestUpdate` yields an empty `InstallURL`; the fake server and `TestManifestUpdate` pin a URL that Slack does not send (code review ADV-001). The onboarding child must not read `InstallURL` from an update.
- A non-200 reply (Slack rate limits `apps.manifest.*` at Tier 1 and answers 429 with `{"ok":false,"error":"ratelimited"}`) surfaces as `apps.manifest.create: HTTP 429`, not `ratelimited`; `postManifest` returns before decoding the body (code review ADV-002). Neither advisory contradicts an acceptance criterion; both are left for a follow-up.

## Change outline

`Client` gains the HTTP pieces the SDK-bypassing manifest calls need; `New` shares one `http.Client` between the SDK and `postManifest`.

```diff
 type Client struct {
   api *slack.Client
+  httpClient *http.Client   // shared with the SDK via slack.OptionHTTPClient
+  apiURL     string         // slack.APIURL or config.Slack.APIURL with trailing "/"
 }
+type User struct { ID, DisplayName, TZ string }          // DisplayName: Profile.DisplayName, else RealName
+type ManifestResult struct { AppID, InstallURL string }  // app_id, oauth_authorize_url
```

New methods, one Web API call each, beside `PostMessage` and `Permalink` in `internal/slackapi/client.go`:

```text
UpdateMessage(ctx, channel, ts, mrkdwn)        chat.update            via UpdateMessageContext
AddReaction(ctx, channel, ts, name)            reactions.add          via AddReactionContext + NewRefToMessage
OpenConversation(ctx, userID) -> D… id         conversations.open     via OpenConversationContext
LookupUserByEmail(ctx, email) -> User          users.lookupByEmail    via GetUserByEmailContext + toUser
UserInfo(ctx, userID) -> User                  users.info             via GetUserInfoContext + toUser
ManifestCreate(ctx, configToken, yaml)         apps.manifest.create   via postManifest
ManifestUpdate(ctx, configToken, appID, yaml)  apps.manifest.update   via postManifest
```

`postManifest` is the only new branching:

```text
postManifest(method, configToken, form)
  POST <apiURL><method>  body=form.Encode()  Authorization: Bearer <configToken>
  status != 200         -> error "<method>: HTTP <code>"
  decode {ok,error,app_id,oauth_authorize_url} from body limited to 1 MiB
  ok == false           -> error "<method>: <slack error>"   (invalid_auth surfaces verbatim)
  -> ManifestResult{AppID, InstallURL}
```

Files:

```text
tools/slack-coordinator/
  internal/slackapi/client.go          +7 methods, User, ManifestResult, postManifest
  internal/slackapi/client_test.go     fakeCall recording, wantForm/wantBotForm, 8 new tests
  internal/manifest/manifest.go        new: //go:embed slack-app-manifest.yaml; YAML() string
  internal/manifest/manifest_test.go   new: embedded YAML parses, names slack-coordinator
  internal/manifest/slack-app-manifest.yaml   R100 from module root, content unchanged
docs/slack-coordinator.md              Setup step 1 links the new manifest path
```

Before reading the diff: SDK-backed calls carry the bot token as the `token` form field; the two manifest calls carry the configuration token only as a bearer header, and `TestManifestCreate` asserts `token` is absent from their form.

## Human Review

### Review targets

- `postManifest` (`internal/slackapi/client.go:150-184`): bearer header, form encoding, 1 MiB body bound, `ok:false` error text, and the non-200 branch that drops Slack's error string.
- `TestManifestUpdate` and the shared fake handler (`client_test.go:120-160,381-393`): the fixture returns `oauth_authorize_url` for update, which production does not.
- `docs/slack-coordinator.md:13` and `git ls-files | grep slack-app-manifest.yaml`: one manifest path in the module, the doc link resolves.

### Verify

- [ ] Run `cd tools/slack-coordinator && go test ./internal/slackapi ./internal/manifest`; both packages report `ok`.
- [ ] Confirm the `Commits` check passes on the PR title `feat(slack-coordinator): add assistant slackapi calls, embed manifest`.

### Known limits

- No live Slack call was made; the `apps.manifest.update` response shape comes from Slack's published reference and slack-go's `UpdateManifestResponse`, not from a workspace.
- Task artifacts under `.agents/tasks/slack-assistant-bot-dms/` still name the old manifest path; they are committed history and intentionally unchanged.

Closes #43
