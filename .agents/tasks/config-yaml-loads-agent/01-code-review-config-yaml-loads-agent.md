---
type: code-review
date: 2026-09-22
branch: config-yaml-loads-agent
base_branch: epic-slack-assistant-bot-dms
base_sha: d1f95113d28c1d42c350b7379dd009ee2977a2c2
head_sha: 86232e7841e648fd78d744544a10ccf06e0a5a27
status: clean
summary: "Reviewed commit 86232e7 (config agent/retention sections, paths workspace helpers, setup ApplyDefaults call) against epic-slack-assistant-bot-dms. Every task.md acceptance criterion is proven by a table test in internal/config or internal/paths, and go test -count=1 on both packages passes. No critical or major findings; two info advisories about Save writing zero-valued fields before defaults and extra_dirs not being cleaned. Next phase writes the pull request description."
---

# Code Review

## Scope

- merge base: `d1f9511` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists yet)
- reviewed HEAD: `86232e7` `feat(slack-coordinator): load agent and retention config sections`
- commits: one, `86232e7`
- staged and unstaged changes: none (`git status --short --branch` prints only `## config-yaml-loads-agent`)
- task-owned untracked files: none before this review; this artifact is the first file added to `.agents/tasks/config-yaml-loads-agent/` after `task.md`
- excluded changes: none; the diff touches only `tools/slack-coordinator/internal/{cli/setup.go,config/config.go,config/config_test.go,paths/paths.go,paths/paths_test.go}` (+320/-7)

The user asked for implement-before-review in manual mode. The implementation commit was already on the branch when this session opened, so no implementation work was needed; the review covers that commit.

## Previous Round

- previous artifact: None.

## Requirements and Standards

