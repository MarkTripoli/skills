---
type: code-review
date: 2026-09-22
branch: onboard-creates-the-slack
base_branch: epic-slack-assistant-bot-dms
base_sha: 0c80de9ac7d53af3a4d99480caa32377e74771e8
head_sha: 06bad39505ce21ff5052628d59af9b15b4ae6374
status: clean
summary: "Second round over the two code commits adding internal/onboard (checkpoint, steps 1 to 4) and the onboard cobra command. CR-001 from round one is fixed: createApp prints `Created app <id> from the embedded manifest; recorded as \"<name>\".` and the wire body is still manifest.YAML(). Every acceptance criterion holds against the diff and go test ./internal/onboard ./internal/cli (uncached, both ok). No critical or major findings; three advisories (a duplicated line-reading helper in internal/cli, an unvalidated empty app_id at step 2 or later, and the invalid_auth string match the fix round declined for this child). Next phase: describe the pull request."
---

# Code Review

## Scope

- merge base: `0c80de9ac7d53af3a4d99480caa32377e74771e8` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists yet, `gh pr view` not applicable)
- reviewed HEAD: `06bad39505ce21ff5052628d59af9b15b4ae6374`
- commits: `7ac9337 feat(slack-coordinator): add onboard steps 1-4 with checkpoint resume`, `5999460 fix(slack-coordinator): make the onboard created line true`; the two `docs(task)` commits carry artifacts only
- staged and unstaged changes: none (`git status --short --branch` shows a clean tree on `onboard-creates-the-slack`)
- task-owned untracked files: none
- excluded changes: `.agents/tasks/onboard-creates-the-slack/01-code-review-*.md` and `02-code-review-fixes-*.md` (task artifacts, not review subjects)

Reviewed files: `tools/slack-coordinator/internal/onboard/{checkpoint.go,steps.go,onboard_test.go}`, `internal/cli/{onboard.go,onboard_test.go,root.go}`, `go.mod`, `go.sum` (818 insertions, 1 deletion).

## Previous Round

- previous artifact: `01-code-review-onboard-creates-the-slack.md`
- CR-001 `Created <name> (<id>)` names an app Slack did not create: fixed

Evidence: `createApp` prints `Created app %s from the embedded manifest; recorded as %q.` with `res.AppID` first and the prompted name attributed to the checkpoint only (`steps.go:163`); `manifest.YAML()` still goes on the wire (`steps.go:155`, asserted by `onboard_test.go:111` and `cli/onboard_test.go:58`). `TestFreshRunCompletesFourStepsAndRecordsBothTokens` now requires `Created app A0EXAMPLE` in the output and rejects `Created Slack assistant` (`onboard_test.go:120-122`), so the old line cannot return unnoticed.

## Requirements and Standards

