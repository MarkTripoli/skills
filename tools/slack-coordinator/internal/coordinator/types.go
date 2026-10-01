// Package coordinator holds the use cases the daemon runs on behalf of agents.
// Types here are the JSON-RPC wire shapes shared with the CLI.
package coordinator

// StartRunInput opens one Slack thread for a run. The owner is not part of the
// input: the daemon stamps its configured owner on every run.
type StartRunInput struct {
	RunID     string   `json:"run_id"`
	ChannelID string   `json:"channel_id,omitempty"`
	DM        bool     `json:"dm,omitempty"`
	Work      string   `json:"work"` // Issue name shown as the root message title.
	Goal      string   `json:"goal"`
	Scope     string   `json:"scope"`
	Links     []string `json:"links"`
	// JiraIssue, when set, is the issue whose configured field receives the
	// thread permalink after the root message posts.
	JiraIssue string `json:"jira_issue,omitempty"`
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

// WorkEvent is the latest status shown on an active run's editable card.
type WorkEvent struct {
	RunID     string   `json:"run_id"`
	Current   string   `json:"current"`
	Completed []string `json:"completed"`
	Decisions []string `json:"decisions"`
	Blockers  []string `json:"blockers"`
	Next      []string `json:"next"`
	// Note is a one-sentence update. When set, the card shows it instead of Now/Next.
	Note string `json:"note,omitempty"`
}

// StatusCadenceInput changes how often pending routine events edit the status card.
// Urgent blockers and completion are always immediate.
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
	Outcome    string   `json:"outcome"`         // completed | failed | cancelled
	Emoji      string   `json:"emoji,omitempty"` // empty uses the outcome default; none disables it
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
