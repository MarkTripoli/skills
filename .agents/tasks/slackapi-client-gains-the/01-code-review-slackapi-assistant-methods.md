---
type: code-review
date: 2026-09-22
branch: slackapi-client-gains-the
base_branch: epic-slack-assistant-bot-dms
base_sha: d1f95113d28c1d42c350b7379dd009ee2977a2c2
head_sha: 0a1299b02da024fe80c7c6573982edac5d5e998d
status: clean
summary: "Reviewed commit 0a1299b against epic-slack-assistant-bot-dms: seven slackapi methods, the embedded manifest package, the manifest file move, and the doc path. All five acceptance criteria are proven by tests that pass under go test and go test -race. No critical or major findings; two advisories record that apps.manifest.update returns no oauth_authorize_url in production and that non-200 responses drop Slack's error string. The next phase writes the pull request description."
---

# Code Review

## Scope

- merge base: `d1f95113d28c1d42c350b7379dd009ee2977a2c2` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists yet)
- reviewed HEAD: `0a1299b02da024fe80c7c6573982edac5d5e998d` on `slackapi-client-gains-the`
- commits: one, `0a1299b feat(slack-coordinator): add assistant slackapi calls, embed manifest`
- staged and unstaged changes: none (`git status --short --branch` prints only the branch line)
- task-owned untracked files: none
- excluded changes: `.agents/tasks/**` artifacts that still name `tools/slack-coordinator/slack-app-manifest.yaml` are committed history and stay as written

Changed files: `docs/slack-coordinator.md` (1 line), `tools/slack-coordinator/internal/manifest/manifest.go` (new, 11 lines), `internal/manifest/manifest_test.go` (new, 28 lines), `internal/manifest/slack-app-manifest.yaml` (R100 rename from the module root), `internal/slackapi/client.go` (+126/-7), `internal/slackapi/client_test.go` (+220).

## Previous Round

- previous artifact: None.

None.

## Requirements and Standards