- task or ticket: `.agents/tasks/config-yaml-loads-agent/task.md` (issue #41, oneshot child of `slack-assistant-bot-dms`)
- implementation source: `task.md` body; the epic plan entry in `.agents/tasks/slack-assistant-bot-dms/04-epic-plan-slack-assistant-bot-dms.md:28,62-65` restates it and assigns `paths.Workspace/RunDir/OnboardCheckpoint/EnsureWorkspace` to this child. Docs and the changeset belong to the w13 docs child (`04-epic-plan:523-542`), so neither is a gap here.
- repository instructions: `AGENTS.md` (commit subjects per `scripts/check-commits.mjs`; no formatter, linter, or `npm test` run per `task.md`)

Acceptance criteria against the diff:

| Criterion | Decision | Proof |
|---|---|---|
| slack-only file loads with `Agent == nil`, `Retention{30, 7}` | pass | `config_test.go:99,128-136` (`slack only` case checks Retention, `Agent` nil via DeepEqual, `AgentEnabled() == false`) |
| `agent: {command: codex}` fills approval, timeout, max_runs_per_hour, empty extra_dirs | pass | `config_test.go:100-109` expects `{codex, edits, 10m, 30, nil}` |
| each invalid value returns an error naming the key and allowed values | pass | `config_test.go:161-171` asserts substrings `agent.command` + `omp`,`claude`,`codex`; `agent.approval` + `edits`,`full`; `agent.timeout`/`agent.max_runs_per_hour`/`retention.*` + `greater than 0`; `agent.extra_dirs[1]` + `absolute` |
| `Workspace()`, `RunDir(id)`, `OnboardCheckpoint()` layout | pass | `paths_test.go:9-22` |

Body requirements beyond the criteria: `Save` round-trips both sections (`config_test.go:200-217`), a file without them loads (`slack only` case), `AgentEnabled()` (`config.go:153`), `EnsureWorkspace` creates `<root>/workspace/runs` at 0700 and chmods both (`paths.go:74-83`, proven by `paths_test.go:24-44` including a second idempotent call).

## Change Profile

- intent and expected behavior: config.yaml gains optional `agent` and `retention` blocks with defaults applied in `Load` before `Validate`; `paths` gains the workspace layout later children build on.
- change description quality: subject `feat(slack-coordinator): load agent and retention config sections` (63 chars, matches the subject regex). Body explains why `ApplyDefaults` is exported (setup validates a hand-built Config that would otherwise fail the new retention check) and cites `Refs: #41`.
- implementation model and review model: implementation model not recorded in the commit; review by `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: 320 added / 7 removed across five files; one concern (config schema plus its path helpers), within the ~300 coherent band.
- resulting large-file concerns: `config.go` grows to 215 lines; `config_test.go` to 217. Neither warrants a split.
- dependency or lockfile changes: none; `time` is the only new import and `gopkg.in/yaml.v3` was already a dependency.

## Tests Reviewed First

- behavior claimed by tests: defaults for both sections through `Load` (`TestLoadFillsAgentAndRetentionDefaults`), explicit values preserved (`explicit values are kept`, `TestLoadKeepsExplicitRetention`), eleven rejection rows with a passing baseline first (`TestValidateRejectsAgentAndRetentionValues`), `Load` wrapping the path around the validation error (`TestLoadRejectsInvalidAgentNamingTheKey`), full round trip with non-default values (`TestAgentAndRetentionRoundTrip`), the three path getters and `EnsureWorkspace` modes plus idempotency. The pre-existing `TestSaveLoadRoundTripIsOwnerOnly` now seeds `Retention{30, 7}` so `*got != *want` still holds after `Load` fills defaults.
- missing or misleading coverage: none blocking. Negative `consumed_days` has no row, but the same `<= 0` branch is exercised by `zero consumed days` and by `negative retention days` on the sibling field.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4192` in / `73` out (`node skills/delivery/typed-judgment/judge.mjs axis-coverage <this file> --json`, exit 0, one run)

### Correctness

- assessment and evidence: `Load` applies defaults after unmarshal and before `Validate` (`config.go:81-82`), matching the task ordering. `ApplyDefaults` only fills zero values, so explicit `days: 90` survives (`config_test.go:141-149`). `Agent.Validate` rejects unknown command and approval with the allowed set in the message, non-positive timeout and budget, and relative or empty `extra_dirs` entries (`config.go:157-180`). A probe run this session confirmed: `timeout: 600` (bare int) fails at parse time with `cannot unmarshal !!int 600 into time.Duration`, so an accidental nanosecond timeout cannot reach `Validate`; `agent:` with a null value leaves `Agent` nil; `agent: {}` is rejected as `agent.command "" must be one of omp, claude, codex`; `extra_dirs: [""]` is rejected as `agent.extra_dirs[0] "" must be an absolute path`. `setup.go:44` calls `ApplyDefaults` before `Validate`, so a fresh setup passes the new retention check and writes concrete values. The `cli` test helper (`run_start_test.go:134`) saves Configs with zero retention; `Load` fills them, so the daemon side keeps working (`go vet ./internal/cli` compiles clean; the package suite was not run per `task.md`).
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: One method per section (`Agent.Validate`, `Retention.Validate`) mirrors the existing `Jira.Validate` shape; `Config.Validate` composes them in order (`config.go:139-149`). Defaults are named constants (`config.go:51-57`). Error strings follow the existing `slack.bot_token must ...` key-first form. `EnsureWorkspace` mirrors `EnsureDirs` (`paths.go:64-83`). No dead branches.
- helper coverage: covered, level 3, confidence 0.94

### Architecture

- assessment and evidence: The change keeps defaulting in `config` (`ApplyDefaults`) rather than in each caller; `setup` is the only non-`Load` caller and calls it once (`setup.go:44`). `paths` stays a pure layout package with one filesystem helper, as the TDD specifies (`03-tdd:450`). `AgentEnabled` parallels `JiraEnabled`. Nothing is duplicated or relocated.
- helper coverage: covered, level 3, confidence 0.97

### Security

- assessment and evidence: `extra_dirs` entries must be absolute (`config.go:174-178`), as the task requires; entries are not cleaned or checked for `..` segments (ADV-002). `EnsureWorkspace` creates and chmods both directories 0700 (`paths.go:76-82`), keeping run inputs owner-only; `Save` remains 0600. No new secrets or untrusted input paths beyond the owner's own config file.
- helper coverage: covered, level 3, confidence 0.86

### Performance

- assessment and evidence: `Load` runs once at startup; validation is O(len(extra_dirs)). `EnsureWorkspace` performs one `MkdirAll` and two `Chmod` calls. No hot path is touched.
- helper coverage: covered, level 3, confidence 0.95

## Verification Story

- command or inspection: `cd tools/slack-coordinator && go test -count=1 ./internal/config ./internal/paths`; `go vet ./internal/config ./internal/paths ./internal/cli`; a throwaway `TestProbe` in `internal/config` (removed after the run, `git status` clean) exercising the edge inputs listed under Correctness.
- result: `ok internal/config 0.232s`, `ok internal/paths 0.344s`; `go vet` exit 0 with no output; probe outputs quoted under Correctness.
- manual, screenshot, or before-and-after evidence: not applicable (no interface).

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Save writes zero-valued agent and retention fields for a Config that skipped ApplyDefaults

- type: Nitpick
- severity: info
- category: Data integrity and integration
- location: `tools/slack-coordinator/internal/config/config.go:89-101`
- evidence: Probe saved `&Config{Slack: validSlack, Agent: &Agent{Command: "omp"}}` and the file contained `approval: ""`, `timeout: 0s`, `max_runs_per_hour: 0`, `extra_dirs: []`, `retention: {days: 0, consumed_days: 0}`; `Load` then filled `{edits, 10m, 30}` and `{30, 7}`. `ExtraDirs` reloads as `[]string{}` rather than nil.
- suggestion: No change required; `setup` calls `ApplyDefaults` before `Save`, and `Load` repairs the rest. A later child that writes `config.yaml` outside `setup` (the onboard children) should call `ApplyDefaults` first so the file shows the effective values.

### ADV-002 extra_dirs entries are absolute but not cleaned

- type: Potential issue
- severity: info
- category: Security and privacy
- location: `tools/slack-coordinator/internal/config/config.go:174-178`
- evidence: `filepath.IsAbs` accepts `/srv/../etc`; the task asks only for `filepath.IsAbs`, and no consumer exists yet.
- suggestion: The adapters or runner child that passes `ExtraDirs` to an agent binary can `filepath.Clean` each entry at the point of use; nothing to change here.

## Dead Code and Dependency Review

- newly orphaned code: none. `AgentEnabled`, `Workspace`, `RunDir`, `OnboardCheckpoint`, and `EnsureWorkspace` have no callers yet by design; the epic plan assigns their consumers to the adapters, runner, and onboard children (`04-epic-plan:28`).
- dependency findings: none.

## Verdict

- decision: approve
- overall code-health change: improves; config gains typed, validated sections with defaults in one place and the path layout is centralized before its consumers land.
- rationale: All four acceptance criteria and the body requirements are proven by tests that fail on the plausible mistakes (missing default, wrong ordering, missing allowed-value text). Probe runs rejected the suspected edge cases (integer timeout, empty agent block, empty extra_dirs entry).

## Review Limits

- blocked or unavailable checks: `go test ./internal/cli` and the full `npm test` were not run per `task.md`; `go vet ./internal/cli` proves the setup change compiles. Typed judgments ran once and returned `covered` on every axis.
- residual manual verification: none.
