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

type blockKitBlock struct {
	Type string       `json:"type"`
	Text blockKitText `json:"text"`
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
	if len(blocks) != len(fields)+1 {
		t.Fatalf("got %d blocks, want header plus %d sections: %s", len(blocks), len(fields), data)
	}
	if blocks[0].Type != "header" || blocks[0].Text != (blockKitText{Type: "plain_text", Text: title}) {
		t.Fatalf("header = %+v", blocks[0])
	}
	for i, field := range fields {
		if blocks[i+1].Type != "section" || blocks[i+1].Text != (blockKitText{Type: "mrkdwn", Text: field}) {
			t.Fatalf("block %d = %+v, want section %q", i+1, blocks[i+1], field)
		}
	}
}

func TestBuildLifecycleMessagesUsesOrderedBlockKitSchemas(t *testing.T) {
	root := RootMessage{Work: "Ship release", Goal: "Deliver", Scope: "CLI", OwnerUserID: "U1", Links: []string{"https://example.test"}, StartedAt: "2026-09-25T12:00:00Z"}
	rootFields := []string{"*Work:* Ship release", "*Goal:* Deliver", "*Scope:* CLI", "*Owner:* <@U1>", "*Links:*\n• https://example.test", "*Started at:* 2026-09-25T12:00:00Z"}
	assertBlockKitMessage(t, BuildRootMessage(root), "Ship release", rootFields, strings.Join(rootFields, "\n"))

	status := WorkEvent{Current: "Implementing", Completed: []string{"Schema"}, Decisions: []string{"Keep API"}, Blockers: []string{"Review"}, Next: []string{"Merge"}}
	statusFields := []string{"*Current work:* Implementing", "*Completed since last update:*\n• Schema", "*Decisions:*\n• Keep API", "*Blockers:*\n• Review", "*Up next:*\n• Merge"}
	assertBlockKitMessage(t, BuildStatusMessage(status), "Run update", statusFields, strings.Join(statusFields, "\n"))

	finish := FinishRunInput{Outcome: "Success", Completed: []string{"Feature"}, Decisions: []string{"Ship"}, Unresolved: []string{"None"}, Evidence: []string{"Smoke run"}, Links: []string{"https://example.test"}}
	finishFields := []string{"*Outcome:* Success", "*Completed work:*\n• Feature", "*Decisions:*\n• Ship", "*Unresolved items:*\n• None", "*Evidence:*\n• Smoke run", "*Links:*\n• https://example.test", "*Finished at:* 2026-09-25T12:10:00Z"}
	assertBlockKitMessage(t, BuildCompletionMessage(finish, "2026-09-25T12:10:00Z"), "Run finished", finishFields, strings.Join(finishFields, "\n"))
}

func TestBuildLifecycleMessageUsesTextFallbackForOversizedSection(t *testing.T) {
	long := strings.Repeat("x", maxSectionText)
	got := BuildStatusMessage(WorkEvent{Current: long})
	want := "*Current work:* " + long + "\n*Completed since last update:* None\n*Decisions:* None\n*Blockers:* None\n*Up next:* None"
	if got.Text != want {
		t.Fatalf("fallback lost oversized content: got %d chars, want %d", len(got.Text), len(want))
	}
	if len(got.Blocks) != 0 {
		t.Fatalf("oversized message should use fallback only, got %d blocks", len(got.Blocks))
	}
}

func TestBuildStatusOmitsEmptySections(t *testing.T) {
	got := BuildStatusMessage(WorkEvent{Current: "Working", Blockers: []string{"blocked"}})
	data, err := json.Marshal(got.Blocks)
	if err != nil {
		t.Fatal(err)
	}
	var blocks []blockKitBlock
	if err := json.Unmarshal(data, &blocks); err != nil {
		t.Fatal(err)
	}
	if len(blocks) != 3 || blocks[1].Text.Text != "*Current work:* Working" || blocks[2].Text.Text != "*Blockers:*\n• blocked" {
		t.Fatalf("empty sections not omitted or order changed: %s", data)
	}
	if strings.Count(got.Text, "None") != 3 {
		t.Fatalf("fallback should retain all empty fields: %q", got.Text)
	}
}

func TestBuildNoteIsOneSentence(t *testing.T) {
	got := BuildStatusMessage(WorkEvent{Note: "A concise update."})
	assertBlockKitMessage(t, got, "Update", []string{"A concise update."}, "A concise update.")
}
