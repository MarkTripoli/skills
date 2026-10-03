package coordinator

import (
	"encoding/json"
	"strings"
	"testing"
)

type blockKitText struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type blockKitElement struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type blockKitBlock struct {
	Type     string            `json:"type"`
	Text     blockKitText      `json:"text"`
	Fields   []blockKitText    `json:"fields"`
	Elements []blockKitElement `json:"elements"`
}

func assertBlockKitMessage(t *testing.T, got SlackMessage, title string, fields []string, fallback string) {
	t.Helper()
	if got.Text != fallback {
		t.Fatalf("fallback text = %q, want %q", got.Text, fallback)
	}
	data, err := json.Marshal(got.Blocks)
	if err != nil {
		t.Fatal(err)
	}
	var blocks []blockKitBlock
	if err := json.Unmarshal(data, &blocks); err != nil {
		t.Fatal(err)
	}
	wantBlocks := 1
	if len(fields) > 0 {
		wantBlocks++
	}
	if len(blocks) != wantBlocks {
		t.Fatalf("got %d blocks, want header plus optional fields: %s", len(blocks), data)
	}
	if blocks[0].Type != "header" || blocks[0].Text != (blockKitText{Type: "plain_text", Text: title}) {
		t.Fatalf("header = %+v", blocks[0])
	}
	if len(fields) == 0 {
		return
	}
	if blocks[1].Type != "section" || blocks[1].Text.Text != "" || len(blocks[1].Fields) != len(fields) {
		t.Fatalf("section = %+v, want %d fields", blocks[1], len(fields))
	}
	for i, field := range fields {
		if blocks[1].Fields[i] != (blockKitText{Type: "mrkdwn", Text: field}) {
			t.Errorf("field %d = %+v, want %q", i, blocks[1].Fields[i], field)
		}
	}
}

func assertLegacyBlockKitMessage(t *testing.T, got SlackMessage, title string, fields []string, fallback string) {
	t.Helper()
	if got.Text != fallback {
		t.Fatalf("legacy fallback = %q, want %q", got.Text, fallback)
	}
	data, err := json.Marshal(got.Blocks)
	if err != nil {
		t.Fatal(err)
	}
	var blocks []blockKitBlock
	if err := json.Unmarshal(data, &blocks); err != nil {
		t.Fatal(err)
	}
	if len(blocks) != len(fields)+1 || blocks[0].Type != "header" || blocks[0].Text.Text != title {
		t.Fatalf("legacy blocks = %s", data)
	}
	for i, field := range fields {
		if blocks[i+1].Type != "section" || blocks[i+1].Text != (blockKitText{Type: "mrkdwn", Text: field}) {
			t.Errorf("legacy section %d = %+v, want %q", i, blocks[i+1], field)
		}
	}
}

func assertRichBlockKitMessage(t *testing.T, got SlackMessage, title string, primary, secondary []string, context, fallback string) {
	t.Helper()
	if got.Text != fallback {
		t.Fatalf("fallback text = %q, want %q", got.Text, fallback)
	}
	data, err := json.Marshal(got.Blocks)
	if err != nil {
		t.Fatal(err)
	}
	var blocks []blockKitBlock
	if err := json.Unmarshal(data, &blocks); err != nil {
		t.Fatal(err)
	}
	if len(blocks) == 0 || blocks[0].Type != "header" || blocks[0].Text.Text != title {
		t.Fatalf("header = %+v", blocks)
	}
	index := 1
	assertFields := func(want []string) {
		t.Helper()
		if len(want) == 0 {
			return
		}
		if index >= len(blocks) || blocks[index].Type != "section" || len(blocks[index].Fields) != len(want) {
			t.Fatalf("block %d = %+v, want section with %d fields", index, blocks, len(want))
		}
		for i, field := range want {
			if blocks[index].Fields[i] != (blockKitText{Type: "mrkdwn", Text: field}) {
				t.Errorf("field %d = %+v, want %q", i, blocks[index].Fields[i], field)
			}
		}
		index++
	}
	assertFields(primary)
	if len(secondary) > 0 || context != "" {
		if len(primary) > 0 {
			if index >= len(blocks) || blocks[index].Type != "divider" {
				t.Fatalf("block %d = %+v, want divider", index, blocks)
			}
			index++
		}
		assertFields(secondary)
		if context != "" {
			if index >= len(blocks) || blocks[index].Type != "context" || len(blocks[index].Elements) != 1 || blocks[index].Elements[0] != (blockKitElement{Type: "mrkdwn", Text: context}) {
				t.Fatalf("context block = %+v, want %q", blocks, context)
			}
			index++
		}
	}
	if index != len(blocks) {
		t.Fatalf("unexpected blocks: %+v", blocks[index:])
	}
}

