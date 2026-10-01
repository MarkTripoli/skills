package coordinator

import (
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/slack-go/slack"
)

// Slack limits Block Kit text objects to 2,000 characters. Oversized content
// keeps its complete plain-text fallback rather than being truncated.
const maxBlockText = 2000

// SlackMessage is the chat.postMessage payload: Text is the accessible
// fallback, while Blocks carries the structured Block Kit view.
type SlackMessage struct {
	Text   string        `json:"text"`
	Blocks []slack.Block `json:"blocks,omitempty"`
}

// RootMessage is the fixed content of the thread's first message. Work is the
// issue name shown as the Block Kit header.
type RootMessage struct {
	Work        string
	Goal        string
	Scope       string
	Links       []string
	OwnerUserID string
	StartedAt   string
}

type messageField struct {
	label string
	value string
}

// RenderRoot renders the accessible fallback for the compact thread root.
func RenderRoot(m RootMessage) string {
	return rootFallback(m, rootFields(m), rootTitle(m))
}

// BuildRootMessage returns the compact root and its accessible fallback.
func BuildRootMessage(m RootMessage) SlackMessage {
	fields := rootFields(m)
	return buildFieldsMessage(rootTitle(m), fields, RenderRoot(m))
}

// BuildRunRoot preserves the previous root-edit schema for runs created before
// thread status cards were introduced.
func BuildRunRoot(root RootMessage, status *WorkEvent, finish *FinishRunInput, finishedAt string) SlackMessage {
	title := rootTitle(root)
	fields := legacyRootFields(root)
	fallback := legacyRootFallback(root, fields)
	if status != nil {
		statusFields := legacyStatusFields(*status)
		fields = append(fields, statusFields...)
		fallback += "\n" + strings.Join(statusFields, "\n")
	}
	if finish != nil {
		title = "Run finished: " + finish.Outcome
		finishFields := legacyCompletionFields(*finish, finishedAt)
		fields = append(fields, finishFields...)
		fallback += "\n" + strings.Join(finishFields, "\n")
	}
	return buildLegacyMessage(title, fields, fallback)
}

// BuildProgressMessage returns the one editable status card in the run thread.
func BuildProgressMessage(root RootMessage, event WorkEvent) SlackMessage {
	fields := statusFields(event)
	contexts, linkFields := linkContext(root.Links)
	fallbackFields := append(append([]messageField(nil), fields...), linkFields...)
	return buildRichFieldsMessage("Progress", fields, nil, contexts, renderFields(fallbackFields))
}

// RenderStatus renders the compact progress fallback used to detect changes.
func RenderStatus(m WorkEvent) string {
	return renderFields(statusFields(m))
}

// BuildStatusMessage returns a compact status card without root-only context.
func BuildStatusMessage(m WorkEvent) SlackMessage {
	return BuildProgressMessage(RootMessage{}, m)
}

func statusFields(m WorkEvent) []messageField {
	if m.Note != "" {
		return []messageField{{label: "Update", value: m.Note}}
	}
	fields := make([]messageField, 0, 2)
	if m.Current != "" {
		fields = append(fields, messageField{label: "Now", value: m.Current})
	}
	if m.Next != nil && compactValues(m.Next) != "" {
		fields = append(fields, messageField{label: "Next", value: compactValues(m.Next)})
	}
	return fields
}

// BuildCompletionMessage returns the concise terminal card for a run.
func BuildCompletionMessage(root RootMessage, m FinishRunInput) SlackMessage {
	primary := completionPrimaryFields(m)
	secondary := completionDetailFields(m)
	contexts, linkFields := linkContext(appendUnique(root.Links, m.Links))
	fallbackFields := append(append([]messageField(nil), primary...), secondary...)
	fallbackFields = append(fallbackFields, linkFields...)
	return buildRichFieldsMessage("Run summary", primary, secondary, contexts, renderFields(fallbackFields))
}

// RenderCompletion renders the concise terminal fallback.
func RenderCompletion(root RootMessage, m FinishRunInput) string {
	return renderFields(completionFields(root, m))
}

// BuildBlockerMessage returns the structured notification for one new blocker.
// A non-empty ownerID adds a direct mention so Slack notifies the run owner.
func BuildBlockerMessage(blocker, ownerID string) SlackMessage {
	fields := []messageField{{label: "Blocker", value: blocker}}
	if ownerID != "" {
		fields = append(fields, messageField{label: "Owner", value: "<@" + ownerID + ">"})
	}
	return buildFieldsMessage("⚠️ Blocked", fields, renderFields(fields))
}

