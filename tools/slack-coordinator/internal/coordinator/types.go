// Package coordinator holds the use cases the daemon runs on behalf of agents.
// Types here are the JSON-RPC wire shapes shared with the CLI.
package coordinator

// StartRunInput opens one Slack thread for a run.
type StartRunInput struct {
	RunID       string   `json:"run_id"`
	OwnerUserID string   `json:"owner_user_id"`
	ChannelID   string   `json:"channel_id"`
	Work        string   `json:"work"`
	Goal        string   `json:"goal"`
	Scope       string   `json:"scope"`
	Links       []string `json:"links"`
	// StartedAt is filled by the daemon and ignored on input.
	StartedAt string `json:"started_at"`
}

// SlackRunRef identifies the thread a run posts to.
type SlackRunRef struct {
	RunID     string `json:"run_id"`
	ChannelID string `json:"channel_id"`
	ThreadTS  string `json:"thread_ts"`
	Permalink string `json:"permalink"`
}

// RunSummary identifies the run a gate answer is about; run check returns it
// with every kind so the CLI can show the operator which thread is affected.
type RunSummary struct {
	RunID     string `json:"run_id"`
	ChannelID string `json:"channel_id"`
	Permalink string `json:"permalink"`
}

// DisableSlackParams names the run a run.disable_slack request breaks glass on.
type DisableSlackParams struct {
	RunID string `json:"run_id"`
}

// WorkEvent is one status update for an active run. It is posted as a thread
// reply and stored as the run's last status for quiet-interval reposts.
type WorkEvent struct {
	RunID     string   `json:"run_id"`
	Current   string   `json:"current"`
	Completed []string `json:"completed"`
	Decisions []string `json:"decisions"`
	Blockers  []string `json:"blockers"`
	Next      []string `json:"next"`
}

// FinishRunInput closes a run with one completion message.
type FinishRunInput struct {
	RunID      string   `json:"run_id"`
	Outcome    string   `json:"outcome"` // completed | failed | cancelled
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

// OwnerInputResolution answers one pending OwnerInput: Reply is posted in the
// thread and Outcome records what the agent did with the input.
type OwnerInputResolution struct {
	RunID     string `json:"run_id"`
	MessageTS string `json:"message_ts"`
	Outcome   string `json:"outcome"` // applied | rejected | answered
	Reply     string `json:"reply"`
}
