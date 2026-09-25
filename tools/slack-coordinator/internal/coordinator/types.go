// Package coordinator holds the use cases the daemon runs on behalf of agents.
// Types here are the JSON-RPC wire shapes shared with the CLI.
package coordinator

// StartRunInput opens one Slack thread for a run. The owner is not part of the
// input: the daemon stamps its configured owner on every run.
type StartRunInput struct {
	RunID     string   `json:"run_id"`
	ChannelID string   `json:"channel_id,omitempty"`
	DM        bool     `json:"dm,omitempty"`
	Work      string   `json:"work"`
	Goal      string   `json:"goal"`
	Scope     string   `json:"scope"`
	Links     []string `json:"links"`
	StartedAt string   `json:"started_at"`
}

// SlackRunRef identifies the thread a run posts to.
type SlackRunRef struct {
	RunID     string `json:"run_id"`
	ChannelID string `json:"channel_id"`
	ThreadTS  string `json:"thread_ts"`
	Permalink string `json:"permalink"`
}

// RunSummary identifies the run a gate answer is about.
type RunSummary struct {
	RunID     string `json:"run_id"`
	ChannelID string `json:"channel_id"`
	Permalink string `json:"permalink"`
}

// DisableSlackParams names the run a run.disable_slack request disables Slack for.
type DisableSlackParams struct {
	RunID string `json:"run_id"`
}

// WorkEvent is the latest status shown on an active run's root message.
type WorkEvent struct {
	RunID     string   `json:"run_id"`
	Current   string   `json:"current"`
	Completed []string `json:"completed"`
	Decisions []string `json:"decisions"`
	Blockers  []string `json:"blockers"`
	Next      []string `json:"next"`
	Note      string   `json:"note,omitempty"`
}

// StatusCadenceInput changes how often pending routine events reach the root.
type StatusCadenceInput struct {
	RunID   string `json:"run_id"`
	Seconds int64  `json:"seconds"`
}

// ReactRunInput adds one emoji to the root message of any run.
type ReactRunInput struct {
	RunID string `json:"run_id"`
	Emoji string `json:"emoji"`
}

// FinishRunInput closes a run with one completion message.
type FinishRunInput struct {
	RunID      string   `json:"run_id"`
	Outcome    string   `json:"outcome"`
	Emoji      string   `json:"emoji,omitempty"`
	Completed  []string `json:"completed"`
	Decisions  []string `json:"decisions"`
	Unresolved []string `json:"unresolved"`
	Evidence   []string `json:"evidence"`
	Links      []string `json:"links"`
}

// OwnerInput is one owner reply in a run's thread that the agent has not yet
// answered. run check returns the oldest pending one.
type OwnerInput struct {
	RunID     string `json:"run_id"`
	ChannelID string `json:"channel_id"`
	ThreadTS  string `json:"thread_ts"`
	MessageTS string `json:"message_ts"`
	Text      string `json:"text"`
}

// OwnerInputResolution answers one pending OwnerInput.
type OwnerInputResolution struct {
	RunID     string `json:"run_id"`
	MessageTS string `json:"message_ts"`
	Outcome   string `json:"outcome"`
	Reply     string `json:"reply"`
}
