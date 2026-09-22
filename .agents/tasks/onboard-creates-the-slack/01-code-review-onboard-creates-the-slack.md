---
type: code-review
date: 2026-09-22
branch: onboard-creates-the-slack
base_branch: epic-slack-assistant-bot-dms
base_sha: 0c80de9ac7d53af3a4d99480caa32377e74771e8
head_sha: 7ac9337faf066e575fc0f791031aef3505781c1b
status: findings
summary: "Reviewed the one commit adding internal/onboard (checkpoint, steps 1 to 4) and the onboard cobra command; every acceptance criterion is proven by go test ./internal/onboard ./internal/cli. One major finding: createApp prints `Created <prompted name> (<id>)` while the manifest sent names the app `slack-coordinator`, so the line is false on every run including the default. The fix round corrects that line (keeping manifest.YAML() verbatim per the epic contract) and may take the four advisories: `golang.org/x/term` marked indirect, a nil-func panic on a negative checkpoint step, a hard stop when the browser opener fails, and invalid_auth matched by error-string suffix."
---

# Code Review

## Scope

- merge base: `0c80de9ac7d53af3a4d99480caa32377e74771e8` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists yet)
- reviewed HEAD: `7ac9337faf066e575fc0f791031aef3505781c1b`
- commits: one, `7ac9337 feat(slack-coordinator): add onboard steps 1-4 with checkpoint resume`
- staged and unstaged changes: none (`git status --short --branch` shows only `## onboard-creates-the-slack`)
- task-owned untracked files: none; `.agents/tasks/onboard-creates-the-slack/` holds `task.md` only before this artifact
- excluded changes: none; the diff is eight files under `tools/slack-coordinator/` (`go.mod`, `go.sum`, `internal/cli/onboard.go`, `internal/cli/onboard_test.go`, `internal/cli/root.go`, `internal/onboard/checkpoint.go`, `internal/onboard/onboard_test.go`, `internal/onboard/steps.go`)

## Previous Round

- previous artifact: none
- None.

## Requirements and Standards

