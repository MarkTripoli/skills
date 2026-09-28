package agent

import (
	"context"
	"strings"
	"testing"
)

func TestCopilotUsageReportsOnlyObservedOutputCounter(t *testing.T) {
	var usage TokenUsage
	var messages []string
	var copilotErr string
	var exitCode int
	stream := `{"type":"assistant.message","data":{"content":"done","outputTokens":0}}` + "\n"
	if err := parseCopilotEvents(context.Background(), strings.NewReader(stream), nil, &usage, &messages, &copilotErr, &exitCode); err != nil {
		t.Fatal(err)
	}
	if !usage.Reported || !usage.OutputTokensReported || usage.OutputTokens != 0 {
		t.Fatalf("observed zero output usage lost: %+v", usage)
	}
	if usage.InputTokensReported || usage.CacheReadTokensReported {
		t.Fatalf("Copilot invented unavailable input/cache coverage: %+v", usage)
	}
}
