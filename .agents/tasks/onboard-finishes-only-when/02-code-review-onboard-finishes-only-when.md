---
type: code-review
date: 2026-09-22
branch: onboard-finishes-only-when
base_branch: epic-slack-assistant-bot-dms
base_sha: 4b632ce1d6b8b1da71a0b09067f70729a4c1e691
head_sha: b6f2567649fa5bcfed2677895b6cbc6191ee2676
status: findings
summary: "Reviewed the one feat commit that adds assistant.verify_owner, the owner-reply routing, onboard step 7/8, the timeout hints, and repair mode (14 Go files, 4 packages green under -race). Two major findings: repair's token replacement restarts the daemon through a service relaunch that the systemd unit (Restart=on-failure) never performs after a clean shutdown, so on Linux the new token is written and the daemon stays down; and a pending verification outlives a disconnected onboard client because the IPC server never cancels a handler when its peer closes, so for up to 120 s re-verify is refused and one owner DM is consumed without a request. The fix round must make restartDaemon relaunch on both platforms and cancel the request context on peer disconnect (or let a new verify_owner supersede the stale one)."
---

# Code Review

## Scope

- merge base: `4b632ce1d6b8b1da71a0b09067f70729a4c1e691` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists for this branch)
- reviewed HEAD: `b6f2567649fa5bcfed2677895b6cbc6191ee2676`
- commits: `6546687 feat(slack-coordinator): finish onboard by verifying the owner over DM`; `b6f2567 docs(task): commit artifact`
- staged and unstaged changes: none (`git status --short --branch` clean)
- task-owned untracked files: none
- excluded changes: `.agents/tasks/onboard-finishes-only-when/01-commit-onboard-finishes-only-when.md` (task artifact, read as evidence only)

Reviewed files (`git diff --name-status 4b632ce...HEAD`, 14 code files, +971/-115): `internal/ipc/protocol.go`, `internal/assistant/{verify.go,verify_test.go,service.go,router.go,requests_test.go}`, `internal/daemon/daemon.go`, `internal/cli/{runtime.go,daemon.go,onboard.go,onboard_test.go,run_start_test.go}`, `internal/onboard/{steps.go,onboard_test.go}`, all under `tools/slack-coordinator/`.

## Previous Round

- previous artifact: none
- `None.`

## Requirements and Standards