func TestBuildLifecycleMessagesUsesCompactBlockKitSchemas(t *testing.T) {
	root := RootMessage{
		Work: "Profile enhancements", Goal: "Improve profile editing", Scope: "Profile screen",
		Links: []string{"https://github.com/MarkTripoli/skills/pull/1", "https://jira.example/browse/PROJ-2"},
	}
	assertBlockKitMessage(t, BuildRootMessage(root), "Profile enhancements", []string{
		"*Goal:*\nImprove profile editing",
		"*Scope:*\nProfile screen",
	}, RenderRoot(root))

	status := WorkEvent{Current: "Reviewing", Completed: []string{"Built"}, Decisions: []string{"Use Go"}, Blockers: []string{"Need approval"}, Next: []string{"Test"}}
	assertRichBlockKitMessage(t, BuildProgressMessage(root, status), "Progress", []string{
		"*Now:*\nReviewing",
		"*Next:*\nTest",
	}, nil, "*Links:* <https://github.com/MarkTripoli/skills/pull/1|PR #1> · <https://jira.example/browse/PROJ-2|PROJ-2>", "*Now:* Reviewing\n*Next:* Test\n*Links:* <https://github.com/MarkTripoli/skills/pull/1|PR #1> · <https://jira.example/browse/PROJ-2|PROJ-2>")

	completion := FinishRunInput{Outcome: "completed", Completed: []string{"Shipped"}, Decisions: []string{"Keep fallback"}, Unresolved: []string{"Flaky UI test"}, Evidence: []string{"go test passes"}, Links: []string{"https://github.com/MarkTripoli/skills/pull/1"}}
	assertRichBlockKitMessage(t, BuildCompletionMessage(root, completion), "Run summary", []string{
		"*Outcome:*\ncompleted",
		"*Summary:*\nShipped",
	}, []string{
		"*Unresolved:*\nFlaky UI test",
		"*Evidence:*\ngo test passes",
	}, "*Links:* <https://github.com/MarkTripoli/skills/pull/1|PR #1> · <https://jira.example/browse/PROJ-2|PROJ-2>", "*Outcome:* completed\n*Summary:* Shipped\n*Unresolved:* Flaky UI test\n*Evidence:* go test passes\n*Links:* <https://github.com/MarkTripoli/skills/pull/1|PR #1> · <https://jira.example/browse/PROJ-2|PROJ-2>")

	assertBlockKitMessage(t, BuildStatusMessage(WorkEvent{Note: "Review passed."}), "Progress", []string{"*Update:*\nReview passed."}, "*Update:* Review passed.")
	assertBlockKitMessage(t, BuildBlockerMessage("Need review", ""), "⚠️ Blocked", []string{"*Blocker:*\nNeed review"}, "*Blocker:* Need review")
	assertBlockKitMessage(t, BuildBlockerMessage("Need review", "U0123ABC"), "⚠️ Blocked", []string{"*Blocker:*\nNeed review", "*Owner:*\n<@U0123ABC>"}, "*Blocker:* Need review\n*Owner:* <@U0123ABC>")
}

func TestBuildLifecycleMessageUsesTextFallbackForOversizedField(t *testing.T) {
	value := strings.Repeat("🪨", maxBlockText)
	message := BuildStatusMessage(WorkEvent{Current: value})
	if len(message.Blocks) != 0 {
		t.Fatalf("oversized field emitted %d blocks", len(message.Blocks))
	}
	if !strings.Contains(message.Text, value) {
		t.Fatal("oversized fallback lost field content")
	}
	if message.Blocks != nil {
		t.Fatalf("fallback blocks = %#v, want nil", message.Blocks)
	}
}

func TestBuildStatusOmitsEmptyFields(t *testing.T) {
	event := WorkEvent{Current: "Reviewing"}
	message := BuildStatusMessage(event)
	assertBlockKitMessage(t, message, "Progress", []string{"*Now:*\nReviewing"}, RenderStatus(event))
	if strings.Contains(message.Text, "Decisions") || strings.Contains(message.Text, "None") {
		t.Fatalf("fallback contains omitted fields: %q", message.Text)
	}
}
