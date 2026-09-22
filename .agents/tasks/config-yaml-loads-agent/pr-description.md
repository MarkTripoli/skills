Ticket: [#41](https://github.com/MarkTripoli/skills/issues/41) | Task: `config-yaml-loads-agent`

## Purpose

Later epic children (adapters, runner, onboard) need a validated `agent` block, retention windows, and a fixed workspace layout to build on, so `config.yaml` gains optional `agent` and `retention` sections with defaults filled in `Load`, and `paths` gains `Workspace`, `RunDir`, `OnboardCheckpoint`, and `EnsureWorkspace`.

## Acceptance criteria

- A file with only `slack:` loads with `Agent == nil` and `Retention{Days: 30, ConsumedDays: 7}`: `TestLoadFillsAgentAndRetentionDefaults/slack only` in `tools/slack-coordinator/internal/config/config_test.go` (also asserts `AgentEnabled() == false`).
- `agent:` with only `command: codex` loads as `{codex, edits, 10m, 30, nil extra_dirs}`: `TestLoadFillsAgentAndRetentionDefaults/agent with only command`.
- Unknown `agent.command`, `agent.approval` outside `edits|full`, `timeout <= 0`, `max_runs_per_hour <= 0`, and a relative `extra_dirs` entry each return an error naming the key and the allowed values: `TestValidateRejectsAgentAndRetentionValues` asserts the key and `omp, claude, codex` / `edits or full` / `greater than 0` / `absolute` substrings; `TestLoadRejectsInvalidAgentNamingTheKey` proves `Load` wraps the same error with the file path.
- `paths` returns `<root>/workspace`, `<root>/workspace/runs/<id>`, and `<root>/onboard.json`: `TestWorkspacePathsHangOffRoot` in `tools/slack-coordinator/internal/paths/paths_test.go`.

`cd tools/slack-coordinator && go test -count=1 ./internal/config ./internal/paths` passes on `86232e7` (`ok internal/config 0.240s`, `ok internal/paths 0.367s`). `go test ./internal/cli` and `npm test` were not run, per the task.

## Special things to note

- `Config.ApplyDefaults` is exported and `setup` calls it before `Validate` (`internal/cli/setup.go:44`). Without it the hand-built `Config` in `setup` fails the new `retention.days 0 must be greater than 0` check. Any later code that builds a `Config` outside `Load` has the same obligation.
- `ApplyDefaults` never sets `agent.command`: `agent: {}` is rejected as `agent.command "" must be one of omp, claude, codex`, and `agent:` with a null value leaves `Agent` nil. A bare integer `timeout: 600` fails at YAML parse time (`time.Duration` needs `10m`-style text), so nanosecond timeouts cannot reach `Validate`.
- `extra_dirs` entries are checked with `filepath.IsAbs` only, so `/srv/../etc` passes; the consumer that passes them to an agent binary should `filepath.Clean` them (review advisory ADV-002 in [01-code-review-config-yaml-loads-agent.md](.agents/tasks/config-yaml-loads-agent/01-code-review-config-yaml-loads-agent.md)).

## Change outline

`config.yaml` shape (`internal/config/config.go`):

```diff
 type Config struct {
   Slack     Slack     `yaml:"slack"`
   Jira      *Jira     `yaml:"jira,omitempty"`
+  Agent     *Agent    `yaml:"agent,omitempty"`   // nil when the daemon never spawns an agent
+  Retention Retention `yaml:"retention"`
 }
+type Agent struct {
+  Command        string        `yaml:"command"`           // omp | claude | codex (required)
+  Approval       string        `yaml:"approval"`          // edits | full; default edits
+  Timeout        time.Duration `yaml:"timeout"`           // default 10m
+  MaxRunsPerHour int           `yaml:"max_runs_per_hour"` // default 30
+  ExtraDirs      []string      `yaml:"extra_dirs"`        // each filepath.IsAbs
+}
+type Retention struct {
+  Days         int `yaml:"days"`          // default 30
+  ConsumedDays int `yaml:"consumed_days"` // default 7
+}
+func (c *Config) ApplyDefaults()
+func (c *Config) AgentEnabled() bool
+func (a *Agent) Validate() error
+func (r Retention) Validate() error
```

Load order, and the one non-`Load` caller:

```diff
 Load(path)
   yaml.Unmarshal
+  cfg.ApplyDefaults()        // retention {30,7}; agent {edits,10m,30} when Agent != nil
   cfg.Validate()
     Slack checks
     Jira.Validate  (if set)
+    Agent.Validate (if set)  // command, approval, timeout, max_runs_per_hour, extra_dirs
+    Retention.Validate

 setup
   build Config from flags/env
+  cfg.ApplyDefaults()
   cfg.Validate()
   Save
```

Workspace layout (`internal/paths/paths.go`):

```text
<root>/
  config.yaml
  onboard.json          OnboardCheckpoint()
  workspace/            Workspace()            0700 via EnsureWorkspace()
    runs/               (MkdirAll 0700)
      <id>/             RunDir(id)
```

`AgentEnabled`, `Workspace`, `RunDir`, `OnboardCheckpoint`, and `EnsureWorkspace` have no callers in this pull request; the epic plan assigns their consumers to the adapters, runner, and onboard children.

## Human Review

### Review targets

- `internal/config/config.go`: `ApplyDefaults` fills only zero values and runs before `Validate`; every `Agent.Validate` and `Retention.Validate` message is key-first and lists the allowed values.
- `internal/cli/setup.go:44`: the added `ApplyDefaults` call is the only behavior change to an existing command.
- `internal/paths/paths.go`: `EnsureWorkspace` chmods both `workspace` and `workspace/runs` to 0700 and is idempotent (`TestEnsureWorkspaceCreatesOwnerOnlyRunsDir`).

### Verify

- [ ] The `Commits` and Go test checks pass on this pull request, and `go test -count=1 ./internal/config ./internal/paths` passes locally on the head commit.

### Known limits

- `Save` on a `Config` that skipped `ApplyDefaults` writes zero-valued `agent` and `retention` fields (`timeout: 0s`, `days: 0`); `Load` repairs them on read, and `setup` always applies defaults first. Later writers of `config.yaml` should call `ApplyDefaults` before `Save`.
- `extra_dirs` entries are not cleaned or checked for `..` segments; no consumer exists yet.

Closes #41