- task or ticket: `task.md` (issue #43): seven methods on `slackapi.Client`, `internal/manifest` with `YAML()`, the manifest moved with `git mv`, doc path updated, proof `go test ./internal/slackapi ./internal/manifest`.
- implementation source: no plan, outline, TDD, or PRD artifact in the task directory; the epic TDD (`.agents/tasks/slack-assistant-bot-dms/03-tdd-slack-assistant-bot-dms.md:456`) and epic plan (`04-epic-plan-slack-assistant-bot-dms.md:27,692-693`) name the manifest embed and the `grep -rn slack-app-manifest.yaml` check. `task.md` is the implementation source for this oneshot child.
- repository instructions: `AGENTS.md` (task history under `.agents/tasks/` is preserved, not a cleanup target; `npm test` not run per the user's instruction); `shared/CONVENTIONS.md` commit rules. The existing `client.go` style is one exported method per Web API call with a one-line doc comment; the existing `client_test.go` style is an `httptest` fake asserting form fields.

Acceptance criteria against the diff:

| Criterion | Proof | Result |
|---|---|---|
| `chat.update` with `channel`, `ts`, `text`; `reactions.add` with `channel`, `timestamp`, `name` | `TestUpdateMessage` (`client_test.go:288-299`) asserts the four `chat.update` fields plus `unfurl_links=false`; `TestAddReaction` (`:301-308`) asserts the three `reactions.add` fields; both through `wantBotForm`, which also asserts the bot token | pass |
| `conversations.open` with `users=<id>`, returns the `D…` id | `TestOpenConversation` (`:310-321`) asserts `users=U0000000001` and `D0000000001` | pass |
| `users.lookupByEmail` / `users.info` return id, display name, `tz` | `TestLookupUserByEmail` (`:323-334`) and `TestUserInfoFallsBackToRealName` (`:336-358`) compare the full `User` value; the second also covers the `RealName` fallback at `client.go:124-130` | pass |
| `apps.manifest.create` / `apps.manifest.update` with `Authorization: Bearer <configToken>`, return `app_id` and install URL, or Slack's `error` string | `TestManifestCreate` (`:360-379`) asserts path, bearer, `manifest`, no `app_id`, no `token` form field; `TestManifestUpdate` (`:381-393`) asserts bearer, `app_id`, `manifest`; `TestManifestCreateSurfacesSlackError` (`:395-402`) asserts `invalid_auth` appears in the error | pass (see ADV-001 on the update install URL) |
| `manifest.YAML()` returns the file; the file lives only at `internal/manifest/slack-app-manifest.yaml` | `TestYAMLIsTheEmbeddedManifest` (`manifest_test.go:9-28`) parses the YAML and checks `display_information.name` and `socket_mode_enabled`; `git ls-files | grep slack-app-manifest.yaml` prints exactly `internal/manifest/slack-app-manifest.yaml`; `git diff --name-status` records `R100` | pass |

`grep -rn slack-app-manifest.yaml` outside `.agents/tasks/` hits only `docs/slack-coordinator.md:13` (updated to the new path) and `manifest.go:7,10`.

## Change Profile

- intent and expected behavior: give the assistant DM children one client for message edits, reactions, DM channels, user lookups, and manifest create/update, and embed the manifest so the repository file and the one `apps.manifest.create` sends are the same bytes.
- change description quality: the subject stands alone and passes the commit regex (66 characters). The body explains why the manifest calls bypass the SDK and cites `Refs: #43`. The claim that slack-go v0.29.0's helpers "take a typed Manifest struct re-encoded as JSON and their response type drops app_id and oauth_authorize_url" holds for create (`slack@v0.29.0/manifests.go:27-49,279-282`: `CreateManifestContext(*Manifest, token)` marshals to JSON; `ManifestResponse` carries only `Errors` and `SlackResponse`). `UpdateManifestResponse` does carry `AppId` (`manifests.go:295-299`), so the body overstates the update case; the typed-struct constraint alone justifies the bypass.
- implementation model and review model: implementation model not recorded in the commit; review by `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: 387 insertions, 7 deletions across six files. One logical change: the client surface plus its tests, and the manifest package plus its file move and doc line. Coherent; no split needed.
- resulting large-file concerns: `client.go` grows from 75 to 199 lines; `client_test.go` to 402 lines. Both remain one-package, one-concern files.
- dependency or lockfile changes: none. `go.mod` and `go.sum` are unchanged; `gopkg.in/yaml.v3 v3.0.1` was already a direct dependency (`go.mod:11`) and is now used by `manifest_test.go`.

## Tests Reviewed First

- behavior claimed by tests: each of the seven methods hits one Web API path with the exact form fields the task names; SDK-backed calls carry the bot token as the `token` form field while manifest calls carry the configuration token only in the `Authorization` header (`TestManifestCreate` asserts `token` is absent from the form); `ok:false` on `apps.manifest.create` surfaces `invalid_auth`; `UserInfo` falls back to `real_name` when `profile.display_name` is empty; `YAML()` is non-empty, parses, and is the coordinator manifest. `fakeSlack.call` fails when a method is recorded zero or more than one time, so the tests also prove each method issues exactly one request.
- missing or misleading coverage: the fake's `apps.manifest.update` reply includes `oauth_authorize_url`, and `TestManifestUpdate` fails when `InstallURL` is empty (`client_test.go:390`). Slack's documented success response for `apps.manifest.update` is `{"ok": true, "app_id": "…", "permissions_updated": false}` with no URL, so the test pins a value production never returns (ADV-001). No test covers the non-200 branch at `client.go:165-167`; see ADV-002 for why that branch matters. Neither gap contradicts an acceptance criterion.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens 5553 in / 73 out (provenance line: `judge: model jev-1.13.0, tokens 5553 in / 73 out`; one run, every axis `covered`)

### Correctness

- assessment and evidence: `UpdateMessage` returns the `ts` from `chat.update` (`client.go:78-81`; SDK returns channel, ts, text, err and the fake echoes `ts`). `AddReaction` uses `NewRefToMessage`, which the SDK serializes as `channel` and `timestamp` (asserted at `client_test.go:307`). `OpenConversation` returns `channel.ID` only after the error check (`client.go:89-95`); the SDK populates `Channel` from the `channel` object on `ok:true`. `toUser` (`client.go:124-130`) reads `Profile.DisplayName` then `RealName`; `slack.User.Profile` is a value type, so no nil path. `postManifest` (`client.go:153-184`) form-encodes with `url.Values.Encode`, sets `Content-Type` and the bearer header, bounds the body read at 1 MiB, treats `ok:false` as an error carrying Slack's `error` string, and substitutes `unknown_error` when Slack omits it, so the error is never a bare method name. `New` (`client.go:31-43`) keeps `slack.APIURL` (trailing slash) as the default and appends `/` to `cfg.APIURL`, so `c.apiURL+method` cannot drop the separator. The SDK and the manifest posts share one `*http.Client`. `go test` and `go test -race` pass for both packages.
- helper coverage: covered, level 3, confidence 0.98

### Readability and Simplicity

- assessment and evidence: methods follow the existing one-call-per-method shape with one-line doc comments (`client.go:77-148`). `postManifest` holds the only branching and the two callers pass only the form that differs (`client.go:141-148`). The `Client` field comment (`client.go:22-24`) records why the SDK is bypassed. The test file adds `fakeCall`, `record`, `call`, `wantForm`, and `wantBotForm` once and reuses them across seven tests instead of repeating form assertions. Names match the Slack method they wrap.
- helper coverage: covered, level 3, confidence 0.98

### Architecture

- assessment and evidence: the manifest calls sit on the same `Client` as the SDK-backed calls, sharing `apiURL` and `httpClient`, so fake servers and `config.Slack.APIURL` govern every outbound call (`client.go:31-43`). `internal/manifest` depends only on `embed` and exports one function, so `slackapi` and the onboarding child can both import it without a cycle. The manifest file exists once in the module (`git ls-files`). Nothing pre-existing is relocated without reason; the rename is the task's stated requirement.
- helper coverage: covered, level 3, confidence 0.99

### Security

- assessment and evidence: the configuration token travels only in the `Authorization` header, never in the form or URL (`client.go:159`; `TestManifestCreate` asserts no `token` form field). The token is not logged; errors carry the method name and Slack's error string only (`client.go:166,175,181`). Response bodies are read through `io.LimitReader(…, 1<<20)` (`client.go:174`), bounding memory against an oversized or hostile reply. `apiURL` comes from configuration, not from user messages, and `method` is one of two string constants, so no path injection. The manifest YAML is sent verbatim, as the task requires; Slack validates it server-side and returns `invalid_manifest` with pointers, which the `ok:false` path surfaces.
- helper coverage: covered, level 3, confidence 0.99

### Performance

- assessment and evidence: every method issues exactly one request (proven by `fakeSlack.call`'s single-record assertion). `postManifest` streams the form body from `strings.NewReader` and decodes with a streaming `json.Decoder`; the only allocations are the request, the encoded form, and the small response struct. `New` allocates one `http.Client` per `Client` instead of the SDK's own default, no additional connection pools. `YAML()` returns the embedded string without copying. No loops, pagination, or retries are introduced, and `apps.manifest.*` is a Tier 1 method called once per onboarding, so rate limiting is not a hot-path concern here.
- helper coverage: covered, level 3, confidence 0.99

## Verification Story

- command or inspection: `cd tools/slack-coordinator && go test ./internal/slackapi ./internal/manifest`; `go test -race ./internal/slackapi ./internal/manifest`; `go vet ./internal/slackapi ./internal/manifest`; `go build ./...`; `git ls-files | grep slack-app-manifest.yaml`; `grep -rn slack-app-manifest.yaml`; slack-go v0.29.0 source at `$GOMODCACHE/github.com/slack-go/slack@v0.29.0/manifests.go`; Slack reference for `apps.manifest.update` response.
- result: `ok internal/slackapi 0.206s`, `ok internal/manifest (cached)`; race run `ok 1.277s` / `ok 1.450s`; vet and build clean; one tracked manifest path; the only non-history reference outside the package is `docs/slack-coordinator.md:13`, already updated.
- manual, screenshot, or before-and-after evidence: not applicable; no interface changed. `npm test` was not run, per the user's instruction and `task.md`.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 `TestManifestUpdate` pins an install URL that `apps.manifest.update` never returns

- type: Potential issue
- severity: minor
- category: Data integrity and integration
- location: `tools/slack-coordinator/internal/slackapi/client_test.go:120-129,390`; `tools/slack-coordinator/internal/slackapi/client.go:132-137`
- evidence: the shared fake handler returns `oauth_authorize_url` for both `apps.manifest.create` and `apps.manifest.update`, and `TestManifestUpdate` fails when `res.InstallURL == ""`. Slack's documented `apps.manifest.update` success response is `{"ok": true, "app_id": "…", "permissions_updated": false}`; slack-go's `UpdateManifestResponse` (`manifests.go:295-299`) likewise has no URL field. In production `ManifestUpdate` returns an empty `InstallURL`, which the `ManifestResult` doc comment does not say.
- suggestion: give the update handler its own reply without `oauth_authorize_url`, drop the `res.InstallURL == ""` check from `TestManifestUpdate`, and add one sentence to the `ManifestResult` comment: update leaves `InstallURL` empty; existing installs reuse the workspace's install URL. The onboarding child that consumes `--existing` should not read `InstallURL` from an update.

### ADV-002 Non-200 responses drop Slack's error string

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `tools/slack-coordinator/internal/slackapi/client.go:165-167`
- evidence: `postManifest` returns `"<method>: HTTP <code>"` before decoding the body. Slack answers rate limits with HTTP 429 and a body `{"ok":false,"error":"ratelimited"}` plus `Retry-After`; `apps.manifest.*` are Tier 1 (about one call per minute). An operator who reruns onboarding quickly sees `apps.manifest.create: HTTP 429` rather than `ratelimited`, and the task's contract is that Slack's `error` string surfaces.
- suggestion: decode the body first and return `body.Error` when present; fall back to the HTTP status only when the body does not decode. One test with a 429 reply carrying `ratelimited` would pin it.

## Dead Code and Dependency Review

- newly orphaned code: none. The module-root `slack-app-manifest.yaml` was moved, not copied; `docs/slack-coordinator.md:13` now points at the new path; no script, Makefile target, or skill file named the old path.
- dependency findings: none. No `go.mod`/`go.sum` change; `gopkg.in/yaml.v3` was already required and is used only in the new test.

## Verdict

- decision: approve
- overall code-health change: improves. Seven single-call methods follow the existing client shape, the test fake gains reusable call recording, and the manifest becomes one embedded artifact instead of a loose file.
- rationale: every acceptance criterion is proven by a passing test or a repository check listed above; the two advisories concern a fixture that over-promises and an error-path detail, neither of which the task's criteria contradict or require.

## Review Limits

- blocked or unavailable checks: none. The axis-coverage helper ran once and reported all five axes `covered` at level 3; no section needed a rewrite and no second run was required.
- residual manual verification: no live Slack call was made; the `apps.manifest.update` response shape comes from Slack's published reference and the SDK's response type, not from a real workspace.
