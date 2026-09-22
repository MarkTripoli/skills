---
type: code-review
date: 2026-09-22
branch: proposal-json-is-validated
base_branch: epic-slack-assistant-bot-dms
base_sha: 4b632ce1d6b8b1da71a0b09067f70729a4c1e691
head_sha: d38e719be47e77ae5c4481399d9ca3a4a4fcddb8
status: clean
summary: "Reviewed commit d38e719 against epic-slack-assistant-bot-dms: Proposal, Trigger, DeliverTo, Validate, and ReadProposal in internal/agent/proposal.go, plus the Wait hook in run.go. Every task.md rule and all three acceptance criteria are implemented and proven by go test ./internal/agent (25 proposal cases pass). No critical or major findings; two advisories on time zone data and unbounded reads. Next phase writes the pull request description."
---

# Code Review

## Scope

- merge base: `4b632ce1d6b8b1da71a0b09067f70729a4c1e691` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists yet)
- reviewed HEAD: `d38e719be47e77ae5c4481399d9ca3a4a4fcddb8` on `proposal-json-is-validated`
- commits: one, `d38e719 feat(slack-coordinator): validate proposal.json into a Proposal on exit`
- staged and unstaged changes: none (`git status --short --branch` reports only `## proposal-json-is-validated`)
- task-owned untracked files: none
- excluded changes: none; the six changed files all sit under `tools/slack-coordinator/internal/agent/`

## Previous Round

- previous artifact: None.

## Requirements and Standards

