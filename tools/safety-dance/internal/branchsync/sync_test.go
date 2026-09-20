package branchsync

import (
	"context"
	"testing"
)

func TestSyncRequiresRemoteAndRef(t *testing.T) {
	if _, err := (Syncer{}).LiveHead(context.Background()); err == nil {
		t.Fatal("expected missing remote/ref error")
	}
}
