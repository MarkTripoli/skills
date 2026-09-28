package agent

import (
	"context"
	"strings"
	"testing"
)

func TestCodexTurnCompletionAccumulatesReportedReasoningTokens(t *testing.T) {
	var usage TokenUsage
	var lastMessage, codexErr, threadID string
	stream := `{"type":"turn.completed","usage":{"input_tokens":20,"cached_input_tokens":4,"output_tokens":8,"reasoning_output_tokens":7}}` + "\n"
	if err := parseCodexEvents(context.Background(), strings.NewReader(stream), nil, &usage, &lastMessage, &codexErr, &threadID, nil); err != nil {
		t.Fatal(err)
	}
	if usage.ReasoningTokens != 7 || !usage.ReasoningReported {
		t.Fatalf("Codex reasoning usage=%+v; want 7 reported tokens", usage)
	}
}