- task or ticket: `.agents/tasks/onboard-creates-the-slack/task.md` (issue #47, oneshot child of `slack-assistant-bot-dms`); five acceptance criteria decided under Correctness
- implementation source: no plan artifact in the task directory; the epic plan child entry `.agents/tasks/slack-assistant-bot-dms/04-epic-plan-slack-assistant-bot-dms.md:456-472` carries the same prompt and criteria as `task.md`
- repository instructions: `AGENTS.md` (commits per `scripts/check-commits.mjs`; `task.md` names the proof as `go test ./internal/onboard ./internal/cli` and excludes formatters, linters, and `npm test`; a changeset is deferred to the docs child by the feat commit body)

## Change Profile

- intent and expected behavior: `slack-coordinator onboard` prompts for an app configuration token, creates the app from the embedded manifest, opens the install URL and the app's Basic Information page, collects the bot and app-level tokens, and checkpoints to `<root>/onboard.json` (0600, temp file plus rename) after every step; a re-run resumes at `step + 1` and re-prompts the configuration token only when a remaining step calls Slack with it; `--existing` exits 2 with `not implemented yet`; the command ends with `Tokens saved to onboard.json; the remaining steps arrive in a later change.`
- change description quality: `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD` reports `ok: 4 subjects`. The fix commit body states the four behavior changes and why each (manifest names the app; opener failure left hosts without `xdg-open` stuck at step 3; negative step indexed a nil function; `x/term` is a direct import) with `Refs: #47`.
- implementation model and review model: implementation model not recorded in the commits; review model `anthropic/claude-fable-5-1`
- changed-line size and logical cohesion: 818 added lines, 355 of them tests; one feature (walkthrough steps 1 to 4 plus checkpoint) and its command; coherent, no split needed
- resulting large-file concerns: none; largest file is `onboard_test.go` at 266 lines
- dependency or lockfile changes: `golang.org/x/term v0.36.0` moves to the direct `require` block (one line in `go.mod`), two `go.sum` lines; `go mod tidy -diff` prints nothing

## Tests Reviewed First

- behavior claimed by tests: `internal/onboard/onboard_test.go` scripts `Deps` (queued answers, recorded URLs and prompts, fake `ManifestAPI`) and proves: a fresh run writes `step: 4` with `app_id`, `app_name`, `bot_token`, `app_token`, calls `ManifestCreate` once with the configuration token and `manifest.YAML()`, opens the returned install URL then `/apps/A0EXAMPLE/general`, names `connections:write`, reports the app id without attributing the prompted name to Slack, and leaves the file at mode 0600 with no `xoxe` substring (lines 98 to 133); a `xoxp-` paste for the bot token prompts twice with `does not start with xoxb-` and the run still finishes at `step: 4` (135 to 157); a `ManifestCreate` error returns `create app: ...HTTP 500`, leaves `step: 1`, no `app_id`/tokens, no token string, no URL opened (159 to 181); `invalid_auth` returns the exact fixed line (183 to 190); resume from `step: 2` makes no create call, never prompts for the configuration token, and opens both URLs from `A0STORED` (192 to 213); resume from `step: 1` re-prompts the token and reaches `step: 4` (215 to 227); an opener failure prints the URL and `open the URL above by hand` and still records both tokens (229 to 248); `LoadCheckpoint` rejects `{"step": -1}` and returns the zero value for a missing file (250 to 266). `internal/cli/onboard_test.go` runs the cobra command against an `httptest` server: `Bearer xoxe.xoxp-1-cfg` and the embedded manifest arrive at `/apps.manifest.create`, both URLs open, exit 0 with the closing line, `onboard.json` under `$SLACK_COORDINATOR_HOME` holds the four values and no `xoxe` (37 to 81); `ok:false` `invalid_manifest` exits 2 with `create app: ` and leaves `"step": 1` (83 to 110); `--existing --no-service` exits 2 with `not implemented yet` (112 to 118).
- missing or misleading coverage: no test for a wrong `xapp-` prefix; the same `promptToken` helper serves both prompts (`steps.go:214-228`) so the `xoxb-` case exercises the code path. No test for `Save` replacing an existing file or for a corrupt checkpoint; both are direct `os` calls with no branching of their own. The tests read as their names say.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `6015` in / `73` out (one run; every axis `covered`, so no second run). Provenance line: `judge: model jev-1.13.0, tokens 6015 in / 73 out`

### Correctness

- assessment and evidence: All five acceptance criteria hold. (1) Fresh run: `start = cp.Step+1 = 1`; the loop runs `promptConfigToken` (kept because `needsToken(2)` is true), `createApp`, `installApp`, `appLevelToken` and saves after each (`steps.go:88-105`); proven by `TestFreshRunCompletesFourStepsAndRecordsBothTokens` and `TestOnboardCreatesTheAppAndSavesBothTokens`. (2) Prefix re-prompt: `promptToken` loops until a prefix matches and names the expected prefix (`steps.go:214-228`); `cp.Step` is assigned only after the step returns (`steps.go:101`), so a re-prompt cannot advance it; `TestWrongBotTokenPrefixRepromptsWithoutAdvancing`. (3) Create failure: step 1 saved `step: 1` before `createApp` ran; `runStep` wraps the cause as `create app: <cause>` or passes `ErrConfigTokenRejected` through unwrapped (`steps.go:120-129`, `157-158`); the CLI maps it with `usageErr` to exit 2 (`cli/onboard.go:71`); `TestCreateAppFailureLeavesStepOneWithoutTokens`, `TestInvalidAuthNamesTheExpiredConfigurationToken`, `TestOnboardManifestFailureExitsTwoAndKeepsStepOne`. (4) Resume at `step: 2`: `start = 3`, `needsToken(3)` is false so the token step is skipped and `createApp` never runs; `installApp` rebuilds the URL from `cp.AppID` because `st.installURL` is empty (`steps.go:170-173`); `TestResumeFromStepTwoSkipsCreateAndUsesStoredAppID`. Resume at `step: 1` runs the token step through the pre-loop branch without saving, so the checkpoint never regresses (`steps.go:89-93`; `TestResumeFromStepOneAsksForTheTokenAgainWithoutRegressing`). (5) `Checkpoint` has no field for the configuration token (`checkpoint.go:17-26`); three tests assert the file lacks `xoxe`. Boundaries: `Step >= len(steps)` runs nothing and returns nil, so a completed checkpoint re-run prints the closing line; `Step < 0` is rejected on load (`checkpoint.go:42-44`). EOF on piped stdin returns an error from `prompt` when the line is empty (`cli/onboard.go:90`), so `promptToken` cannot spin. `cmd.Context()` is non-nil under cobra `Execute` (the tests call `ctx.Err()` at `steps.go:121` without panicking). `Save` removes its temp file on write or rename failure (`checkpoint.go:65-72`).
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: The step table `steps` with `name`, `run`, `needsToken` (`steps.go:60-74`) keeps `Run` to one loop plus one pre-loop branch for the resume-at-1 case; `needsToken` is the single place the token rule lives (`steps.go:111-118`). Names are exact (`installURL`, `generalURL`, `promptToken`, `writeAndClose`, `open`). Comments state behavior, not intent to have behavior (`steps.go:202-204`, `checkpoint.go:48-50`). `state.flags` is stored and unread; `task.md` requires `Flags` on `Run` for later children. The `prompt` closure in `cli/onboard.go:87-94` re-implements `readAnswer` from `run_disable_slack.go:62-68` (ADV-001). No dead code.
- helper coverage: covered, level 3, confidence 0.98

### Architecture

- assessment and evidence: The walkthrough lives in `internal/onboard` with `Deps` as its only edge to the terminal, browser, and Slack (`steps.go:21-30`); `ManifestAPI` is a one-method interface `*slackapi.Client` already satisfies (`slackapi/client.go:141`). The manifest is read through `manifest.YAML()` and not copied. The CLI binds real I/O in `onboardDeps` and uses two package-level test seams (`onboardAPIURL`, `openBrowser`, `cli/onboard.go:22-25`), the same shape as `injectService` in `service_test.go`; no test in either package calls `t.Parallel`, so the seams cannot race. Opener failure is handled in `onboard.open` as a warning (`steps.go:205-210`), so the CLI's platform switch stays free of walkthrough policy. `invalid_auth` is recognized by error-string suffix in `createApp` (`steps.go:157`); the fix round recorded why the typed error waits for the `apps.manifest.update` child (ADV-003).
- helper coverage: covered, level 3, confidence 1.00

### Security

- assessment and evidence: The configuration token (can create and delete apps, 12-hour life) is held in `state.configToken` only, never in `Checkpoint`; three tests assert the file has no `xoxe` substring. `Save` creates the temp file with `os.CreateTemp` (0600), chmods 0600 before writing, and renames over `onboard.json`, so the bot and app-level tokens are never readable by other users even mid-write (`checkpoint.go:51-74`); `MkdirAll` uses 0700 and `paths.EnsureDirs` already creates the root owner-only. Secrets are read with `term.ReadPassword` when stdin is a terminal, so pastes do not echo (`cli/onboard.go:96-106`); the terminal's canonical mode returns one line per read, so the `bufio.Reader` used for the app-name prompt cannot swallow a following secret line. Browser URLs are passed to `open`/`xdg-open` as a single argv element, no shell (`cli/onboard.go:26-38`); the install URL comes from Slack's response and the general URL is built from the app id Slack returned. Output lines never echo a token. The bearer token travels only to `apiURL`, which is Slack's default unless the test seam overrides it (`slackapi/client.go:31-43`).
- helper coverage: covered, level 3, confidence 0.99

### Performance

- assessment and evidence: One interactive walkthrough: four prompts, one HTTP call, two `exec` calls, up to four small JSON writes. No loops over data, no retries, no goroutines; `promptToken` loops only on user input and ends on EOF. `io.LimitReader(1<<20)` bounds the manifest response decode in `slackapi` (pre-existing). Nothing to measure.
- helper coverage: covered, level 3, confidence 0.99

## Verification Story

- command or inspection: in `tools/slack-coordinator`: `go build ./...`; `go test -count=1 ./internal/onboard ./internal/cli`; `go vet ./internal/onboard ./internal/cli`; `go mod tidy -diff`; `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD`; read of every changed file and of `slackapi.postManifest`, `paths.OnboardCheckpoint`, `cli.readAnswer`, `cli.exitCode`
- result: build ok; `ok internal/onboard 0.252s`, `ok internal/cli 0.875s`; vet ok; tidy prints nothing; commit check `ok: 4 subjects`
- manual, screenshot, or before-and-after evidence: none needed for a terminal command whose output the CLI test captures; the fix round's stash run (`02-code-review-fixes-*.md`, Verification) recorded the three new tests failing on the pre-fix source

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 `prompt` in `onboardDeps` duplicates `readAnswer`

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/cli/onboard.go:87-94`
- evidence: `readAnswer(r *bufio.Reader)` in `run_disable_slack.go:62-68` already reads one line, treats EOF with text as a line, and trims it; the `prompt` closure repeats that with a slightly different guard (`err != io.EOF || line == ""` versus `len(line) == 0`).
- suggestion: print the label, then `return readAnswer(in)`; one line-reading rule for the package.

### ADV-002 A checkpoint at step 2 or later with no `app_id` builds URLs with an empty id

- type: Potential issue
- severity: minor
- category: Data integrity and integration
- location: `tools/slack-coordinator/internal/onboard/steps.go:170-173`, `186`
- evidence: `LoadCheckpoint` validates only `Step < 0` (`checkpoint.go:42-44`). A hand-edited or truncated `{"step": 2}` resumes at `installApp`, which opens `https://api.slack.com/apps//install-on-team` and then prompts for a bot token the user cannot obtain. Only reachable by editing `onboard.json`; `Run` never writes `Step >= 2` without `AppID`.
- suggestion: beside the negative-step check, reject `cp.Step >= 2 && cp.AppID == ""` with `<path>: step %d without app_id; delete the file to start over`.

### ADV-003 `invalid_auth` recognized by error-string suffix

- type: Refactor suggestion
- severity: info
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/onboard/steps.go:157`
- evidence: `postManifest` formats Slack's error as `<method>: <error>` (`slackapi/client.go:181`), so `strings.HasSuffix(err.Error(), "invalid_auth")` is correct today and `TestInvalidAuthNamesTheExpiredConfigurationToken` pins it. The fix round declined a typed `slackapi` error for this child because `internal/slackapi` is outside its packages and the `apps.manifest.update` child needs the same check (`02-code-review-fixes-*.md`, ADV-004).
- suggestion: none for this child; the decision stands as recorded. The update child introduces the typed error once and both call sites use `errors.As`.

## Dead Code and Dependency Review

- newly orphaned code: none. `newSetup` remains registered beside `newOnboard` (`root.go:39`); the epic keeps `setup` until a later child. `Flags.NoService` is parsed and unread by design for this child.
- dependency findings: `golang.org/x/term v0.36.0` (BSD-3, Go team, already indirect through `golang.org/x/sys v0.42.0`) is now a direct requirement; `go mod tidy -diff` is empty. No other dependency changes.

## Verdict

- decision: approve
- overall code-health change: improves. The package boundary the epic TDD fixes exists, every acceptance criterion has a test that fails on the plausible regression, the output line the first round flagged now states only what Slack did, and the secret-handling invariant (configuration token never on disk) is enforced by the type and asserted three times.
- rationale: CR-001 fixed with a regression assertion; no critical or major finding in the pinned scope; the three advisories are optional and do not change behavior the acceptance criteria name.

## Review Limits

- blocked or unavailable checks: none; the typed judgment ran once and reported every axis covered
- residual manual verification: no run against real Slack; the browser-open path (`open`/`xdg-open`) and the `term.ReadPassword` path run only when stdin is a terminal, which the tests bypass by piping stdin.
