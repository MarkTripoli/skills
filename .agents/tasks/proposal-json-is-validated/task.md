---
slug: proposal-json-is-validated
title: "proposal.json is validated into a Proposal on run exit"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - agent-runner-spawns-an
issue: 53
---
In `tools/slack-coordinator/internal/agent/proposal.go`, replace the placeholder with:

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
    DebounceSeconds int    `json:"debounce_seconds,omitempty"` // each_message; default 300
}
type DeliverTo struct { DM bool `json:"dm,omitempty"`; ChannelID string `json:"channel_id,omitempty"`; ThreadTS string `json:"thread_ts,omitempty"` }
func (p Proposal) Validate() error
func ReadProposal(dir string) (*Proposal, error) // nil, nil when the file is absent
```

`Validate` rules: `Watch` non-empty; `Instruction` non-empty; `Kind` one of the three; `schedule` has exactly one of `Daily` (matching `^\d{2}:\d{2}$`, and `TZ` empty or a loadable IANA zone) or `EveryHours > 0`; `window_end` has `At` parsing as RFC 3339; `each_message` has `DebounceSeconds >= 0` (0 means default 300) and no `Daily`/`EveryHours`/`At`; `DeliverTo` has exactly one of `DM == true` or `ChannelID != ""`. Each error names the field, for example `trigger: schedule needs exactly one of daily or every_hours`.

In `run.go`'s `Wait`, after `ReadOutputs`, call `ReadProposal(spec.RunDir)` and set `Proposal` or `ProposalErr` on the outcome (a JSON syntax error is also `ProposalErr`). `Result` keeps the `result.md` text when both files exist.

Proof: table tests in `internal/agent/proposal_test.go` for one valid proposal per trigger kind and one case per rule; extend `run_test.go` with a `FAKE_MODE=proposal` branch in `testdata/fake-agent.sh` that writes both files, asserting `Proposal != nil` and `Result` set. `go test ./internal/agent`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN `proposal.json` in the run directory parses and `Validate` passes, `RunOutcome.Proposal` shall be non-nil and `ProposalErr` nil.
- IF `proposal.json` is present but malformed JSON, has zero or more than one trigger form, an empty `watch`, an empty `instruction`, or `deliver_to` with both or neither of `dm` and `channel_id`, THEN `RunOutcome.ProposalErr` shall name the failing field and `Proposal` shall be nil.
- WHEN both `proposal.json` and `result.md` are present, `RunOutcome.Result` shall still carry the `result.md` text.
