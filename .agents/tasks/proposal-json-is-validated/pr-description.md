Ticket: [#53](https://github.com/MarkTripoli/skills/issues/53) | Task: `proposal-json-is-validated`

## Purpose

`RunOutcome.Proposal` and `ProposalErr` were declared by the runner (#83) but never set; `internal/agent` now parses `proposal.json` from the run directory into a typed `Proposal`, validates it with field-named errors, and fills the outcome on exit so the coordinator can turn an agent's standing request into a watch.

## Acceptance criteria

- WHEN `proposal.json` parses and `Validate` passes, `Proposal` is non-nil and `ProposalErr` nil: `TestProposalIsValidatedAlongsideResult` runs `testdata/fake-agent.sh` in `FAKE_MODE=proposal` through `Start`/`Wait` and asserts `ProposalErr == nil`, `Proposal.Trigger.Kind == "schedule"`, `Daily == "09:00"`, `DeliverTo.DM == true`; `TestProposalValidate` has one valid row per trigger kind (`schedule` daily, `schedule` every_hours, `window_end`, `each_message` to a channel thread).
- IF `proposal.json` is malformed JSON, has zero or more than one trigger form, an empty `watch`, an empty `instruction`, or `deliver_to` with both or neither of `dm` and `channel_id`, THEN `ProposalErr` names the field and `Proposal` is nil: `TestInvalidProposalSetsProposalErr` drives the zero-form shape through `Wait` and asserts `Proposal == nil` and the error contains `trigger: schedule needs exactly one of daily or every_hours`; `TestReadProposalRejectsMalformedJSON` (`{"watch": ["C1"],`) and `TestReadProposalRejectsInvalidProposal` (`watch: []`) return `nil` plus a `proposal.json:` error; the `TestProposalValidate` rows `schedule with both forms`, `empty watch`, `empty instruction`, `deliver_to neither`, `deliver_to both` assert the field prefix. The remaining shapes reach `Wait` through the single assignment at `run.go:151`.
- WHEN both `proposal.json` and `result.md` are present, `Result` still carries the `result.md` text: both `Wait` tests assert `Result == "the report\n"`; `TestProposalIsValidatedAlongsideResult` also asserts `ResultSource == "result.md"`.

`go test -count=1 ./internal/agent` from `tools/slack-coordinator`: `ok ... 0.553s`; `go test -run Proposal -v` lists 25 passing tests and subtests.

## Special things to note

- `time.LoadLocation` (`proposal.go:82`) reads host zoneinfo; the binary imports no `time/tzdata`, so in a scratch or distroless container every non-empty `tz` fails as `trigger.tz: unknown time zone`. Fine for the current host-daemon deployment; the code review records it as ADV-001.
- `json.Unmarshal` into a fixed struct drops unknown keys, so a misspelled key such as `every_hour` is not reported by name; the proposal then fails the next rule it breaks (`trigger: schedule needs exactly one of daily or every_hours`). `DisallowUnknownFields` was not asked for and would reject forward-compatible fields.
- `meta.json` is unchanged: whether a proposal was found or rejected lives only in the returned `RunOutcome`, so a later `!show` cannot report it. The watch-creation child that consumes `Proposal` decides what to persist.

## Change outline

One new test file and one new fake-agent mode; standard library only (`encoding/json`, `regexp`, `time`), `go.mod` untouched:

```text
tools/slack-coordinator/internal/agent/
  proposal.go              Proposal, Trigger, DeliverTo, Trigger* constants, Validate, ReadProposal   (placeholder replaced)
  proposal_test.go         TestProposalValidate (4 valid + 14 failing rows), 4 ReadProposal tests     (new)
  run.go                   wait: one line after ReadOutputs                                            (+1)
  run_test.go              TestProposalIsValidatedAlongsideResult, TestInvalidProposalSetsProposalErr  (+2 tests)
  rundir.go                proposalFile = "proposal.json" joins the run-directory file constants
  testdata/fake-agent.sh   FAKE_MODE=proposal writes result.md and a valid schedule proposal.json
```

Schema the agent writes, as `proposal.go:15-40` declares it:

```go
type Proposal struct {
    Watch       []string  `json:"watch"`        // channel ids or "#name"
    Trigger     Trigger   `json:"trigger"`
    Instruction string    `json:"instruction"`
    DeliverTo   DeliverTo `json:"deliver_to"`
    Summary     string    `json:"summary"`
}
type Trigger struct {
    Kind            string `json:"kind"`                       // schedule | window_end | each_message
    Daily           string `json:"daily,omitempty"`            // HH:MM
    TZ              string `json:"tz,omitempty"`               // IANA; may be empty
    EveryHours      int    `json:"every_hours,omitempty"`
    At              string `json:"at,omitempty"`               // RFC 3339, window_end
    DebounceSeconds int    `json:"debounce_seconds,omitempty"` // each_message; 0 means 300
}
type DeliverTo struct { DM bool; ChannelID string; ThreadTS string }
```

`Validate` (`proposal.go:53-101`) returns the first rule broken, each error prefixed by its field:

```text
Validate
  watch empty                              -> watch: must not be empty
  instruction empty                        -> instruction: must not be empty
  Trigger.validate by kind
    schedule: (daily != "") == (every_hours != 0)   -> trigger: schedule needs exactly one of daily or every_hours
              every_hours < 0                      -> trigger.every_hours: must be positive
              daily !~ ^\d{2}:\d{2}$               -> trigger.daily: must be HH:MM
              tz set and LoadLocation fails        -> trigger.tz: unknown time zone
    window_end: time.Parse(RFC3339, at) fails      -> trigger.at: window_end needs an RFC 3339 time
    each_message: debounce_seconds < 0             -> trigger.debounce_seconds: must not be negative
                  daily | every_hours | at set     -> trigger: each_message takes no daily, every_hours, or at
    other                                          -> trigger.kind: must be schedule, window_end, or each_message
  dm == (channel_id != "")                 -> deliver_to: needs exactly one of dm or channel_id
```

Run exit, the one changed line:

```diff
 wait
   Result, ResultSource = ReadOutputs(RunDir, adapter.FinalTextPath(RunDir))
+  Proposal, ProposalErr = ReadProposal(RunDir)    absent file -> nil, nil; syntax or Validate error -> nil, "proposal.json: <field>: ..."
   StderrTail = tailLines(stderr.log, 20)
   writeMeta(meta.json)
```

`ReadProposal` wraps every error as `proposal.json: %w`, so a consumer matching on the field name uses `strings.Contains`, not `HasPrefix`.

## Human Review

### Review targets

- The two equality-as-exclusive-or checks, `proposal.go:63` (`DM == (ChannelID != "")`) and `:72` (`(Daily != "") == (EveryHours != 0)`), and the `EveryHours < 0` follow-up at `:75` that keeps a negative value from counting as a form.
- `time.Parse(time.RFC3339, t.At)` at `:87` rejecting an empty `At` for `window_end` without a separate empty check.
- `ReadProposal` at `:105-121`: `errors.Is(err, os.ErrNotExist)` is the only path that returns `nil, nil`; a permission error surfaces as `ProposalErr`.
- `run.go:151` sits after `ReadOutputs` and before `writeMeta`, so `Result` is read regardless of the proposal outcome.

### Verify

- [ ] `Commits` and Go checks pass on the pull request.
- [ ] A reviewer confirms `proposal.go` imports only the standard library and that `meta.json` (`run.go:158-163`) was intentionally left without proposal fields.

### Known limits

- Acceptance criterion 2 lists six failure shapes; only the zero-trigger-form shape is driven through `Wait`, the other five through `Validate` or `ReadProposal` directly.
- Only `testdata/fake-agent.sh` was run; no live agent wrote a `proposal.json`.
- No `.changeset/` entry: nothing outside `internal/agent` reads `Proposal` yet, matching siblings #83 and #78; the epic pull request owns the user-facing entry.
- No plan artifact exists for this oneshot child, so the description was checked against `task.md` and [01-code-review-proposal-json-is-validated.md](.agents/tasks/proposal-json-is-validated/01-code-review-proposal-json-is-validated.md); the pull request base is `epic-slack-assistant-bot-dms` from `task.md` `base:`.

Closes #53