func rootFields(m RootMessage) []messageField {
	fields := make([]messageField, 0, 2)
	if m.Goal != "" {
		fields = append(fields, messageField{label: "Goal", value: m.Goal})
	}
	if m.Scope != "" {
		fields = append(fields, messageField{label: "Scope", value: m.Scope})
	}
	return fields
}

func completionFields(root RootMessage, m FinishRunInput) []messageField {
	fields := append(completionPrimaryFields(m), completionDetailFields(m)...)
	if links := compactValues(formatLinks(appendUnique(root.Links, m.Links))); links != "" {
		fields = append(fields, messageField{label: "Links", value: links})
	}
	return fields
}

func completionPrimaryFields(m FinishRunInput) []messageField {
	fields := make([]messageField, 0, 2)
	if m.Outcome != "" {
		fields = append(fields, messageField{label: "Outcome", value: m.Outcome})
	}
	if summary := compactValues(m.Completed); summary != "" {
		fields = append(fields, messageField{label: "Summary", value: summary})
	}
	return fields
}

func completionDetailFields(m FinishRunInput) []messageField {
	fields := make([]messageField, 0, 2)
	if unresolved := compactValues(m.Unresolved); unresolved != "" {
		fields = append(fields, messageField{label: "Unresolved", value: unresolved})
	}
	if evidence := compactValues(m.Evidence); evidence != "" {
		fields = append(fields, messageField{label: "Evidence", value: evidence})
	}
	return fields
}

func linkContext(links []string) ([]string, []messageField) {
	if value := compactValues(formatLinks(links)); value != "" {
		return []string{"*Links:* " + value}, []messageField{{label: "Links", value: value}}
	}
	return nil, nil
}

func legacyRootFields(m RootMessage) []string {
	owner := ""
	if m.OwnerUserID != "" {
		owner = "<@" + m.OwnerUserID + ">"
	}
	return []string{field("Work", m.Work), field("Goal", m.Goal), field("Scope", m.Scope), field("Owner", owner), list("Links", formatLinks(m.Links)), field("Started at", m.StartedAt)}
}

func RenderLegacyStatus(m WorkEvent) string {
	return strings.Join(legacyStatusFields(m), "\n")
}

func legacyStatusFields(m WorkEvent) []string {
	if m.Note != "" {
		return []string{field("Latest update", m.Note)}
	}
	return []string{
		field("Current work", m.Current),
		list("Completed since last update", m.Completed),
		list("Decisions", m.Decisions),
		list("Blockers", m.Blockers),
		list("Up next", m.Next),
	}
}

func legacyCompletionFields(m FinishRunInput, finishedAt string) []string {
	return []string{
		field("Outcome", m.Outcome),
		list("Completed work", m.Completed),
		list("Decisions", m.Decisions),
		list("Unresolved items", m.Unresolved),
		list("Evidence", m.Evidence),
		list("Links", formatLinks(m.Links)),
		field("Finished at", finishedAt),
	}
}

func legacyRootFallback(m RootMessage, fields []string) string {
	return strings.Join(fields, "\n")
}

func buildLegacyMessage(title string, fields []string, fallback string) SlackMessage {
	blocks := []slack.Block{
		slack.NewHeaderBlock(slack.NewTextBlockObject(slack.PlainTextType, headerTitle(title), true, false)),
	}
	for _, field := range fields {
		if utf8.RuneCountInString(field) > 3000 {
			return SlackMessage{Text: fallback}
		}
		if strings.HasSuffix(field, ":* None") {
			continue
		}
		blocks = append(blocks, slack.NewSectionBlock(slack.NewTextBlockObject(slack.MarkdownType, field, false, false), nil, nil))
	}
	return SlackMessage{Text: fallback, Blocks: blocks}
}

func field(label, value string) string {
	if value == "" {
		return "*" + label + ":* None"
	}
	return "*" + label + ":* " + value
}

func list(label string, items []string) string {
	if len(items) == 0 {
		return field(label, "")
	}
	bullets := make([]string, 0, len(items))
	for _, item := range items {
		bullets = append(bullets, "• "+item)
	}
	return "*" + label + ":*\n" + strings.Join(bullets, "\n")
}

func rootFallback(m RootMessage, fields []messageField, title string) string {
	issue := m.Work
	if issue == "" {
		issue = title
	}
	return renderFields(append([]messageField{{label: "Issue", value: issue}}, fields...))
}

func renderFields(fields []messageField) string {
	lines := make([]string, 0, len(fields))
	for _, field := range fields {
		if field.value != "" {
			lines = append(lines, "*"+field.label+":* "+field.value)
		}
	}
	return strings.Join(lines, "\n")
}

func buildFieldsMessage(title string, fields []messageField, fallback string) SlackMessage {
	return buildRichFieldsMessage(title, fields, nil, nil, fallback)
}

