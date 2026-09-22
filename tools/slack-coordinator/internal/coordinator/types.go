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
