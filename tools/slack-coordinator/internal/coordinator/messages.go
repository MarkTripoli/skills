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
