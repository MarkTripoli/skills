---
type: commit
summary: "One feat commit adds IPC assistant.verify_owner, the owner-reply routing that resolves it, onboard step 7 (verify), step 8 (next steps), the timeout hints, repair mode over an existing config.yaml, and the tests for each; nothing was left unstaged."
---

# Commit Receipt

## Task
- slug: onboard-finishes-only-when
- implementation artifact: none (oneshot; implemented in the deliver session)

## Git State
- branch: onboard-finishes-only-when
- before: 4b632ce
- after: 6546687

## Commits
- hash: 6546687
- subject (Conventional Commits, validated): `feat(slack-coordinator): finish onboard by verifying the owner over DM`
- files:
  - tools/slack-coordinator/internal/ipc/protocol.go (`MethodAssistantVerifyOwner`, `VerifyOwnerParams`, `VerifyOwnerResult{ok, timeout, display_name}`)
  - tools/slack-coordinator/internal/assistant/verify.go (new: `Register`, `VerifyOwner`, `pendingVerify`, `resolveVerify`, `answersVerify`, 120 s default window)
  - tools/slack-coordinator/internal/assistant/verify_test.go (new)
  - tools/slack-coordinator/internal/assistant/service.go (`SlackSurface` gains `OpenConversation` and `UserInfo`; `verifyMu`, `verify`, `verifyTimeout`)
  - tools/slack-coordinator/internal/assistant/router.go (`routeDM` consumes the verification answer before `newRequest` and `followUp`)
  - tools/slack-coordinator/internal/assistant/requests_test.go (`fakeSlack` implements the two new methods)
  - tools/slack-coordinator/internal/daemon/daemon.go (`svc.Register(rt.Server)`)
  - tools/slack-coordinator/internal/cli/runtime.go (`callDaemonWithin`: per-call deadline over the existing `CallWithContext`)
  - tools/slack-coordinator/internal/cli/daemon.go (`waitForDaemonExit`, `restartDaemon`; `stopDaemon` reuses the exit wait)
  - tools/slack-coordinator/internal/cli/onboard.go (deps `UninstallService`, `RestartDaemon`, `WaitDaemon`, `VerifyOwner` at 130 s; closing line removed; help text)
  - tools/slack-coordinator/internal/cli/onboard_test.go (fake serves `conversations.open`, `chat.postMessage`; end-to-end run against an in-process daemon with `Options.Inbound`)
  - tools/slack-coordinator/internal/cli/run_start_test.go (`newTestHome`, `startTestDaemonAt` split out of `startTestDaemonWith`)
  - tools/slack-coordinator/internal/onboard/steps.go (step 7 `verifyOwner`, `finish`, `repair`, `reinstallService`, `replaceToken`, `promptChoice`, `ErrVerifyTimeout`; `Run` routes existing setups to repair)
  - tools/slack-coordinator/internal/onboard/onboard_test.go (script gains the daemon deps; verification, timeout, and repair tests; checkpoint assertions read the file as step 7 found it)

## Decisions taken without asking
- The verification answer is a top-level owner DM with `ts` later than the setup post (task.md) or a reply in that post's thread (the TDD's "reply under the verify DM"); Slack's reply affordance on a DM opens a thread, so both are accepted. A `!` verb during a pending verification still runs as a verb, per the task's "before `newRequest`" placement.
- `routeDM` only closes the pending verification's channel; `VerifyOwner` calls `users.info` after it wakes. A slow lookup on the inbound path could otherwise lose a reply that races the timer. A failed lookup logs a warning and reports the owner id as `display_name`.
- A second `assistant.verify_owner` while one waits returns an error rather than replacing the first: two waiters could not tell whose post a reply answers.
- `ipc.Client.CallWithContext` already takes a per-call deadline; the CLI adds `callDaemonWithin` on top instead of a second client method.
- Repair mode applies when `config.yaml` holds a bot token and the checkpoint is absent or at step 6 or later. A checkpoint at steps 1 to 5 resumes the walkthrough over any existing file, so `TestMidWalkthroughResumeKeepsAnExistingAgentBlock` (renamed) keeps its meaning. An invalid menu answer re-prompts.
- Repair paths: `[2]` uninstalls and reinstalls the service (`launchctl load -w` fails on a loaded agent, and the reload relaunches the daemon); with `--no-service` it restarts the detached daemon. `[3]` validates the new token like step 6, writes only that key, then restarts the daemon (shutdown, wait for the socket to close, service relaunch within 15 s or detached start) so verification exercises the new token.
- Verification is not checkpointed: success removes `onboard.json`; a timeout leaves it at step 6, and the hint text ends by pointing at repair mode's re-verify.
- The `--no-service` closing line moved from step 6 to after verification: `Verification passed; the daemon runs until you log out or reboot. Run slack-coordinator service install to keep it running.`
- `--existing` still answers `not implemented yet`; the sibling child owns it. No changeset was added: the epic's `docs-describe-onboarding-dms` child owns docs and the existing `.changeset/slack-coordinator.md` entry.

## Verification
- command: `cd tools/slack-coordinator && go build ./... && go test -race ./internal/assistant ./internal/onboard ./internal/cli ./internal/ipc`
- result: build clean; all four packages `ok` under `-race`. New tests: TestVerifyOwnerResolvesOnTheOwnersAnswerWithoutARequest (top-level and thread reply), TestVerifyOwnerIgnoresADMOlderThanTheSetupPost, TestVerifyOwnerTimesOutAndReleasesTheSlot, TestVerifyOwnerRefusesASecondWaiter, TestVerifyTimeoutPrintsHintsInOrderAndKeepsEverything, TestRepairReverifiesAnExistingSetupWithoutCreatingAnApp, TestRepairReinstallsTheServiceThenVerifies, TestRepairReplacesOneTokenAndRestartsTheDaemon, TestRepairRejectedTokenLeavesConfigUnchanged, TestOnboardWritesTheConfigInstallsTheServiceAndVerifiesTheOwner (in-process daemon, owner DM pushed through `Options.Inbound` after the setup post). Formatters, linters, and `npm test` were skipped as the task directs.

## Skipped Files
None. The task directory receives this receipt in its own `docs(task)` commit.
