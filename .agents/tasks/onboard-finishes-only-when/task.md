---
slug: onboard-finishes-only-when
title: "onboard finishes only when the owner replies to the setup DM within 120 seconds"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - onboard-resolves-the-owner
  - owner-dms-are-recorded
issue: 56
---
In `tools/slack-coordinator/internal/assistant/verify.go`, add `Register(server *ipc.Server)` for method `assistant.verify_owner` (add the constant to `internal/ipc/protocol.go`): `OpenConversation(s.Owner)`, `PostMessage(dm, "", "Reply to this message to finish setup")`, record the ts in a `Service` field `verify{ts string; done chan verifyResult}` under a mutex, then select on `done` and `time.After(120s)`. In `routeDM`, before `newRequest`, an owner top-level DM with `ts > verify.ts` while a verify is pending resolves `done` with `{ok, display_name from s.Slack.UserInfo(s.Owner)}` and returns (no row, reaction, or ack). `daemon.Serve` calls `svc.Register(rt.Server)`. `internal/ipc/client.go`: allow a per-call deadline; `onboard` calls this method with 130 s.

`internal/onboard/steps.go`: step 7 replaces the `verification arrives in a later change` exit: it calls the daemon (poll `daemon.health` for up to 5 s first, like `daemon start` does), prints the reply on success, deletes `onboard.json`, prints step 8 (`Invite the bot to the channels it should watch, then DM it !help.`), exit 0. On timeout print the three hints in the acceptance order and return exit 2 without touching config or service. Repair mode: `Run` with `config.yaml` present and no `--existing` prints `Existing setup found. [1] re-verify [2] reinstall service [3] replace a token` and runs the chosen path; every path ends with step 7. Update the `onboard` command's `--no-service` closing text to mention verification passed.

Tests: `internal/assistant/verify_test.go` (fake Slack, injected inbound): owner DM after the setup post → `{ok, display_name}`, no `dm_requests` row; owner DM with an earlier ts → not resolved; 120 s timeout with a fake clock or a short injected timeout → `{timeout}`. `internal/onboard/onboard_test.go`: success prints name and deletes the checkpoint; timeout prints the three hints in order and exits 2 with `onboard.json` kept; repair mode never calls `ManifestCreate`. `internal/cli` end-to-end: daemon in-process with `Options.Inbound`, `onboard` step 7 succeeds when the test pushes an owner DM after the post.

Proof: `go test -race ./internal/assistant ./internal/onboard ./internal/cli ./internal/ipc`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN IPC method `assistant.verify_owner` is called, the daemon shall `conversations.open` the owner, post `Reply to this message to finish setup`, and block until an owner top-level DM with a later `ts` arrives, returning `{ok: true, display_name}`.
- WHILE a verify is pending, the owner's reply shall resolve it and shall not create a `dm_requests` row, reaction, or ack.
- WHEN the reply arrives, `onboard` shall print the owner display name and app name, delete `onboard.json`, print next steps, and exit 0.
- IF no owner reply arrives within 120 seconds, THEN `assistant.verify_owner` shall return `{ok: false, timeout: true}` and `onboard` shall exit 2 with hints in this order: the app was not reinstalled after the scope change, the `message.im` event subscription is missing, the owner id is wrong, keeping `config.yaml`, the service, and `onboard.json`.
- WHEN `onboard` runs with `config.yaml` present and no `--existing`, it shall offer repair: re-run the verify, reinstall the service, or replace one token, and shall not call `apps.manifest.create`.
