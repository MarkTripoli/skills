---
slug: config-yaml-loads-agent
title: "config.yaml loads agent and retention sections with defaults and validation"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on: []
issue: 41
---
In `tools/slack-coordinator/internal/config/config.go`, add two optional sections beside `Slack` and `Jira`:

```go
type Agent struct {
    Command        string        `yaml:"command"`            // omp | claude | codex
    Approval       string        `yaml:"approval"`           // edits | full; default edits
    Timeout        time.Duration `yaml:"timeout"`            // default 10m
    MaxRunsPerHour int           `yaml:"max_runs_per_hour"`  // default 30
    ExtraDirs      []string      `yaml:"extra_dirs"`         // absolute paths
}
type Retention struct {
    Days         int `yaml:"days"`          // default 30
    ConsumedDays int `yaml:"consumed_days"` // default 7
}
```

`Config` gains `Agent *Agent \`yaml:"agent,omitempty"\`` and `Retention Retention \`yaml:"retention"\``. `Load` fills defaults after unmarshal and before `Validate`: retention days/consumed_days when zero; when `Agent != nil`, approval `edits`, timeout `10m`, max_runs_per_hour `30`. `Validate` rejects `agent.command` outside `omp|claude|codex` (error text lists the three names), `approval` outside `edits|full`, `timeout <= 0`, `max_runs_per_hour <= 0`, any `extra_dirs` entry that is not `filepath.IsAbs`, and retention values `<= 0`. `Save` must round-trip both sections; a file without them must keep loading. Add `AgentEnabled() bool`.

In `internal/paths/paths.go`, add `Workspace() string` (`<root>/workspace`), `RunDir(id string) string` (`<root>/workspace/runs/<id>`), `OnboardCheckpoint() string` (`<root>/onboard.json`), and `EnsureWorkspace() error` that `MkdirAll`s `<root>/workspace/runs` at 0700 and chmods both directories 0700.

Proof: table tests in `internal/config/config_test.go` for defaults, each rejection, and save/load round trip; a paths test for the three new paths. `go test ./internal/config ./internal/paths`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN `config.Load` reads a file with only `slack:`, it shall return `Agent == nil` and `Retention{Days: 30, ConsumedDays: 7}`.
- WHEN `agent:` is present with only `command: codex`, `Load` shall fill `approval: edits`, `timeout: 10m`, `max_runs_per_hour: 30`, and empty `extra_dirs`.
- IF `agent.command` is not one of `omp`, `claude`, `codex`, or `approval` is not `edits` or `full`, or `timeout <= 0`, or `max_runs_per_hour <= 0`, or an `extra_dirs` entry is relative, THEN `Validate` shall return an error naming the key and the allowed values.
- The `paths` package shall return `<root>/workspace`, `<root>/workspace/runs/<id>`, and `<root>/onboard.json` from `Workspace()`, `RunDir(id)`, and `OnboardCheckpoint()`.