- task or ticket: `.agents/tasks/onboard-creates-the-slack/task.md` (issue #47, oneshot child of `slack-assistant-bot-dms`); five acceptance criteria decided below under Correctness
- implementation source: no plan artifact in the task directory; the epic's `.agents/tasks/slack-assistant-bot-dms/04-epic-plan-slack-assistant-bot-dms.md` (child at lines 457 to 472, contract "onboarding sends `manifest.YAML()`" at line 27) and TDD section "`onboard` verifies through the running daemon and checkpoints every pasted value except the configuration token" (`03-tdd-slack-assistant-bot-dms.md:96-129`)
- repository instructions: `AGENTS.md` (Go module under `tools/slack-coordinator`, proof by the named `go test` packages, `.changeset/` for user-facing changes); the epic plan assigns docs and the changeset to the wave-9 child `docs-describe-onboarding-dms` (`05-epic-delivery-slack-assistant-bot-dms.md:48`), and the commit body says so

## Change Profile

- intent and expected behavior: `slack-coordinator onboard` prompts for an app configuration token, creates the app from the embedded manifest, opens the install URL and the app's Basic Information page, collects the bot and app-level tokens, and checkpoints to `<root>/onboard.json` (0600, temp file plus rename) after every step; a re-run resumes at `step + 1` and re-prompts the configuration token only when a remaining step calls Slack with it. `--existing` exits 2 with `not implemented yet`.
- change description quality: subject `feat(slack-coordinator): add onboard steps 1-4 with checkpoint resume` passes `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD` (`ok: 1 subject`). The body explains why the configuration token stays in memory, records four decisions the request left open, and defers docs and changeset to the docs child with `Refs: #47`.
- implementation model and review model: implementation model not recorded in the commit; review model `anthropic/claude-fable-5-1`
- changed-line size and logical cohesion: 779 insertions, 1 deletion; one package plus one command, one concern. Above the ~300 coherent mark but 349 of the lines are tests and the split point (package without command) would leave an untestable half.
- resulting large-file concerns: none; largest new file is `onboard_test.go` at 231 lines
- dependency or lockfile changes: `golang.org/x/term v0.36.0` added to `go.mod`/`go.sum`; see ADV-001 and Dead Code and Dependency Review

## Tests Reviewed First

- behavior claimed by tests: `internal/onboard/onboard_test.go` scripts `Deps` (queued answers, recorded URLs, fake `ManifestAPI`) and proves: a fresh run writes `step: 4` with `app_id`, `app_name`, `bot_token`, `app_token`, calls `ManifestCreate` once with the configuration token and `manifest.YAML()`, opens the returned install URL then `/apps/A0EXAMPLE/general`, names `connections:write`, leaves the file at mode 0600 with no `xoxe` substring (lines 98 to 130); a `xoxp-` paste for the bot token re-prompts once and the message names `xoxb-` (132 to 154); a `ManifestCreate` error returns `create app: ...HTTP 500`, leaves `step: 1`, no `app_id`/`bot_token`/`app_token`, no configuration token, no URL opened (156 to 178); `invalid_auth` returns the fixed rejected-token line (180 to 187); resume from `step: 2` calls `ManifestCreate` zero times, never prompts for the configuration token, opens `/apps/A0STORED/install-on-team` then `/apps/A0STORED/general` (189 to 210); resume from `step: 1` re-prompts the token and completes (212 to 224); an absent checkpoint loads as the zero value (226 to 231). `internal/cli/onboard_test.go` runs the cobra command against an `httptest` Slack serving `apps.manifest.create`: exit 0 with `Bearer xoxe.xoxp-1-cfg` and the embedded manifest on the wire, both URLs opened, the closing `Tokens saved to onboard.json; ...` line, and the file contents (37 to 81); `invalid_manifest` gives exit 2, `create app: ...invalid_manifest`, no URL, `"step": 1` without `xoxe` (83 to 110); `--existing --no-service` parses and exits 2 with `not implemented yet` (112 to 118).
- missing or misleading coverage: no test for a wrong `xapp-` prefix; the same `promptToken` helper serves both prompts (`steps.go:214-228`), so the `xoxb-` case covers the code path. No test for `Save` replacing an existing file atomically or for a corrupt checkpoint; both are straight `os` calls. No test pins the `Created ... ` output line, which is why CR-001 went unnoticed.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `6539` in / `73` out (one run; every axis `covered`, so no second run)

### Correctness

- assessment and evidence: All five acceptance criteria hold against the diff and its tests. (1) Fresh run: `Run` starts at `cp.Step+1 == 1`, runs `promptConfigToken`, `createApp`, `installApp`, `appLevelToken` in order and saves after each (`steps.go:83-107`); `TestFreshRunCompletesFourStepsAndRecordsBothTokens` and `TestOnboardCreatesTheAppAndSavesBothTokens` prove the prompts, the wire call, both URLs, and the file. (2) Prefix re-prompt: `promptToken` loops until a prefix matches and prints `That token does not start with xoxb-; paste it again.` (`steps.go:214-228`); the checkpoint is saved only after the step returns (`steps.go:101-104`), so a re-prompt cannot advance it; `TestWrongBotTokenPrefixRepromptsWithoutAdvancing`. (3) Create failure: `runStep` wraps as `create app: <cause>` except `ErrConfigTokenRejected` (`steps.go:120-129`), the CLI maps it through `usageErr` to exit 2 (`cli/onboard.go:70-72`, `exit.go:31-33`), step 1 was saved before step 2 ran; `TestCreateAppFailureLeavesStepOneWithoutTokens`, `TestInvalidAuthNamesTheExpiredConfigurationToken`, `TestOnboardManifestFailureExitsTwoAndKeepsStepOne`. (4) Resume at `step: 2`: `start == 3`, `needsToken(3)` is false so step 1 is skipped, `installApp` rebuilds the URL from `cp.AppID` (`steps.go:88-93`, `166-170`, `197-199`); `TestResumeFromStepTwoSkipsCreateAndUsesStoredAppID`. (5) `Checkpoint` has no field for the configuration token (`checkpoint.go:17-26`) and `state.configToken` never reaches `Save`; both fresh-run tests assert the file lacks `xoxe`. Cobra `SilenceErrors`/`SilenceUsage` plus `Execute` printing once to stderr (`root.go:22-28`) give the single `<step name>: <cause>` line the task asks for. Defects found: the `Created <name> (<id>)` line misreports the app name on every run (CR-001); a negative `step` in `onboard.json` indexes `steps[0]`, whose `run` is nil, and panics (ADV-002, reproduced with a throwaway test: `runtime error: invalid memory address or nil pointer dereference`).
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: Step table `steps` with `name`, `run`, `needsToken` (`steps.go:60-74`) matches the task's "slice indexed from 1" and keeps `Run` to one loop; `needsToken` is the one place the token rule lives. The pre-loop token run (`steps.go:89-93`) and the in-loop skip (`95-97`) are two branches for one rule, but they exist so that a fresh run saves `step: 1` (acceptance 3) while a resumed run does not regress the checkpoint; collapsing them would need a second save site, so the current shape is the smaller one. Names are exact (`installURL`, `generalURL`, `promptToken`, `writeAndClose`). `state.flags` is stored and unread; the task requires `Flags` on `Run` for later children. No dead code.
- helper coverage: covered, level 3, confidence 0.97

### Architecture

- assessment and evidence: The walkthrough lives in `internal/onboard` with `Deps` as its only edge to the terminal, browser, and Slack (`steps.go:21-30`), the placement the TDD fixes (`03-tdd...md:163`, "`internal/onboard` holds the walkthrough so its steps are tested against a fake Slack without cobra"). `ManifestAPI` is a one-method interface over `*slackapi.Client`, which already satisfies it (`slackapi/client.go:141`). The manifest is read through `manifest.YAML()` and not copied, per the epic contract. The CLI binds real I/O in `onboardDeps` and uses two package-level test seams (`onboardAPIURL`, `openBrowser`, `cli/onboard.go:22-25`), the same shape as the existing `injectService` seam in `service_test.go`. Boundary drift: `createApp` decides that `invalid_auth` is the rejected-token case by string suffix on an error that `slackapi.postManifest` formats as `"<method>: <error>"` (`steps.go:154`, `client.go:181`); a typed error in `slackapi` would move that knowledge to the package that owns the wire format (ADV-004).
- helper coverage: covered, level 3, confidence 0.98

### Security

- assessment and evidence: The configuration token (can create and delete apps, 12-hour life) is held in `state.configToken` only, never in `Checkpoint`, and both fresh-run tests assert the file has no `xoxe` substring. `Save` creates the temp file with `os.CreateTemp` (0600 by default), chmods 0600 again before writing, and renames over `onboard.json`, so the bot and app-level tokens are never world-readable even mid-write (`checkpoint.go:47-84`); `MkdirAll` uses 0700 and `paths.EnsureDirs` already creates the root owner-only. Secrets are read with `term.ReadPassword` when stdin is a terminal, so pastes do not echo (`cli/onboard.go:96-106`). Browser URLs are passed to `open`/`xdg-open` as a single argv element, no shell (`cli/onboard.go:26-38`); the install URL comes from Slack's response and the general URL is built from an `AppID` Slack returned or the owner-only checkpoint stored. Tokens are trimmed but not otherwise logged or echoed to `Out`.
- helper coverage: covered, level 3, confidence 0.95

### Performance

- assessment and evidence: One interactive walkthrough: four prompts, one HTTP call, two `exec` calls, up to four small JSON writes. No loops over data, no retries, no goroutines. `promptToken` loops only on user input. `io.LimitReader(1<<20)` bounds the manifest response decode in `slackapi` (pre-existing). Nothing to measure.
- helper coverage: covered, level 3, confidence 0.99

## Verification Story

- command or inspection: `go test ./internal/onboard ./internal/cli` in `tools/slack-coordinator`; `go build ./...`; `go mod tidy -diff`; `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD`; a throwaway test (removed after) running `Run` with `Checkpoint{Step: -1}`
- result: `ok internal/onboard 0.225s`, `ok internal/cli 0.806s`; build ok; `go mod tidy -diff` moves `golang.org/x/term v0.36.0` from the `// indirect` block to the direct block; commit check `ok: 1 subject`; the negative-step run panics with a nil function call
- manual, screenshot, or before-and-after evidence: none; the terminal flow was not run against real Slack. The `httptest` server in `cli/onboard_test.go` proves the wire shape (`Authorization: Bearer <config token>`, form field `manifest` equal to `manifest.YAML()`).

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 `Created <name> (<id>)` names an app Slack did not create

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/slack-coordinator/internal/onboard/steps.go:145-160`
- failure mode: `createApp` prompts `App name [Slack assistant]`, records the answer as `cp.AppName`, sends `manifest.YAML()` unchanged, then prints `Created %s (%s)` with the prompted name. The manifest's `display_information.name` is `slack-coordinator` (`internal/manifest/slack-app-manifest.yaml:5`), so the app Slack creates and shows on the install page that opens next is named `slack-coordinator` on every run, including the default. The recorded `app_name` inherits the same mismatch and the PRD has the final step print "the app name" (`02-prd...md:194`).
- evidence or reproduction: `TestWrongBotTokenPrefixRepromptsWithoutAdvancing` records `app_name: "Ops bot"` while `s.createBodies[0] == manifest.YAML()` is asserted in `TestFreshRunCompletesFourStepsAndRecordsBothTokens:111`; nothing in the diff substitutes the name into the manifest. The commit body records the decision to send `manifest.YAML()` verbatim, which the epic plan fixes as a contract (`04-epic-plan...md:27`) and acceptance criterion 1 restates, but the output line is not part of that contract.
- fix direction: Keep sending `manifest.YAML()` verbatim (the option `task.md` and the epic contract require). Make the line true: print the id and the manifest's name, for example `Created app <id> (Slack shows it as slack-coordinator); recorded as <name>.`, or drop the name from the line, and add one assertion on the output to `TestFreshRunCompletesFourStepsAndRecordsBothTokens`. Whether the prompted name should replace `display_information.name` in the sent manifest is an epic-level contract change for `onboard-existing-updates-an` or the docs child to raise; note it in the fix artifact rather than changing the wire body here.

## Advisories

### ADV-001 `golang.org/x/term` is a direct import marked `// indirect`

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `tools/slack-coordinator/go.mod:23`
- evidence: `internal/cli/onboard.go:13` imports `golang.org/x/term`; `go mod tidy -diff` moves the requirement into the direct block. Build and tests pass because the module is present; the marker is wrong, not the version.
- suggestion: Run `go mod tidy` in `tools/slack-coordinator` and commit the `go.mod` change.

### ADV-002 A negative `step` in `onboard.json` panics instead of failing

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `tools/slack-coordinator/internal/onboard/steps.go:88-98`, `checkpoint.go:29-42`
- evidence: `Checkpoint{Step: -1}` gives `start == 0`; the loop calls `steps[0].run`, which is nil (`steps.go:69`), and `Run` panics with `invalid memory address or nil pointer dereference` (reproduced with a throwaway test). `Step: -2` indexes out of range. The file is owner-only and written by this tool, so the input is a hand edit or corruption, not an attacker.
- suggestion: In `LoadCheckpoint`, reject `Step < 0` with `"<path>: step %d out of range"` so the CLI exits 2 with a message; `Step` beyond the table already ends the loop without running anything.

### ADV-003 A failed browser open ends the walkthrough although the URL was printed for that case

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `tools/slack-coordinator/internal/onboard/steps.go:203-210`, `internal/cli/onboard.go:25-39`
- evidence: `open` prints `Opening <url>` "so a headless terminal still has it" and then returns the `OpenURL` error, which `runStep` turns into `install app: open <url>: ...` and the CLI into exit 2. On a Linux host without `xdg-open`, or on any other GOOS (`no browser opener on %s; visit the URL by hand`), every re-run stops at step 3 with the checkpoint at `step: 2`; the user cannot reach the bot-token prompt. `task.md` defines `OpenURL` as returning an error and does not ask for a fallback, so the current behavior is within the request.
- suggestion: Treat an opener failure as a warning (`could not open a browser (<cause>); open the URL above by hand`) and continue to the prompt, or leave as is and let the docs child document the `xdg-open` requirement.

### ADV-004 `invalid_auth` is detected by error-string suffix

- type: Refactor suggestion
- severity: minor
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/onboard/steps.go:154`; `internal/slackapi/client.go:177-182`
- evidence: `createApp` runs `strings.HasSuffix(err.Error(), "invalid_auth")` against an error `postManifest` formats as `fmt.Errorf("%s: %s", method, body.Error)`. Any rewording in `slackapi` silently turns the fixed rejected-token line back into `create app: apps.manifest.create: invalid_auth`. The TDD table names `invalid_auth` on `apps.manifest.*` as the trigger (`03-tdd...md:479`), so the coupling is intended but untyped.
- suggestion: Add a typed error in `slackapi` (for example `type APIError struct{ Method, Code string }` returned from `postManifest`) and match with `errors.As` and `Code == "invalid_auth"`. `onboard-existing-updates-an` will need the same check for `apps.manifest.update`, so the typed error pays for itself in the next child.

## Dead Code and Dependency Review

- newly orphaned code: none. `newSetup` remains registered beside `newOnboard` (`root.go:39`); the epic keeps `setup` until a later child. `Flags.NoService` is parsed and unread by design for this child.
- dependency findings: `golang.org/x/term v0.36.0` (BSD-3, maintained by the Go team, already an indirect dependency through `golang.org/x/sys v0.42.0`) is the right tool for no-echo secret input; no stdlib equivalent. Marker fix in ADV-001. `go.sum` gains its two lines. No other dependency changes.

## Verdict

- decision: request_changes
- overall code-health change: improves. The package boundary the TDD fixes exists, every acceptance criterion has a test that fails on the plausible regression, and the secret-handling invariant (configuration token never on disk) is enforced by the type and asserted twice.
- rationale: CR-001 prints a false statement to the user on every run and records an `app_name` that does not match the app; the fix is a one-line output change plus an assertion and stays inside the epic's manifest contract. The advisories are optional in the fix round.

## Review Limits

- blocked or unavailable checks: none; the typed judgment ran once and reported every axis covered
- residual manual verification: no run against real Slack; the browser-open path (`open`/`xdg-open`) and the `term.ReadPassword` path run only when stdin is a terminal, which the tests bypass by piping stdin.
