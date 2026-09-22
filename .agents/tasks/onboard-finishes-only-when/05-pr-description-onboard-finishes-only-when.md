Ticket: [#56](https://github.com/MarkTripoli/skills/issues/56) | Task: `onboard-finishes-only-when` | Walkthrough: none

## Purpose

Onboarding now verifies the configured owner through a live Slack DM before deleting its checkpoint and declaring setup complete.

## Acceptance criteria

- `assistant.verify_owner` opens the owner DM, posts `Reply to this message to finish setup`, and returns `{ok: true, display_name}` after a later owner DM: covered by `internal/assistant/verify_test.go` and the in-process daemon onboarding test.
- A pending verification consumes the matching owner reply before request creation, reaction, or acknowledgement: covered by `internal/assistant/verify_test.go`.
- Successful onboarding prints the owner display name and app name, deletes `onboard.json`, prints the step-8 next steps, and exits 0: covered by `internal/cli/onboard_test.go`.
- A 120-second timeout returns the typed timeout result, prints the three required hints in order, exits 2, and keeps `config.yaml`, the service, and `onboard.json`: covered by `internal/onboard/onboard_test.go`.
- Existing configuration offers re-verification, service reinstall, or single-token replacement without calling `apps.manifest.create`, and each path reaches verification: covered by the repair tests in `internal/onboard/onboard_test.go`.

## Special things to note

- The daemon owns the 120-second verification wait; the CLI uses a 130-second IPC deadline and cancels blocked handlers when the client disconnects.
- Token replacement explicitly reinstalls the service so clean daemon shutdown is followed by a supervisor relaunch on Linux and macOS.
- No live Slack workspace or service manager was used; the task-named race suite and in-process daemon/IPC tests were used instead. Project-wide `npm test`, formatters, and linters were skipped per `task.md`.

## Change outline

The implementation adds one daemon method and routes its matching inbound event through the existing assistant boundary.

```text
tools/slack-coordinator/internal/
  assistant/  owns verify_owner state and consumes the owner reply before DM requests
  daemon/     registers the assistant IPC method
  ipc/        defines the result and cancels handlers on peer disconnect
  cli/        applies the per-call deadline and service restart behavior
  onboard/    runs verification, repair choices, timeout hints, and step 8
```

```text
onboard step 7
  -> daemon.health for up to 5s
  -> assistant.verify_owner
      -> conversations.open(owner)
      -> chat.postMessage("Reply to this message to finish setup")
      -> wait for later owner DM or timeout
  -> success: print owner/app, delete onboard.json, print step 8
  -> timeout: print ordered hints, keep config/service/checkpoint, exit 2
```

The focused tests also cover older timestamps, repair paths, Linux service relaunch commands, and IPC cancellation.

## Human Review

### Review targets

- Confirm the verification DM is consumed only when its timestamp follows the setup post and that ordinary DMs retain their existing routing.
- Inspect the repair path in `internal/onboard/steps.go` and the peer-cancellation path in `internal/ipc/server.go`.

### Verify

- [ ] Review the changed assistant, IPC, CLI, and onboarding files against issue #56 and confirm hosted checks for the pull request.

### Known limits

- No live Slack workspace or launchd/systemd service manager session was exercised; those boundaries are covered by focused fakes and in-process daemon tests.

Closes #56
