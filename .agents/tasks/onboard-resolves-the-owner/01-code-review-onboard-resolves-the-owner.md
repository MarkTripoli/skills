---
type: code-review
date: 2026-09-22
branch: onboard-resolves-the-owner
base_branch: epic-slack-assistant-bot-dms
base_sha: da39e897228eb829509761cb8c5c1027f8751460
head_sha: dcf20ba9a1b30c8115b1b273e1c6b7957210548a
status: clean
summary: "First round over the one code commit adding onboard steps 5 (owner) and 6 (write config and start), the CLI wiring, config.Read, and the shared startDetachedDaemon. Every acceptance criterion holds against the diff and its tests; go build, go test -count=1 ./internal/onboard ./internal/cli ./internal/config, and go vet on those packages pass. No critical or major findings; three advisories (service platform resolved after config.yaml is written, Slack not-found codes matched by error-string suffix, and step 6 rewriting the file with defaults materialized and comments dropped). Next phase: describe the pull request."
---

# Code Review

## Scope

- merge base: `da39e897228eb829509761cb8c5c1027f8751460` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists yet, so `gh pr view` does not apply)
- reviewed HEAD: `dcf20ba9a1b30c8115b1b273e1c6b7957210548a`
- commits: `dcf20ba feat(slack-coordinator): resolve the owner and write config in onboard` (the only commit after the merge base)
- staged and unstaged changes: none (`git status --short --branch` shows a clean tree on `onboard-resolves-the-owner`)
- task-owned untracked files: none
- excluded changes: none; `.agents/tasks/onboard-resolves-the-owner/task.md` is committed on the epic branch and is not a review subject

Reviewed files (581 insertions, 80 deletions): `tools/slack-coordinator/internal/onboard/{steps.go,onboard_test.go}`, `internal/cli/{onboard.go,onboard_test.go,daemon.go,setup.go}`, `internal/config/{config.go,config_test.go}`.

The user asked for manual mode with implementation before review. The implementation commit already existed at HEAD when this session started; the review confirmed it complete against `task.md` (every named `Deps` field, both steps, the closing line, the CLI wiring, and every named test exist) and did not add code.

## Previous Round

- previous artifact: none

None.

## Requirements and Standards