func buildRichFieldsMessage(title string, primary, secondary []messageField, contexts []string, fallback string) SlackMessage {
	blocks := []slack.Block{
		slack.NewHeaderBlock(slack.NewTextBlockObject(slack.PlainTextType, headerTitle(title), true, false)),
	}
	primaryBlock, ok := sectionFields(primary)
	if !ok {
		return SlackMessage{Text: fallback}
	}
	if primaryBlock != nil {
		blocks = append(blocks, primaryBlock)
	}
	if len(secondary) > 0 || len(contexts) > 0 {
		if primaryBlock != nil {
			blocks = append(blocks, slack.NewDividerBlock())
		}
		secondaryBlock, ok := sectionFields(secondary)
		if !ok {
			return SlackMessage{Text: fallback}
		}
		if secondaryBlock != nil {
			blocks = append(blocks, secondaryBlock)
		}
		for _, line := range contexts {
			if utf8.RuneCountInString(line) > maxBlockText {
				return SlackMessage{Text: fallback}
			}
			text := slack.NewTextBlockObject(slack.MarkdownType, line, false, false)
			blocks = append(blocks, slack.NewContextBlock("", text))
		}
	}
	return SlackMessage{Text: fallback, Blocks: blocks}
}

func sectionFields(fields []messageField) (*slack.SectionBlock, bool) {
	if len(fields) == 0 {
		return nil, true
	}
	if len(fields) > 10 {
		return nil, false
	}
	blockFields := make([]*slack.TextBlockObject, 0, len(fields))
	for _, field := range fields {
		text := "*" + field.label + ":*\n" + field.value
		if field.value == "" || utf8.RuneCountInString(text) > maxBlockText {
			return nil, false
		}
		blockFields = append(blockFields, slack.NewTextBlockObject(slack.MarkdownType, text, false, false))
	}
	return slack.NewSectionBlock(nil, blockFields, nil), true
}

func rootTitle(m RootMessage) string {
	if m.Work == "" {
		return "Run started"
	}
	return m.Work
}

func compactValues(values []string) string {
	items := make([]string, 0, len(values))
	for _, value := range values {
		if value != "" {
			items = append(items, value)
		}
	}
	return strings.Join(items, " · ")
}

var jiraIssueKeyPattern = regexp.MustCompile(`(?i)^[A-Z][A-Z0-9_]+-\d+$`)

func formatLinks(links []string) []string {
	formatted := make([]string, 0, len(links))
	for _, raw := range links {
		if raw == "" {
			continue
		}
		target := strings.NewReplacer("|", "%7C", "<", "%3C", ">", "%3E").Replace(raw)
		label := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(linkLabel(raw))
		formatted = append(formatted, "<"+target+"|"+label+">")
	}
	return formatted
}

func linkLabel(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Hostname() == "" {
		return "Open link"
	}
	if key := jiraIssueKey(parsed); key != "" {
		return key
	}
	if number := routeNumber(parsed.Path, "merge_requests"); number != "" {
		return "MR !" + number
	}
	if number := routeNumber(parsed.Path, "pull"); number != "" {
		return "PR #" + number
	}
	return strings.ToLower(parsed.Hostname())
}

func jiraIssueKey(link *url.URL) string {
	segments := strings.Split(strings.Trim(link.Path, "/"), "/")
	for i, segment := range segments {
		if strings.EqualFold(segment, "browse") && i+1 < len(segments) {
			if key := issueKey(segments[i+1]); key != "" {
				return key
			}
		}
	}
	host := strings.ToLower(link.Hostname())
	if strings.Contains(host, "jira") || strings.HasSuffix(host, "atlassian.net") {
		for _, segment := range segments {
			if key := issueKey(segment); key != "" {
				return key
			}
		}
	}
	return ""
}

func issueKey(segment string) string {
	if jiraIssueKeyPattern.MatchString(segment) {
		return strings.ToUpper(segment)
	}
	return ""
}

func routeNumber(path, route string) string {
	segments := strings.Split(strings.Trim(path, "/"), "/")
	for i, segment := range segments {
		if segment == route && i+1 < len(segments) && segments[i+1] != "" {
			return segments[i+1]
		}
	}
	return ""
}

func appendUnique(first, second []string) []string {
	result := append([]string(nil), first...)
	for _, value := range second {
		if value == "" || slicesContains(result, value) {
			continue
		}
		result = append(result, value)
	}
	return result
}

func slicesContains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

// headerTitle keeps a Slack header inside its 150-character limit.
func headerTitle(title string) string {
	if utf8.RuneCountInString(title) <= 150 {
		return title
	}
	return string([]rune(title)[:147]) + "..."
}
