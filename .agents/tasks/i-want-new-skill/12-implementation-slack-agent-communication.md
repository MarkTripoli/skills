---
type: implementation
completed_phase: 7
summary: "Phase 7 proves `service install|uninstall|status` renders and activates a marker-owned launchd plist or systemd user unit through a recorded executor, refuses foreign files, exits `2` on an unsupported GOOS, and `setup --install-service` installs after `config.Save`; both GOOS targets build. Phase 8 consumes `internal/config/config.go` (add `Jira`), `internal/db/schema.go` (add `jira_backlinks`), `internal/coordinator/start_run.go` and `scheduler.go`, and `internal/cli/setup.go`, `run_start.go`."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/i-want-new-skill/task.md`
- plan artifact: [05-plan-slack-agent-communication.md](05-plan-slack-agent-communication.md)
- phase range: 7

## Child Workers
- implementer: `agent-implementer` (`ImplPhase7`), one worker for Phase 7
- reviewer: none; the parent re-ran both Phase 7 checks and the whole module suite

## Completed Work
- `internal/daemon/service.go`: `Service{Home, Binary, Executor, GOOS}`, `Label`, `Definition`, `DefinitionPath`, `Install`, `Uninstall`, `Installed`, marker `SLACK_COORDINATOR_MANAGED`, `ErrUnsupportedPlatform`; `service_test.go` with `recordingExecutor`.
- `internal/cli/service.go`: `service install|uninstall|status`; `setup --install-service` installs after `config.Save`; `daemon stop` prints the supervision notice when installed and still sends `daemon.shutdown`; `root.go` registers `service`.
- Commit `0831c70 feat(slack-coordinator): supervise the daemon with launchd or systemd`.

## Automated Verification
- command: `cd tools/slack-coordinator && go test -race ./internal/daemon/... ./internal/cli/...`
- result: pass
- evidence: worker run, parent re-run inside `go test -race -count=1 ./...`
- command: `cd tools/slack-coordinator && GOOS=linux go build ./... && GOOS=darwin go build ./...`
- result: both build
- evidence: parent re-run
- command: `cd tools/slack-coordinator && go vet ./... && go test -race -count=1 ./...`
- result: nine packages `ok`
- evidence: parent run after the worker finished
- command: worker throwaway render checked with `plutil -lint`
- result: `OK`; `plutil -p` shows Label, ProgramArguments, EnvironmentVariables, RunAtLoad, KeepAlive, both log paths
- evidence: worker final message (`agent://ImplPhase7`); no `launchctl` or `systemctl` was run for real

## Deferred Human Evidence

- On macOS: `service install`, `kill -9 <daemon pid>`, `daemon status` answers from a new PID within launchd's restart window; Linux equivalent when a systemd host is available. Record in `.agents/tasks/i-want-new-skill/evidence/phase-7-supervision.md`. Recorded, not executed.

## Commit Handoff
Phase commit `0831c70` was created after green automated checks; this receipt and the ticked plan are committed separately as `docs(task): implementation artifact`.

## Human Review

### Review targets

- The systemd unit file is `com.marktripoli.slack-coordinator.service` (label plus `.service`), not the plan's `slack-coordinator.service`; one constant renames it.
- The plist lives at `<home>/slack-coordinator.plist`, matching the plan and `tools/safety-dance/internal/daemon/service.go:108`. `launchctl load -w` plus `KeepAlive` restarts it, but only plists under `~/Library/LaunchAgents` reload at login.
- `Install` removes the file it created when activation fails; no `.recovery` record.
- `setup --install-service` resolves the platform before any Slack call, so an unsupported GOOS exits `2` with no network call and no config write.

### Verify

- `cd tools/slack-coordinator && go test -race -run 'Service' -v ./internal/daemon/... ./internal/cli/...` passes at `0831c70`.
- `internal/daemon/service_test.go` records `launchctl load -w <plist>` on darwin and `systemctl --user daemon-reload` then `systemctl --user enable --now <unit>` on linux.

### Known limits

- Start-at-login on macOS depends on the plist location; restart-after-exit is what `KeepAlive` proves and what the deferred evidence covers.
