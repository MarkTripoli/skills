# Watch an epic for new Bugs

`bug-coordinator` is an optional local Codex-owner inbox, not a Jira mutator or implementation dispatcher. It polls one configured Jira Cloud epic for eligible direct-child Bugs, durably queues new keys, and notifies its attached Codex owner. Claude Code and other owners use tracker intake at safe handoffs instead: a Codex watcher would otherwise start a competing owner.

## Build and configure explicitly

The module is `github.com/MarkTripoli/skills/tools/bug-coordinator` and requires Go 1.26. Build from the collection checkout:

```sh
cd tools/bug-coordinator
go build -o "$HOME/.local/bin/bug-coordinator" ./cmd/bug-coordinator
```

Create an operator-owned Jira API token file outside source control with mode `0600`. It needs read access only. The watcher uses Jira Cloud's read-only `POST /rest/api/3/search/jql`; authoritative ticket contents, eligibility decisions and permitted transitions still belong to the orchestrator's Jira MCP intake. Never put tokens in arguments, the repository, Slack or a unit file.

```sh
bug-coordinator serve \
  --epic PROJ-123 \
  --workspace /absolute/path/to/project \
  --skill-file /absolute/path/to/video-iterative-orchestration/SKILL.md \
  --jira-url https://your-site.atlassian.net \
  --jira-email reader@example.com \
  --jira-token-file /absolute/private/path/jira-token
```

No service, credential, app server or external infrastructure is provisioned automatically. The owner must authorize the configured epic, workspace and session-start behavior. `serve` stays in the foreground and polls every five minutes; `--interval` accepts durations of at least 30 seconds. The app-server Unix socket is discovered through `codex app-server daemon version`, or supplied with `--codex-socket`. Missing/unhealthy infrastructure produces errors, not fabricated discovery or delivery.

Private durable state defaults to `~/.local/state/bug-coordinator/`. Pass the same `--state-dir` on every command when overriding it. One process owns an epic at a time. State and token files must remain local and private.

## Discovery and replay boundaries

The first successful poll establishes a baseline: existing eligible Bugs belong to ordinary epic intake. `--include-existing` on the first launch queues those Bugs for catch-up instead. A restart preserves seen and pending state and does not replay acknowledged keys.

Default eligible status examples are `Backlog`, `Selected for Development`, `In Progress` and `Code Review`. Configure `--eligible-statuses` as a comma-separated list when the observed Jira workflow uses different labels. The watcher never decides the project's actual eligibility policy. It always excludes `On Hold` and `On-Hold`; an explicit hold removes a pending key and allows later eligible reactivation to be discovered anew. Missing search results alone do not discard pending keys: the owner must reconcile membership/status.

An attached active turn receives a steering message at its next safe point. Otherwise the watcher may start a fresh Codex thread in the configured workspace, whose first job is reading the ledger, immutable task receipts, Jira, Git/PR state and any active Slack run. It must recover standing authority and requested per-Bug plan gates before mutation, not infer them from a notification. Existing ticket owners and runtime leases remain exclusive.

Each key is delivered at most twice, with at least an hour before the one unacknowledged retry. Exhausted keys remain visible in `status` for operator investigation. Failed Jira/app-server calls do not count as notification attempts. Notifications use bounded local transport but are not a claim of exactly-once execution; after interruptions reconcile thread and ledger before retrying an external action.

## Attach, acknowledge and detach

Attach an already-running Codex owner before starting the watcher so it does not launch a competing session:

```sh
bug-coordinator attach --epic PROJ-123 --thread "$CODEX_THREAD_ID"
bug-coordinator status --epic PROJ-123
```

After authoritative Jira intake and accepted/excluded ledger recording, acknowledge that key from the notified thread. Repeated acknowledgement is safe; another thread cannot acknowledge its delivery:

```sh
bug-coordinator ack --epic PROJ-123 --issue PROJ-456 --thread "$CODEX_THREAD_ID"
```

Before a terminal owner reply, inspect status and detach. A later Bug remains pending and may start a fresh owner at the next poll:

```sh
bug-coordinator detach --epic PROJ-123 --thread "$CODEX_THREAD_ID"
```

## Optional Linux supervision

The [systemd user-service template](../tools/bug-coordinator/bug-coordinator@.service) supervises one explicitly enabled epic. Copy it to `~/.config/systemd/user/` and create private `~/.config/bug-coordinator/PROJ-123.env` with `WORKSPACE`, `SKILL_FILE`, `JIRA_URL`, `JIRA_EMAIL`, `JIRA_TOKEN_FILE` and `CODEX_SOCKET`. The socket is the app server's observed `socketPath`; service PATH may not include Codex. Do not put the token itself in the environment file. Keep the executable path stable, then explicitly enable the service after `systemctl --user daemon-reload`. Other platforms can run foreground under their existing supervisor; systemd is not a prerequisite.

## Checks and limitations

Run `go test ./...` from `tools/bug-coordinator` for local fake-backed Jira pagination/filtering, status overrides, durable inbox, thread acknowledgement, bounded replay and app-server transport tests. These tests do not establish live Jira access, running app-server compatibility or a completed video workflow. A live operator must report those observations separately. The tool neither installs runtimes nor grants new product, repository, publication or merge authority.
