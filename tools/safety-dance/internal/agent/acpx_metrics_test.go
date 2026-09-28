package agent

import (
	"context"
	"strings"
	"testing"
)

func TestAcpxUsagePreservesMissingCountersAndObservedZero(t *testing.T) {
	var usage TokenUsage
	stream := `{"method":"session/update","params":{"update":{"sessionUpdate":"usage_update","used":17}}}` + "\n"
	if _, _, err := parseAcpxJSONEvents(context.Background(), strings.NewReader(stream), nil, &usage); err != nil {
		t.Fatal(err)
	}
	if !usage.Reported || !usage.InputTokensReported || usage.InputTokens != 17 || usage.OutputTokensReported || usage.CacheReadTokensReported {
		t.Fatalf("input-only usage invented output or cache coverage: %+v", usage)
	}

	stream = `{"result":{"usage":{"output_tokens":0,"cache_read_tokens":0}}}` + "\n"
	if _, _, err := parseAcpxJSONEvents(context.Background(), strings.NewReader(stream), nil, &usage); err != nil {
		t.Fatal(err)
	}
	if !usage.OutputTokensReported || usage.OutputTokens != 0 || !usage.CacheReadTokensReported || usage.CacheReadTokens != 0 {
		t.Fatalf("observed zero counters lost across events: %+v", usage)
	}
}

func TestAcpxCacheCreationOnlyDoesNotClaimPrimaryCounters(t *testing.T) {
	var usage TokenUsage
	stream := `{"method":"session/update","params":{"update":{"sessionUpdate":"usage_update","cache_write_tokens":0}}}` + "\n"
	if _, _, err := parseAcpxJSONEvents(context.Background(), strings.NewReader(stream), nil, &usage); err != nil {
		t.Fatal(err)
	}
	if usage.Reported || !usage.CacheCreationReported || usage.InputTokensReported || usage.OutputTokensReported || usage.CacheReadTokensReported || resultFromUsage(usage) == nil {
		t.Fatalf("cache-only usage gained primary coverage or lost observed zero: %+v", usage)
	}
}
