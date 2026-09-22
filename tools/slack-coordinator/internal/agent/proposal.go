package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

// Proposal is the parsed proposal.json an agent may leave in its run
// directory: a standing request the coordinator can turn into a watch.
type Proposal struct {
	Watch       []string  `json:"watch"` // channel ids or "#name"
	Trigger     Trigger   `json:"trigger"`
	Instruction string    `json:"instruction"`
	DeliverTo   DeliverTo `json:"deliver_to"`
	Summary     string    `json:"summary"`
}

// Trigger says when the watch fires. Kind selects the form; the other
// fields belong to one form each.
type Trigger struct {
	Kind            string `json:"kind"`                       // schedule | window_end | each_message
	Daily           string `json:"daily,omitempty"`            // HH:MM
	TZ              string `json:"tz,omitempty"`               // IANA; may be empty
	EveryHours      int    `json:"every_hours,omitempty"`      // schedule
	At              string `json:"at,omitempty"`               // RFC 3339, window_end
	DebounceSeconds int    `json:"debounce_seconds,omitempty"` // each_message; default 300
}

// DeliverTo names where the watch's output goes: the requester's DM or a
// channel, optionally inside a thread.
type DeliverTo struct {
	DM        bool   `json:"dm,omitempty"`
	ChannelID string `json:"channel_id,omitempty"`
	ThreadTS  string `json:"thread_ts,omitempty"`
}

// Trigger kinds.
const (
	TriggerSchedule    = "schedule"
	TriggerWindowEnd   = "window_end"
	TriggerEachMessage = "each_message"
)

var dailyPattern = regexp.MustCompile(`^\d{2}:\d{2}$`)

// Validate reports the first rule the proposal breaks; every error names the
// field it is about.
func (p Proposal) Validate() error {
	if len(p.Watch) == 0 {
		return errors.New("watch: must not be empty")
	}
	if p.Instruction == "" {
		return errors.New("instruction: must not be empty")
	}
	if err := p.Trigger.validate(); err != nil {
		return err
	}
	if p.DeliverTo.DM == (p.DeliverTo.ChannelID != "") {
		return errors.New("deliver_to: needs exactly one of dm or channel_id")
	}
	return nil
}

func (t Trigger) validate() error {
	switch t.Kind {
	case TriggerSchedule:
		if (t.Daily != "") == (t.EveryHours != 0) {
			return errors.New("trigger: schedule needs exactly one of daily or every_hours")
		}
		if t.EveryHours < 0 {
			return fmt.Errorf("trigger.every_hours: must be positive, got %d", t.EveryHours)
		}
		if t.Daily != "" && !dailyPattern.MatchString(t.Daily) {
			return fmt.Errorf("trigger.daily: must be HH:MM, got %q", t.Daily)
		}
		if t.TZ != "" {
			if _, err := time.LoadLocation(t.TZ); err != nil {
				return fmt.Errorf("trigger.tz: unknown time zone %q", t.TZ)
			}
		}
	case TriggerWindowEnd:
		if _, err := time.Parse(time.RFC3339, t.At); err != nil {
			return fmt.Errorf("trigger.at: window_end needs an RFC 3339 time, got %q", t.At)
		}
	case TriggerEachMessage:
		if t.DebounceSeconds < 0 {
			return fmt.Errorf("trigger.debounce_seconds: must not be negative, got %d", t.DebounceSeconds)
		}
		if t.Daily != "" || t.EveryHours != 0 || t.At != "" {
			return errors.New("trigger: each_message takes no daily, every_hours, or at")
		}
	default:
		return fmt.Errorf("trigger.kind: must be schedule, window_end, or each_message, got %q", t.Kind)
	}
	return nil
}

// ReadProposal parses and validates dir/proposal.json. An absent file yields
// nil, nil; a syntax error or a failed Validate yields nil and the error.
func ReadProposal(dir string) (*Proposal, error) {
	b, err := os.ReadFile(filepath.Join(dir, proposalFile))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("%s: %w", proposalFile, err)
	}
	var p Proposal
	if err := json.Unmarshal(b, &p); err != nil {
		return nil, fmt.Errorf("%s: %w", proposalFile, err)
	}
	if err := p.Validate(); err != nil {
		return nil, fmt.Errorf("%s: %w", proposalFile, err)
	}
	return &p, nil
}