- task or ticket: `.agents/tasks/onboard-finishes-only-when/task.md` (oneshot child of `slack-assistant-bot-dms`, issue #56). Five acceptance criteria, decided below.
- implementation source: none (oneshot; `01-commit-onboard-finishes-only-when.md` records the decisions taken).
- repository instructions: repo `AGENTS.md` (skip formatters, linters, and `npm test`; the task names `go test -race ./internal/assistant ./internal/onboard ./internal/cli ./internal/ipc` as proof). Go package conventions in `tools/slack-coordinator` (doc comment per exported symbol, `ExitCodeError` exit codes, fake Slack surfaces in tests) are followed.

Acceptance criteria against the diff:

1. `assistant.verify_owner` opens the owner DM, posts the fixed text, blocks for a later top-level owner DM, returns `{ok, display_name}`: met. `verify.go:59-91` (`OpenConversation`, `PostMessage(dm, "", verifyText)`, select on `done`/timer/ctx), `router.go:110` consumes the answer, `TestVerifyOwnerResolvesOnTheOwnersAnswerWithoutARequest` and the end-to-end `TestOnboardWritesTheConfigInstallsTheServiceAndVerifiesTheOwner` (real daemon, real IPC, DM pushed through `Options.Inbound`) prove it.
2. The reply creates no `dm_requests` row, reaction, or ack: met. `routeDM` returns before `newRequest`/`followUp`; `verify_test.go:80-85` asserts no row, no reaction, no extra post.
3. Success prints display name and app name, deletes `onboard.json`, prints next steps, exit 0: met. `steps.go` `verifyOwner` prints `Verified: %s replied to %s.`, `finish` removes the checkpoint and prints step 8; the CLI test asserts `ExitOK`, the verified line, the closing line, and the absent checkpoint. Repair over a config with no checkpoint prints `Verified: %s replied.` because no app name is on record (see ADV-004).
4. Timeout → `{ok:false, timeout:true}`, exit 2, three hints in order, config/service/checkpoint kept: met. `VerifyOwnerResult{Timeout: true}` at `verify.go:88`; hints at `steps.go` `verifyOwner` in the acceptance order; `ErrVerifyTimeout` passes through `runStep` unwrapped and the command wraps every `Run` error in `usageErr` (exit 2, `exit.go:31`). `TestVerifyTimeoutPrintsHintsInOrderAndKeepsEverything` asserts order, step-6 checkpoint kept, config present, no uninstall/restart. Exit 2 is proven by composition (`TestOnboardManifestFailureExitsTwoAndKeepsStepOne` covers the wrapper), not by a timeout-specific CLI test.
5. `config.yaml` present and no `--existing` offers re-verify / reinstall service / replace one token and never calls `apps.manifest.create`: met on macOS; on Linux path [3] is broken after the token is written (CR-001). `Run` routes to `repair` when `cp.Step == 0 || cp.Step >= configStep` and the config holds a bot token; the four `TestRepair*` tests assert `createCalls == 0`.

## Change Profile

- intent and expected behavior: finish `onboard` with a live proof that the bot can DM the owner and receive the reply, add the daemon method and routing that make that possible, and turn a second `onboard` over an existing setup into a repair menu.
- change description quality: good. The commit subject stands alone; the body explains behavior, the thread-reply decision, why `users.info` runs on the waiter side, the repair trigger rule, and the token-restart rationale. `Refs: #56`. The commit artifact lists every file and every decision taken without asking.
- implementation model and review model: implementation model not recorded; review model `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: ~560 non-test lines plus ~530 test lines across 14 files. One feature (verify + repair) with its plumbing; the `stopDaemon`/`waitForDaemonExit` and `startTestDaemonWith`/`startTestDaemonAt` extractions are the minimal refactors the feature needs. No split required.
- resulting large-file concerns: `internal/onboard/steps.go` grows to 536 lines and `onboard_test.go` to ~670; both remain one topic (the walkthrough). No action.
- dependency or lockfile changes: none.

## Tests Reviewed First

- behavior claimed by tests:
  - `internal/assistant/verify_test.go`: resolution by a later top-level DM and by a thread reply (no row/reaction/ack, slot released, display name `ada`); an older-ts DM is routed as an ordinary request and does not resolve; a 20 ms injected timeout returns `{timeout}`, releases the slot, and a late DM becomes a request; a second waiter gets `errVerifyPending`. The helper `startVerify` waits under `verifyMu` for `verify.ts != ""`, which also gives the race detector a happens-before edge for the fake's `opened`/`posts` slices.
  - `internal/onboard/onboard_test.go`: fresh run reaches step 7 and verifies; timeout prints the three hints in order, keeps step 6, config, and service; repair [1]/[2]/[3] with `createCalls == 0`, `[3]` restarts and rejects a bad token without writing; `TestMidWalkthroughResumeKeepsAnExistingAgentBlock` pins that a step-4 checkpoint is not offered repair.
  - `internal/cli/onboard_test.go`: end-to-end against an in-process daemon: `conversations.open`, the exact `chat.postMessage` form, owner DM injected after the post, `users.info` called by both onboard and the daemon, `launchctl load -w`, checkpoint removed, exit 0.
- missing or misleading coverage:
  - `cli.restartDaemon` (`cli/daemon.go:166-185`) has no test at any level; `TestRepairReplacesOneTokenAndRestartsTheDaemon` exercises the fake `RestartDaemon`, so the Linux relaunch defect in CR-001 is unobserved.
  - No test disconnects the IPC client mid-verify; CR-002's leak is unobserved.
  - The timeout exit code 2 is asserted only through `ErrVerifyTimeout` plus the shared wrapper test (acceptable; noted for completeness).

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `6624` in / `73` out (stderr: `judge: model jev-1.13.0, tokens 6624 in / 73 out`)

### Correctness

- assessment and evidence: The verify state machine is sound: one slot under `verifyMu`, `ts` set only after `chat.postMessage` returns so an earlier DM cannot match (`verify.go:124`), `done` closed exactly once by `resolveVerify` under the same mutex, and the timer path re-checks `done` after clearing the slot so a reply that races the timer still counts (`verify.go:81-89`). Slack `ts` values are fixed-width `seconds.micros`, so `msg.TimeStamp > ts` orders correctly. `routeDM` only receives `D`-channel messages from `s.Owner`, so the answer cannot come from another channel. Two defects: `restartDaemon` assumes an installed service relaunches after `daemon.shutdown`, which the generated systemd unit (`Restart=on-failure`, `daemon/service.go:105`) does not do after `Serve` returns nil (`daemon.go:193-196`), see CR-001; and a verification pending in the daemon survives the CLI's disconnect because `ipc.Server.handleConn` dispatches synchronously and only cancels the request context on server shutdown (`ipc/server.go:114-143`), see CR-002. `WaitDaemon` ignores its context (ADV-002).
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: Names are precise (`pendingVerify`, `resolveVerify`, `answersVerify`, `clearVerify`, `verifyStep`, `repairMenu`). `Run` keeps the repair decision at the top and reuses `runStep(verifyStep)` and `finish` on both paths, so there is one verification code path. `promptChoice` collapses the two menus. The doc comments on `Run`, `steps`, and `VerifyOwner` state the invariants (never checkpoint step 7; `ts` empty until posted). No dead branches; `flags.Existing` in `Run` is redundant with the command's early return but harmless and documents intent.
- helper coverage: covered, level 3, confidence 0.98

### Architecture

- assessment and evidence: The daemon owns the wait (`assistant.VerifyOwner`), the CLI owns the deadline (`verifyOwnerDeadline = 130 s` over the existing `ipc.Client.CallWithContext`; no new client method), and `onboard.Deps` keeps the walkthrough free of IPC and service types beyond `ipc.VerifyOwnerResult`. `SlackSurface` grows by the two methods the feature needs. `restartDaemon` couples the CLI to supervisor relaunch semantics it does not control (CR-001); reusing the `UninstallService`/`InstallService` pair that `[2]` already uses would remove that coupling. The IPC server's lack of peer-disconnect cancellation was latent before this change because every handler returned promptly; the first long-blocking method exposes it (CR-002), so the fix belongs in `ipc.Server`, not in `assistant`.
- helper coverage: covered, level 3, confidence 0.99

### Security

- assessment and evidence: The new method takes no parameters and acts only on the configured owner, so no caller-supplied identifiers reach Slack. It is reachable by any local process that can open the socket, the same trust boundary as `daemon.shutdown` and `run.*`; its only effect is one DM to the owner and a two-minute wait, and a second caller is refused. Tokens entered in repair go through the existing `promptToken` and are validated against Slack before `SaveConfig` writes them (0600 preserved by `config.Save`); the configuration token is never involved. `onboard.json` may retain a replaced bot token until the run succeeds (ADV-003, trivial: the file is already 0600 and already holds the live token).
- helper coverage: covered, level 3, confidence 0.95

### Performance

- assessment and evidence: One goroutine per blocked IPC connection for at most 120 s; `daemon.health` on a separate connection is unaffected because `ServeReady` spawns one `handleConn` per connection. `resolveVerify` is a mutex acquire plus two string compares on every owner DM, negligible. `waitForDaemonExit`/`waitForDaemon` poll at 25 ms with bounded deadlines. No new allocations in hot paths.
- helper coverage: covered, level 3, confidence 0.96

## Verification Story

- command or inspection: `cd tools/slack-coordinator && go build ./... && go vet ./internal/assistant ./internal/onboard ./internal/cli ./internal/ipc && go test -race -count=1 ./internal/assistant ./internal/onboard ./internal/cli ./internal/ipc`
- result: build and vet clean; `ok internal/assistant 2.416s`, `ok internal/onboard 1.323s`, `ok internal/cli 2.528s`, `ok internal/ipc 1.906s`.
- manual, screenshot, or before-and-after evidence: none; the surface is a CLI and daemon, and the end-to-end CLI test runs the real daemon and IPC in-process. Formatters, linters, and `npm test` were not run, per the task.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 restartDaemon leaves the daemon down on Linux after a token replacement

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `tools/slack-coordinator/internal/cli/daemon.go:166-185`; `tools/slack-coordinator/internal/daemon/service.go:105`
- failure mode: Repair path `[3] replace a token` writes the new token, then `restartDaemon` sends `daemon.shutdown`, waits for the socket to close, and, because the service is installed, waits 15 s for the supervisor to relaunch the daemon. On Linux the generated unit has `Restart=on-failure`; a shutdown-initiated exit returns nil from `daemon.Serve` (`daemon.go:193-196`) and exit 0 from `daemon serve`, so systemd does not restart it. `restartDaemon` returns `the service did not relaunch the daemon`, `repair` returns `replace token: ...`, exit 2, and the user is left with a rewritten `config.yaml` and no running daemon; step 7 never runs. macOS works only because the plist sets `KeepAlive true`.
- evidence or reproduction: `restartDaemon` branches on `s.Installed()` and calls `waitForDaemon(15*time.Second)` with no launch of its own; `service.go:105` `Restart=on-failure`; `service_test.go:39` pins that string. `TestRepairReplacesOneTokenAndRestartsTheDaemon` uses the `script` fake's `RestartDaemon`, so nothing exercises the real function.
- fix direction: Make `restartDaemon` own the relaunch on both platforms: after the shutdown wait, when the service is installed, run the same `Uninstall`+`Install` pair `reinstallService` uses (or add a `Service.Restart` that issues `launchctl kickstart -k` / `systemctl --user restart`), and keep the detached start for the no-service case. Alternatively change the systemd unit to `Restart=always` and the plist relaunch throttle note accordingly, but that also changes `daemon stop` semantics on Linux, so prefer the explicit restart. Add a CLI-level test with `injectService(t, "linux")` that records the executed commands.

### CR-002 A pending verification outlives a disconnected onboard client

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/slack-coordinator/internal/ipc/server.go:114-143`; `tools/slack-coordinator/internal/assistant/verify.go:25,51-53,77-80`
- failure mode: `handleConn` runs `dispatch` synchronously on the connection goroutine and cancels the request context only when the server shuts down, so when the `onboard` process exits during step 7 (Ctrl-C while waiting, or the 130 s client deadline), the daemon's `VerifyOwner` keeps its slot for the rest of the 120 s window with nobody to receive the result. During that window (a) a re-run of `onboard` → `[1] re-verify` fails with the RPC error `a setup verification is already waiting for the owner's reply` (exit 2, none of the hints), and (b) the owner's next top-level DM of any content is consumed by `resolveVerify` without a `dm_requests` row, reaction, or ack, so one owner request is silently lost.
- evidence or reproduction: `server.go:125-143` loops `scanner.Scan()` → `dispatch` → `Encode`; EOF is only observed after `dispatch` returns. `verify.go:79` selects on `ctx.Done()`, but that context (`server.go:114-123`) is cancelled solely by `s.done`. `verify.go:51-53` refuses a second waiter while the stale one holds the slot. No test disconnects the client mid-verify.
- fix direction: In `ipc.Server.handleConn`, read lines in a separate goroutine feeding a channel and cancel `ctx` when the reader hits EOF or an error, so a blocked handler ends when its peer disconnects (requests on one connection are already serialized by the client, so reading ahead is safe). Then `VerifyOwner` returns `ctx.Err()` and its deferred `clearVerify` frees the slot. As a belt-and-braces measure, let a new `VerifyOwner` supersede a pending one (close the old `done` with a superseded marker so the old waiter returns an error) instead of refusing. Add an assistant test that cancels the first waiter's context and asserts the slot is released and the next owner DM becomes a request.

## Advisories

### ADV-001 A `!` verb from the owner is not accepted as the verification answer

- type: Nitpick
- severity: info
- category: Functional correctness
- location: `tools/slack-coordinator/internal/assistant/router.go:105-111`
- evidence: `routeDM` checks the `!` prefix before `resolveVerify`, so an owner who answers the setup DM with `!help` gets the verb reply and verification keeps waiting. The commit artifact records this as a deliberate reading of the task's "before `newRequest`" placement.
- suggestion: None required; if a future report shows owners answering with a verb, move the `resolveVerify` case above the `!` case.

### ADV-002 `WaitDaemon` ignores its context

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/cli/onboard.go:182`
- evidence: `WaitDaemon: func(context.Context) error { return waitForDaemon(5 * time.Second) }` accepts a context and discards it; a cancelled onboard still polls for up to 5 s.
- suggestion: Either drop the parameter from `Deps.WaitDaemon` or thread it into a context-aware poll.

### ADV-003 Repair keeps a replaced token in `onboard.json` until success

- type: Nitpick
- severity: trivial
- category: Security and privacy
- location: `tools/slack-coordinator/internal/onboard/steps.go:468`
- evidence: `replaceToken` updates `st.cp.BotToken` in memory but the on-disk step-6 checkpoint is not rewritten; on a verification timeout the file still holds the old token (mode 0600, same as `config.yaml`). Repair reads tokens from `config.yaml`, so behavior is unaffected.
- suggestion: Save the checkpoint after a successful `SaveConfig`, or drop tokens from the checkpoint once `config.yaml` holds them.

### ADV-004 Repair without a checkpoint cannot print the app name

- type: Nitpick
- severity: info
- category: Functional correctness
- location: `tools/slack-coordinator/internal/onboard/steps.go` (`verifyOwner`, the `Verified:` lines)
- evidence: The app name lives only in `onboard.json`; `config.yaml` has none, so repair over a config with no checkpoint prints `Verified: ada replied.` while acceptance criterion 3 names the app. The walkthrough path always has it.
- suggestion: Accept as-is, or have the daemon return the app name from `auth.test` in `VerifyOwnerResult` so both paths print it.

## Dead Code and Dependency Review

- newly orphaned code: none. The removed `Setup written; verification arrives in a later change.` line and the step-6 `--no-service` closing line have no remaining references; `Deps.StartDaemon` is still used by the `--no-service` walkthrough; `ipc.VerifyOwnerParams` is used by the CLI call; `waitForDaemonExit` is used by both `stopDaemon` and `restartDaemon`.
- dependency findings: none (no `go.mod`/`go.sum` change).

## Verdict

- decision: request_changes
- overall code-health change: positive once the two findings are fixed; the verify slot, routing precedence, and repair flow are well-factored and thoroughly tested at the unit and end-to-end levels.
- rationale: Acceptance criteria 1 to 4 are met and proven by tests. Criterion 5's token-replacement path fails on Linux after writing the token (CR-001), and the new long-blocking IPC method exposes a request-lifecycle gap that refuses re-verify and drops one owner DM for up to two minutes after an interrupted onboard (CR-002). Both are bounded, task-caused, and have concrete fixes.

## Review Limits

- blocked or unavailable checks: none. The typed-judgment helper ran once (`node skills/delivery/typed-judgment/judge.mjs axis-coverage <this file> --json`, exit 0) and returned `covered` at level 3 on all five axes, so no second run was needed.
- residual manual verification: no real launchd or systemd relaunch was exercised (tests inject a fake service executor); CR-001 rests on the unit text and `daemon.Serve`'s nil return, not on a live systemd run. No live Slack workspace was used.
