---
type: code-review-fixes
date: 2026-09-22
branch: onboard-creates-the-slack
review_artifact: 01-code-review-onboard-creates-the-slack.md
reviewed_head_sha: 7ac9337faf066e575fc0f791031aef3505781c1b
fixed_head_sha: 5999460250bb6692b5fb45e1ffe2b74a97b45e9d
status: complete
summary: "CR-001 fixed: createApp now prints `Created app <id> from the embedded manifest; recorded as \"<name>\".` and manifest.YAML() still goes on the wire verbatim. ADV-001 (go mod tidy), ADV-002 (negative step rejected on load), and ADV-003 (opener failure warns and continues) accepted; ADV-004 (typed invalid_auth error) left advisory because it changes internal/slackapi, outside this child's packages, and belongs with the update call the next child adds. Gates: go build ./..., go test ./internal/onboard ./internal/cli both ok; check-commits ok: 3 subjects."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: base `0c80de9ac7d53af3a4d99480caa32377e74771e8` (`epic-slack-assistant-bot-dms`) unchanged. Head moved from `7ac9337` to `0702601` by the review's own artifact commit (`docs(task): code-review artifact`) before this round; the code diff the review read was unchanged when the fixes started. Fixes commit `5999460 fix(slack-coordinator): make the onboard created line true` is the new head.
- unrelated changes preserved: none existed; `git status --short --branch` showed a clean tree before and after the fix commit.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-001

- disposition: fixed
- evidence: reproduced before the change: `TestFreshRunCompletesFourStepsAndRecordsBothTokens` with the new output assertion failed on `Created Slack assistant (A0EXAMPLE).` while `s.createBodies[0] == manifest.YAML()` held, so the line named an app Slack never created. `createApp` now prints `Created app %s from the embedded manifest; recorded as %q.` with the id first and the prompted name attributed to the checkpoint only (`tools/slack-coordinator/internal/onboard/steps.go:163`); the wire body is still `manifest.YAML()` (`steps.go:155`), per `task.md` acceptance 1 and the epic contract. The manifest's `display_information.name` is not repeated in the line so a manifest rename cannot make it false again. Decision recorded for the epic: whether the prompted name should replace `display_information.name` in the sent manifest is a contract change for `onboard-existing-updates-an` or the docs child to raise; this round keeps the contract and makes the line true.
- files changed: `tools/slack-coordinator/internal/onboard/steps.go`, `tools/slack-coordinator/internal/onboard/onboard_test.go`
- regression check: `TestFreshRunCompletesFourStepsAndRecordsBothTokens` asserts the output contains `Created app A0EXAMPLE` and not `Created Slack assistant` (`onboard_test.go:120-122`); fails on the pre-fix source (stash run), passes after.

## Advisory Decisions

### ADV-001

- disposition: accepted
- reason: `golang.org/x/term` is imported directly by `internal/cli/onboard.go`; `go mod tidy` moved it to the direct block (`go.mod`, one line changed). No version change; `go.sum` untouched.

### ADV-002

- disposition: accepted
- reason: `LoadCheckpoint` rejects `Step < 0` with `<path>: step %d out of range` (`checkpoint.go:42-44`), so the CLI exits 2 with a message instead of `Run` calling `steps[0].run == nil`. `TestLoadCheckpointRejectsNegativeStep` writes `{"step": -1}` and expects the error; it failed pre-fix (returned the struct with `Step:-1`) and passes after. Steps beyond the table already end the loop without running anything and stay untouched.

### ADV-003

- disposition: accepted
- reason: `task.md` is silent on opener failures and the URL is printed before the opener runs; ending the walkthrough there left Linux hosts without `xdg-open` and every other GOOS unable to reach the bot-token prompt on any re-run. `open` now prints `Could not open a browser (<cause>); open the URL above by hand.` and returns nothing; `installApp` and `appLevelToken` proceed to the prompt (`steps.go:174`, `186`, `206-214`). `TestBrowserOpenFailureWarnsAndContinuesToThePrompt` scripts an opener that fails, expects the walkthrough to finish at `step: 4` with both tokens and the warning in the output; it failed pre-fix with `install app: open ...: exec: "xdg-open": executable file not found` and passes after. The CLI's `openBrowser` error text (`no browser opener on %s; visit the URL by hand`) is unchanged and now reaches the user as the cause inside the warning.

### ADV-004

- disposition: left_advisory
- reason: the typed error lives in `internal/slackapi`, which this child does not own (`task.md` names `internal/onboard` and `internal/cli`; proof is `go test ./internal/onboard ./internal/cli` only). `onboard-existing-updates-an` adds `apps.manifest.update` and needs the same `invalid_auth` check, so the typed `APIError` and its `errors.As` match are best introduced there once and used by both call sites. The string-suffix check stays with `TestInvalidAuthNamesTheExpiredConfigurationToken` guarding the fixed line.

## Verification

- command: `go mod tidy` (in `tools/slack-coordinator`), then `go build ./...`, then `go test ./internal/onboard ./internal/cli`
- result: `go.mod` changed by one line (`golang.org/x/term` marker); build ok; `ok internal/onboard 0.280s`, `ok internal/cli 0.858s`
- command: `git stash push -- internal/onboard/steps.go internal/onboard/checkpoint.go && go test ./internal/onboard` (pre-fix source, new tests), then `git stash pop`
- result: three failures, `TestFreshRunCompletesFourStepsAndRecordsBothTokens`, `TestBrowserOpenFailureWarnsAndContinuesToThePrompt`, `TestLoadCheckpointRejectsNegativeStep`, each on the assertion the fix targets; the package passes with the fix restored
- command: `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD`
- result: `ok: 3 subjects` (the first attempt's 85-character subject was rejected by the hook and rewritten before committing)
- not run: the full `npm test`, formatters, and linters, per `task.md`; no run against real Slack, so the `open`/`xdg-open` and `term.ReadPassword` paths remain exercised only through the scripted `Deps` and piped stdin

## Remaining Blocks

- None.