- task or ticket: `.agents/tasks/proposal-json-is-validated/task.md` (issue #53, oneshot child of `slack-assistant-bot-dms`). The user asked for implementation before review in this session; the implementation was already committed as `d38e719`, so this round reviews that commit.
- implementation source: `task.md` body; the oneshot chain has no plan or outline artifact. The task directory has no `index.json`, so this is a legacy task and the artifact is numbered `01-` in the task directory.
- repository instructions: `AGENTS.md` (Go tool under `tools/slack-coordinator`; commits follow `scripts/check-commits.mjs`; user-facing changes add a `.changeset/` entry). Decision: no changeset is required. The change fills `RunOutcome.Proposal` and `ProposalErr`, which no caller outside `internal/agent` reads yet, matching the sibling runner commits `563ef1d` and `99e8645` that shipped without one; the user-facing DM refusal `71681a0` did add one.

## Change Profile

- intent and expected behavior: replace the `type Proposal struct{}` placeholder with the typed schema, a field-naming `Validate`, and `ReadProposal(dir)` that returns `nil, nil` for an absent file; `runner.wait` fills `Proposal` or `ProposalErr` after `ReadOutputs` so `Result` still carries `result.md`.
- change description quality: subject is 71 characters and matches the Conventional Commits rule; the body says why (`the coordinator turns it into a watch`, `result text must survive beside it`) and carries `Refs: #53`.
- implementation model and review model: implementation model unknown (committed before this session); review model `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: 313 insertions, 7 deletions in six files, one feature. Coherent, no split needed.
- resulting large-file concerns: none; `proposal.go` is 121 lines, `run_test.go` 232 lines.
- dependency or lockfile changes: none; only standard library imports (`encoding/json`, `regexp`, `time`).

## Tests Reviewed First

- behavior claimed by tests: `proposal_test.go:28-92` is the table test with four valid rows (schedule daily, schedule every_hours, window_end, each_message to a channel thread) and fourteen failing rows, one per rule in `task.md`, each asserting the error prefix names the field. `proposal_test.go:101-142` covers `ReadProposal`: absent file is `nil, nil`, a valid file round-trips `Watch`, `Trigger.Kind`, `DeliverTo.ChannelID`, `Summary`, malformed JSON and a failed `Validate` both return `nil` plus an error prefixed `proposal.json:`. `run_test.go:182-201` runs `FAKE_MODE=proposal` (`testdata/fake-agent.sh:11-17` writes both files) and asserts `Proposal != nil`, `ProposalErr == nil`, `Result == "the report\n"`, `ResultSource == "result.md"`. `run_test.go:203-220` pre-seeds an invalid `proposal.json` and asserts `Proposal == nil`, `ProposalErr` carries `trigger: schedule needs exactly one of daily or every_hours`, and `Result` is still the `result.md` text.
- missing or misleading coverage: none blocking. Acceptance criterion 2 lists six failure shapes; only the zero-trigger-form shape is driven through `Wait`, the other five through `Validate` or `ReadProposal` directly. `run.go:151` is a single assignment from `ReadProposal`, so the direct tests prove the same path.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4277` in / `73` out (stderr: `judge: model jev-1.13.0, tokens 4277 in / 73 out`)

### Correctness

- assessment and evidence: every `task.md` rule maps to a branch in `proposal.go:53-101`. `Watch` and `Instruction` empty checks at `:54-59`; `DeliverTo` exactly-one via `DM == (ChannelID != "")` at `:63`; schedule exactly-one via `(Daily != "") == (EveryHours != 0)` at `:72`, then `EveryHours < 0` at `:75` so `EveryHours: -1` alone fails as `trigger.every_hours:` rather than passing as a form (table row `schedule negative every_hours`); `Daily` regex `^\d{2}:\d{2}$` at `:49,:78`; `TZ` through `time.LoadLocation` at `:82`; `window_end` through `time.Parse(time.RFC3339, At)` at `:87`, which also rejects an empty `At`; `each_message` rejects negative debounce at `:91` and any of `Daily`/`EveryHours`/`At` at `:94`; unknown kind at `:98`. `ReadProposal` (`:105-121`) distinguishes `os.ErrNotExist` (`nil, nil`) from other read errors, JSON syntax errors, and `Validate` failures, wrapping each with `proposal.json:`. `run.go:151` runs after `ReadOutputs` at `:150`, so `Result` and `ResultSource` are independent of the proposal outcome. The three acceptance criteria are proven by `TestProposalIsValidatedAlongsideResult`, `TestInvalidProposalSetsProposalErr` plus the `Validate` table, and the `Result` assertions in both run tests.
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: `Validate` delegates the trigger switch to `Trigger.validate` (`proposal.go:69`), keeping one rule per statement; the equality-as-exclusive-or idiom at `:63` and `:72` is explained by the adjacent error text. Trigger kinds are named constants (`:43-47`) reused by tests. `proposalFile` joins the existing run-directory constant block in `rundir.go:11-17` instead of a second literal. No dead branches or pass-through helpers.
- helper coverage: covered, level 3, confidence 0.98

### Architecture

- assessment and evidence: the proposal schema stays inside `internal/agent` beside `RunOutcome`, the only owner of run-directory files; `runner.wait` gains one line (`run.go:151`) and no new interface. `ReadProposal` mirrors `ReadOutputs` in `rundir.go` (missing file is not an error). `meta.json` is unchanged, so a purge or `!show` needs no migration. No consumer of `Proposal` exists outside the package yet; the watch-creation child owns that.
- helper coverage: covered, level 3, confidence 0.99

### Security

- assessment and evidence: `proposal.json` is written by the agent process, whose environment `scrubEnv` (`run.go:188`) already strips bot tokens, into a 0700 run directory (`rundir.go:21-26`). Parsing uses `encoding/json` into a fixed struct; unknown fields are dropped and a wrong-typed field yields an `UnmarshalTypeError` naming it. `time.LoadLocation` is called with agent-supplied text; Go rejects path separators and `..` in zone names, so it cannot read arbitrary files. `Watch`, `Instruction`, and `ChannelID` contents are not shape-checked; `task.md` does not ask for it and the consumer that posts to Slack does not exist yet. See ADV-002 for the unbounded read.
- helper coverage: covered, level 3, confidence 0.96

### Performance

- assessment and evidence: one extra `os.ReadFile` per run exit on a file the agent wrote once; `dailyPattern` compiles once at package init (`proposal.go:49`); `time.LoadLocation` reads zoneinfo once per validation and only when `TZ` is set. Nothing on a hot path.
- helper coverage: covered, level 3, confidence 0.97

## Verification Story

- command or inspection: `cd tools/slack-coordinator && go test -count=1 -v -run Proposal ./internal/agent`; `go test ./internal/agent`; `go vet ./internal/agent`; `gofmt -l internal/agent`.
- result: `ok github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent 0.267s` with all 25 `Proposal` subtests and top-level tests `PASS`; the whole package passes; `go vet` prints nothing; `gofmt -l` lists no files.
- manual, screenshot, or before-and-after evidence: none needed; no user interface. Before the change `proposal.go` held `type Proposal struct{}` and `wait` never set `Proposal` (`git show 4b632ce:tools/slack-coordinator/internal/agent/proposal.go`).

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 Time zone validation depends on host zoneinfo

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `tools/slack-coordinator/internal/agent/proposal.go:82`
- evidence: `time.LoadLocation` reads `$ZONEINFO`, then the system zoneinfo directory, then a `time/tzdata` embed if imported. The binary imports no `time/tzdata`, so on a host without `/usr/share/zoneinfo` (scratch or distroless container) every non-empty `TZ` fails as `trigger.tz: unknown time zone`.
- suggestion: when the coordinator is packaged as a container, add `import _ "time/tzdata"` in `main` (about 450 KiB). Not needed for the current host-daemon deployment.

### ADV-002 proposal.json is read without a size bound

- type: Potential issue
- severity: trivial
- category: Stability and availability
- location: `tools/slack-coordinator/internal/agent/proposal.go:106`
- evidence: `os.ReadFile` loads the whole file. `ReadOutputs` at `rundir.go:33` already does the same for `result.md`, so this adds no new exposure; both files come from a process the owner launched.
- suggestion: if a cap is ever added for `result.md`, apply the same `io.LimitReader` to `proposal.json`.

## Dead Code and Dependency Review

- newly orphaned code: none. The `type Proposal struct{}` placeholder and its comment were replaced in place; `RunOutcome.Proposal` and `ProposalErr` are now written by `run.go:151` and read by `run_test.go`.
- dependency findings: none; standard library only, `go.mod` and `go.sum` untouched.

## Verdict

- decision: approve
- overall code-health change: improves. The placeholder becomes a validated schema with field-named errors and a test per rule; the runner change is one line.
- rationale: every `task.md` rule and acceptance criterion has a matching branch and a passing test; `go vet` and `gofmt` are clean; both advisories are deployment or defense-in-depth notes with no current failure.

## Review Limits

- blocked or unavailable checks: the full `npm test` and `scripts/check-commits.mjs` were not run per the task's instruction to run only `go test ./internal/agent`; the commit subject was checked by hand against the Conventional Commits regex and 72-character limit.
- residual manual verification: none.
