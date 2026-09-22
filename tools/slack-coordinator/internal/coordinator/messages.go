package coordinator

import "strings"

// none is what an empty field renders as, so every message shows every field.
const none = "None"

// RootMessage is the fixed content of the thread's first message.
type RootMessage struct {
	Work        string
	Goal        string
	Scope       string
	OwnerUserID string
	Links       []string
	StartedAt   string
}

// RenderRoot renders the root message as Slack mrkdwn. Field order is fixed:
// Work, Goal, Scope, Owner, Links, Started at.
func RenderRoot(m RootMessage) string {
	owner := ""
	if m.OwnerUserID != "" {
		owner = "<@" + m.OwnerUserID + ">"
	}
	return strings.Join([]string{
		field("Work", m.Work),
		field("Goal", m.Goal),
		field("Scope", m.Scope),
		field("Owner", owner),
		list("Links", m.Links),
		field("Started at", m.StartedAt),
	}, "\n")
}

// RenderStatus renders a status message. Field order is fixed: Current work,
// Completed since last update, Decisions, Blockers, Up next.
func RenderStatus(m WorkEvent) string {
	return strings.Join([]string{
		field("Current work", m.Current),
		list("Completed since last update", m.Completed),
		list("Decisions", m.Decisions),
		list("Blockers", m.Blockers),
		list("Up next", m.Next),
	}, "\n")
}

// RenderCompletion renders the completion message. Field order is fixed:
// Outcome, Completed work, Decisions, Unresolved items, Evidence, Links,
// Finished at.
func RenderCompletion(m FinishRunInput, finishedAt string) string {
	return strings.Join([]string{
		field("Outcome", m.Outcome),
		list("Completed work", m.Completed),
		list("Decisions", m.Decisions),
		list("Unresolved items", m.Unresolved),
		list("Evidence", m.Evidence),
		list("Links", m.Links),
		field("Finished at", finishedAt),
	}, "\n")
}

// field renders "*Label:* value", with None for an empty value.
func field(label, value string) string {
	if value == "" {
		value = none
	}
	return "*" + label + ":* " + value
}

// list renders a label followed by one bullet line per item, or None.
func list(label string, items []string) string {
	if len(items) == 0 {
		return field(label, "")
	}
	var b strings.Builder
	b.WriteString("*" + label + ":*")
	for _, item := range items {
		b.WriteString("\n• " + item)
	}
	return b.String()
}
