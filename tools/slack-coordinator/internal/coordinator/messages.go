package coordinator

import (
	"strings"
	"unicode/utf8"

	"github.com/slack-go/slack"
)

// none is what an empty field renders as, so every message shows every field.
const none = "None"

// Slack limits section text objects to 3000 characters. Oversized fields keep
// the complete plain-text fallback rather than being truncated or rejected.
const maxSectionText = 3000

// SlackMessage is the chat.postMessage payload: Text is the accessible
// fallback, while Blocks carries the structured Block Kit view.
type SlackMessage struct {
	Text   string        `json:"text"`
	Blocks []slack.Block `json:"blocks,omitempty"`
}

// RootMessage is the fixed content of the thread's first message.
type RootMessage struct {
	Work        string
	Goal        string
	Scope       string
	OwnerUserID string
	Links       []string
	StartedAt   string
}

// RenderRoot renders the root fallback as Slack mrkdwn. Field order is fixed:
// Work, Goal, Scope, Owner, Links, Started at.
func RenderRoot(m RootMessage) string {
	return strings.Join(rootFields(m), "\n")
}

// BuildRootMessage returns the structured thread root and its fallback text.
func BuildRootMessage(m RootMessage) SlackMessage {
	title := m.Work
	if title == "" {
		title = "Run started"
	}
	return buildMessage(headerTitle(title), rootFields(m))
}

// BuildRunRoot keeps the original goal and scope visible while replacing the
// run's current details in the same root message.
func BuildRunRoot(root RootMessage, status *WorkEvent, finish *FinishRunInput, finishedAt string) SlackMessage {
	fields := rootFields(root)
	title := headerTitle(root.Work)
	if status != nil {
		fields = append(fields, statusFields(*status)...)
		if status.Note != "" {
			fields = append(fields, field("Latest update", status.Note))
		}
	}
	if finish != nil {
		title = "Run finished: " + finish.Outcome
		fields = append(fields, completionFields(*finish, finishedAt)...)
	}
	return buildMessage(headerTitle(title), fields)
}

func rootFields(m RootMessage) []string {
	owner := ""
	if m.OwnerUserID != "" {
		owner = "<@" + m.OwnerUserID + ">"
	}
	return []string{
		field("Work", m.Work),
		field("Goal", m.Goal),
		field("Scope", m.Scope),
		field("Owner", owner),
		list("Links", m.Links),
		field("Started at", m.StartedAt),
	}
}

// RenderStatus renders the status fallback. Field order is fixed: Current work,
// Completed since last update, Decisions, Blockers, Up next.
func RenderStatus(m WorkEvent) string {
	return strings.Join(statusFields(m), "\n")
}

// BuildStatusMessage returns the structured status reply and its fallback text.
func BuildStatusMessage(m WorkEvent) SlackMessage {
	if m.Note != "" {
		return buildMessage("Update", []string{m.Note})
	}
	return buildMessage("Run update", statusFields(m))
}

func statusFields(m WorkEvent) []string {
	return []string{
		field("Current work", m.Current),
		list("Completed since last update", m.Completed),
		list("Decisions", m.Decisions),
		list("Blockers", m.Blockers),
		list("Up next", m.Next),
	}
}

// RenderCompletion renders the completion fallback. Field order is fixed:
// Outcome, Completed work, Decisions, Unresolved items, Evidence, Links,
// Finished at.
func RenderCompletion(m FinishRunInput, finishedAt string) string {
	return strings.Join(completionFields(m, finishedAt), "\n")
}

// BuildCompletionMessage returns the structured completion reply and its fallback text.
func BuildCompletionMessage(m FinishRunInput, finishedAt string) SlackMessage {
	return buildMessage("Run finished", completionFields(m, finishedAt))
}

func completionFields(m FinishRunInput, finishedAt string) []string {
	return []string{
		field("Outcome", m.Outcome),
		list("Completed work", m.Completed),
		list("Decisions", m.Decisions),
		list("Unresolved items", m.Unresolved),
		list("Evidence", m.Evidence),
		list("Links", m.Links),
		field("Finished at", finishedAt),
	}
}

func buildMessage(title string, fields []string) SlackMessage {
	fallback := strings.Join(fields, "\n")
	blocks := make([]slack.Block, 0, len(fields)+1)
	blocks = append(blocks, slack.NewHeaderBlock(slack.NewTextBlockObject(slack.PlainTextType, title, true, false)))
	for _, text := range fields {
		if utf8.RuneCountInString(text) > maxSectionText {
			return SlackMessage{Text: fallback}
		}
		if omittedSection(text) {
			continue
		}
		blocks = append(blocks, slack.NewSectionBlock(slack.NewTextBlockObject(slack.MarkdownType, text, false, false), nil, nil))
	}
	return SlackMessage{Text: fallback, Blocks: blocks}
}

// headerTitle keeps a Slack header inside its 150-character limit.
func headerTitle(title string) string {
	if utf8.RuneCountInString(title) <= 150 {
		return title
	}
	return string([]rune(title)[:147]) + "..."
}

// omittedSection is an empty field rendered as None. Blocks skip it. The
// text fallback still includes it. A list whose items include the word None
// is not empty.
func omittedSection(text string) bool {
	return !strings.Contains(text, "\n") && strings.HasSuffix(text, ":* "+none)
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
