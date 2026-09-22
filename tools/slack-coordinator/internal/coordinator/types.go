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
