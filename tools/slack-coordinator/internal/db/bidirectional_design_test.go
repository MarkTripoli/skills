package db

import (
	"context"
	"path/filepath"
	"sync"
	"testing"
)

func TestBidirectionalClaimsAreExclusiveAndTerminalNoticeIdempotent(t *testing.T) {
	d, err := Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()
	if err := d.InsertRun(ctx, Run{RunID: "r", OwnerUserID: "U", ChannelID: "C", ThreadTS: "1", Permalink: "p", Lifecycle: "active", SlackMode: "enabled", StartedAt: "now"}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.InsertOwnerInput(ctx, OwnerInput{RunID: "r", MessageTS: "2", Text: "hello", ReceivedAt: "now"}); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	wins := make(chan bool, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ok, err := d.ClaimOwnerInput(ctx, "r", "2", "now")
			if err != nil {
				t.Error(err)
				return
			}
			wins <- ok
		}()
	}
	wg.Wait()
	close(wins)
	count := 0
	for ok := range wins {
		if ok {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("claim winners = %d, want 1", count)
	}
	first, err := d.RecordTerminalNotice(ctx, "r", "3")
	if err != nil || !first {
		t.Fatalf("first notice = %t, %v", first, err)
	}
	second, err := d.RecordTerminalNotice(ctx, "r", "3")
	if err != nil || second {
		t.Fatalf("duplicate notice = %t, %v", second, err)
	}
	third, err := d.RecordTerminalNotice(ctx, "r", "4")
	if err != nil || !third {
		t.Fatalf("different owner message notice = %t, %v", third, err)
	}
}