- task or ticket: `.agents/tasks/onboard-resolves-the-owner/task.md` (issue #52, oneshot child of `slack-assistant-bot-dms`, depends on `onboard-creates-the-slack`, merged as #80); five acceptance criteria decided under Correctness
- implementation source: no plan artifact in the task directory (legacy task, no `index.json`); the epic plan child entry `.agents/tasks/slack-assistant-bot-dms/04-epic-plan-slack-assistant-bot-dms.md:473-488` carries the same prompt and criteria as `task.md`
- repository instructions: `AGENTS.md` (commits per `scripts/check-commits.mjs`); `task.md` names the proof as `go test ./internal/onboard ./internal/cli ./internal/config` and excludes formatters, linters, and `npm test`. Docs and the `.changeset/` entry belong to the epic's last child (`04-epic-plan-...md:523-542`), so their absence here is by design.

## Change Profile

- intent and expected behavior: after the four token steps, `onboard` asks for the owner by email or `U…`/`W…` id, resolves it with the bot token, confirms `Owner: <name> (<id>). Correct? [Y/n]`, records both at `step: 5`, then checks the bot token with `auth.test` and the app token with `apps.connections.open`, writes `config.yaml` (0600) replacing only the three `slack` keys of any existing file, installs the user service (or with `--no-service` starts the daemon detached and says it lasts until logout), records `step: 6`, and prints `Setup written; verification arrives in a later change.`
- change description quality: `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD` reports `ok: 1 subject`. The body states the behavior and four decisions with reasons (both Slack not-found codes re-prompt; step 6 applies defaults and validates like `setup` so the files match; `config.Read` skips validation so a partial file survives; the re-exec moved into `startDetachedDaemon`) and closes with `Refs: #52`.
- implementation model and review model: implementation model not recorded in the commit; review model `anthropic/claude-fable-5-1`
- changed-line size and logical cohesion: about 660 changed lines, 411 of them tests; one feature (two walkthrough steps) plus the three refactors it needs (`config.Read`, `startDetachedDaemon`, the shared `newSlack` seam). Coherent; no split needed.
- resulting large-file concerns: none; `onboard_test.go` grows to 486 lines and `steps.go` to 346
- dependency or lockfile changes: none (`go.mod` and `go.sum` untouched)

## Tests Reviewed First

- behavior claimed by tests: `internal/onboard/onboard_test.go` scripts every `Deps` field and records the token each Slack call carried. `TestFreshRunCompletesSixStepsAndInstallsTheService` (192-243) proves a fresh run ends at `step: 6` with `owner_user_id`, `owner_display_name`, `service_installed`, one `lookupByEmail` with the bot token, the confirmation prompt text, `auth.test` with `xoxb-bot` and `apps.connections.open` with `xapp-app`, a 0600 `config.yaml` holding the three keys, one `InstallService` call and no `StartDaemon`. `TestOwnerByIDUsesUsersInfoWithTheBotToken` (245-258) proves the id path. `TestUnknownOwnerRepromptsWithoutWritingConfig` (260-281) feeds `users_not_found`, a malformed id (which must not reach Slack), and `user_not_found` before a valid id: four prompts, three refusals, one save. `TestDecliningTheOwnerReprompts` (283-299) answers `n` and proves the second owner lands in both files. `TestWriteConfigKeepsAnExistingAgentBlock` (301-320) seeds `agent`, `retention`, and old `slack` keys and proves the slack keys are replaced while `agent.command`, `extra_dirs`, `retention.days: 90`, `consumed_days: 3` survive. `TestNoServiceStartsTheDaemonInstead` (322-342) proves `StartDaemon` once, `InstallService` never, the logout sentence, `step: 6`, and no `service_installed` key. `TestAuthTestFailureLeavesStepFiveWithoutConfig` (344-361) proves the `write config and start: ` prefix, `step: 5` with the owner recorded, no `config.yaml`, and no probe, install, or start. `internal/cli/onboard_test.go` `TestOnboardWritesTheConfigSetupWritesAndInstallsTheService` (80-160) runs `setup --owner U0CLI` and a scripted `onboard` into two homes against one fake Slack, asserts each of `auth.test` and `apps.connections.open` saw the token twice, `users.info` once with the bot token, the confirmation line, the closing line, `launchctl load -w <plist>`, byte-equal `config.yaml` files, mode 0600, and the checkpoint contents. `internal/config/config_test.go` `TestReadKeepsPartialFilesAndReportsAbsence` (57-69) proves `Read` returns `nil, nil` for an absent file and hands a bare `agent:` block back without defaults.
- missing or misleading coverage: no test for a `ProbeSocketMode` failure; it sits on the line after the tested `AuthTest` failure with the same shape (`steps.go:282-284`), and setup's message is reused. No test resumes from a `step: 5` checkpoint alone; `Run` treats step 6 like any other index and the step-2 and step-1 resume tests cover the loop. The tests read as their names say; `savedConfig` re-loads the written file through `config.Load`, so a file `setup`-era code could not read would fail every step-6 test.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `6428` in / `73` out. Two runs: the first on the draft, the second on the saved file after the helper lines were filled; both reported every axis `covered` with the same levels and confidences. Provenance line: `judge: model jev-1.13.0, tokens 6428 in / 73 out`

### Correctness

- assessment and evidence: All five acceptance criteria hold. (1) Owner prompt and record: `resolveOwner` prompts `Owner email or Slack user id`, routes `@` to `LookupUserByEmail` and `^[UW][A-Z0-9]+$` to `UserInfo` with `st.cp.BotToken` (`steps.go:228-271`), prompts `Owner: %s (%s). Correct? [Y/n]`, and records `OwnerUserID` and `OwnerDisplayName`; `Run` saves `step: 5` after the step returns (`steps.go:123-124`); proven by the fresh-run and by-id tests and by the CLI test's `onboard.json` assertion. Empty confirmation is `Y` (only a leading `n` re-prompts, `steps.go:246`). (2) Re-prompt without writing: a malformed id short-circuits to `errNoSuchUser` before Slack (`steps.go:264-265`), slack-go's `SlackErrorResponse.Error()` is the bare code (`slack@v0.29.0/misc.go`), so the `users_not_found`/`user_not_found` suffix match is exact for both wrapped and unwrapped forms; `continue` loops on either; `saves == 1` at the end. (3) Step 6: `AuthTest` then `ProbeSocketMode` with the checkpoint tokens, `LoadConfig` (nil when absent), the three `slack` keys assigned, `ApplyDefaults`, `Validate`, `SaveConfig` (0600 plus `Chmod`, `config.go:102-114`), `InstallService` sets `ServiceInstalled` (`steps.go:277-312`); `config.Read` keeps `Jira` and `Agent` pointers and `Retention` as written (`config.go:86-99`), so preserved keys survive; `daemon.Install` writes the definition and `launchctl load -w` / `systemctl enable --now` starts it (`daemon/service.go:161-203`). (4) `--no-service`: `StartDaemon` calls `startDetachedDaemon(out, daemon.DefaultStatusInterval)` (`cli/onboard.go:160`), the same function `daemon start` now calls (`cli/daemon.go:51-57`), then prints the logout sentence; `InstallService` is not reached. (5) Identical files: both commands start from an empty `Config`, set the same three keys, call `ApplyDefaults` and `Validate`, and `yaml.Marshal` the same struct; the CLI test compares the bytes. Failure paths: `AuthTest` failure returns `write config and start: bot token rejected by auth.test: <cause>` and leaves `step: 5` because `cp.Step` is assigned only after `runStep` returns; a `LoadConfig` parse error or a `Validate` failure on a pre-existing invalid `agent:` block stops at the same point with the cause named. `config.Load` keeps its message for an absent file (`config.go:74-76`; `TestLoadMissingFileNamesSetup`). `startDaemon` reads `--status-interval` before delegating, so `daemon start` is unchanged.
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: The two steps join the existing table with one line each (`steps.go:94-95`); `resolveOwner` is one loop with two `continue` points, and `lookupUser` isolates the routing and the not-found normalization (`steps.go:254-271`). `writeConfigAndStart` reads top to bottom in the order the task states, with the `--no-service` branch returning early. Names are exact (`errNoSuchUser`, `userIDPattern`, `startDetachedDaemon`, `config.Read`). Comments state behavior (`steps.go:222-223`, `config.go:84-85`, `cli/daemon.go:59-61`). `Flags` doc updated to say step 6 reads `NoService` (`steps.go:52-53`). The `newSlack` seam sits in `onboard.go` while `setup.go` also uses it; a package-level helper beside `loadConfig` in `runtime.go` would be the natural home (trivial, not raised). No dead code.
- helper coverage: covered, level 3, confidence 0.99

### Architecture

- assessment and evidence: Every new outside effect enters `internal/onboard` through a `Deps` function that takes the token it authorizes with (`steps.go:34-49`), so the walkthrough package still imports no CLI, daemon, or paths code, and the fakes assert tokens without a fake HTTP server. Three duplications were removed rather than added: `startDaemon`'s re-exec became `startDetachedDaemon(out, interval)` shared with `onboard --no-service` (`cli/daemon.go:59-104`); `config.Load` became `Read` plus defaults and validation (`config.go:69-99`); the two test URL seams collapsed into `slackAPIURL`/`newSlack` used by `setup` and `onboard` (`cli/onboard.go:23-33`, `setup.go:60`). `InstallService` reuses `service()` and `s.Install()` exactly as `service install` does (`cli/onboard.go:149-159`). No test calls `t.Parallel`, so the package-level seams cannot race. The one ordering difference from `setup`, which resolves the service platform before any Slack call, is ADV-001.
- helper coverage: covered, level 3, confidence 1.00

### Security

- assessment and evidence: `config.yaml` is written 0600 and chmodded (`config.go:110-113`); both step-6 tests assert the mode. The configuration token still never reaches disk (fresh-run and CLI tests check for `xoxe`). Owner input is bounded before it reaches Slack: an email goes as a form value the SDK encodes, an id must match `^[UW][A-Z0-9]+$`, anything else never leaves the process (`steps.go:259-266`). Output prints the config path and the owner display name and id, never a token; Slack's error strings are codes (`invalid_auth`), not secrets. `slackAPIURL` is unexported and set only by tests, so the redirect cannot be reached from a flag or environment variable. The bot and app tokens remain in `onboard.json` (0600) beside `config.yaml` after step 6; the verification child deletes the checkpoint on success (`04-epic-plan-...md:500`), so the duplicate lives only until that child lands. `startDetachedDaemon` appends to the daemon log with 0600 and passes the interval as a formatted duration, not user text.
- helper coverage: covered, level 3, confidence 0.99

### Performance

- assessment and evidence: Two prompts, at most three Slack calls per owner attempt (one lookup, then one `auth.test` and one `apps.connections.open`), one file read, one file write, one `exec`. `newSlack` builds a client per call (`cli/onboard.go:128-140`); each is a struct with an HTTP client and runs once per walkthrough, so the allocation is noise. `resolveOwner` loops only on user input and ends on EOF from `Prompt`. Nothing to measure.
- helper coverage: covered, level 3, confidence 0.97

## Verification Story

- command or inspection: in `tools/slack-coordinator`: `go build ./...`; `go test -count=1 ./internal/onboard ./internal/cli ./internal/config`; `go vet ./internal/onboard ./internal/cli ./internal/config`; `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD`; read of every changed file, `slackapi.toUser`/`LookupUserByEmail`/`UserInfo`, slack-go `SlackResponse.Err` and `SlackErrorResponse.Error`, `cli.service`, `cli.loadConfig`, `daemon.Service.Install`, `onboard.Checkpoint`
- result: build ok; `ok internal/onboard 0.296s`, `ok internal/cli 0.912s`, `ok internal/config 0.578s`; vet clean; commit check `ok: 1 subject`; `grep` finds no remaining `onboardAPIURL` or `Tokens saved to onboard.json`
- manual, screenshot, or before-and-after evidence: none needed for a terminal command whose output the CLI test captures end to end (`TestOnboardWritesTheConfigSetupWritesAndInstallsTheService`)

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Service platform is resolved after `config.yaml` is written

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `tools/slack-coordinator/internal/cli/onboard.go:149-159`, `internal/onboard/steps.go:297-310`
- evidence: `setup` calls `service()` before any Slack call so an unsupported platform exits 2 with no side effects (`setup.go:51-59`). `onboard` resolves it inside `InstallService`, after `SaveConfig`; on an unsupported `GOOS` the run writes `config.yaml`, fails with `write config and start: <unsupported platform>`, and leaves `step: 5`, so every re-run repeats `auth.test`, the probe, and the write before failing the same way until the user adds `--no-service`.
- suggestion: in `newOnboard`'s `RunE`, when `!flags.NoService`, call `service()` once before `onboard.Run` and return its error; keep `InstallService` as is.

### ADV-002 Slack not-found codes recognized by error-string suffix

- type: Refactor suggestion
- severity: info
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/onboard/steps.go:267`
- evidence: slack-go returns `SlackErrorResponse` whose `Error()` is the bare code (`slack@v0.29.0/misc.go`), and `internal/slackapi` returns it unwrapped (`client.go:105-121`), so `HasSuffix(err.Error(), "users_not_found")` and `"user_not_found"` are correct today; the fakes pin both strings. The previous child's fix round declined a typed `slackapi` error for the same reason (`internal/slackapi` is outside these children's packages) and assigned it to the `--existing` child (`onboard-creates-the-slack/03-code-review-*.md`, ADV-003).
- suggestion: none for this child; when the `--existing` child adds the typed Slack error, `lookupUser` switches to `errors.As` beside `createApp`.

### ADV-003 Step 6 rewrites the whole file: defaults become explicit, comments are dropped

- type: Nitpick
- severity: info
- category: Data integrity and integration
- location: `tools/slack-coordinator/internal/onboard/steps.go:293-297`, `internal/config/config.go:102-114`
- evidence: `ApplyDefaults` fills `retention.days: 30`, `consumed_days: 7`, and `agent.approval`, `timeout`, `max_runs_per_hour` on the loaded struct, and `yaml.Marshal` writes the struct, so a hand-written file gains explicit default values and loses comments and key order. Values are identical under `config.Load`; `setup` has always written this way; `task.md` requires equality with `setup`, which needs the defaults applied.
- suggestion: none; the docs child can state that `onboard` and `setup` rewrite `config.yaml` from its parsed content.

## Dead Code and Dependency Review

- newly orphaned code: none. `onboardAPIURL` was renamed, not left behind; `setup.go` dropped its direct `slackapi` import when it moved to `newSlack`; `startDaemon` still owns the `--status-interval` flag and delegates the rest. `Flags.Existing` remains parsed and rejected with `not implemented yet` for the `--existing` child.
- dependency findings: none; `go.mod` and `go.sum` unchanged.

## Verdict

- decision: approve
- overall code-health change: improves. The walkthrough reaches a working daemon with every effect behind a token-carrying `Deps` function, three pre-existing duplications (detached start, config parse, Slack test seam) collapsed into one owner each, and each acceptance criterion has a test that fails on the plausible regression (wrong token on a call, config written before the owner resolved, service installed under `--no-service`, config written after a rejected bot token, `setup` and `onboard` files diverging).
- rationale: no critical or major finding in the pinned scope; the three advisories are optional and do not change behavior the acceptance criteria name.

## Review Limits

- blocked or unavailable checks: none; the typed judgment ran once and reported every axis covered
- residual manual verification: no run against real Slack, launchd, or systemd; `startDetachedDaemon` re-execs the binary and is exercised only by `daemon start` by hand, since the CLI test injects a recording executor for the service path and the onboard tests replace `StartDaemon` with a counter.
