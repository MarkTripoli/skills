package state

import (
	"os"
	"strings"
	"testing"
	"time"
)

func TestTokenFormat(t *testing.T) {
	a, _ := NewToken()
	b, _ := NewToken()
	if len(a) != 22 || a == b || strings.ContainsAny(a, "+/=") {
		t.Fatalf("%q %q", a, b)
	}
}

func TestWebLinkPersistsAndRotates(t *testing.T) {
	t.Setenv("XDG_STATE_HOME", t.TempDir())
	t1, err := EnsureToken(false)
	if err != nil {
		t.Fatal(err)
	}
	t2, _ := EnsureToken(false)
	if t1 != t2 {
		t.Fatal("token not reused")
	}
	w, _ := LoadWeb()
	w.URL, w.Addr = "http://127.0.0.1:1/?t="+t1, "127.0.0.1:1"
	if err := SaveWeb(w); err != nil {
		t.Fatal(err)
	}
	p, _ := WebPath()
	st, err := os.Stat(p)
	if err != nil || st.Mode().Perm() != 0o600 {
		t.Fatalf("mode %v %v", st, err)
	}
	if got, _ := LoadWeb(); got.URL != w.URL || got.Token != t1 {
		t.Fatalf("%+v", got)
	}
	t3, _ := EnsureToken(true)
	if t3 == t1 {
		t.Fatal("rotate kept the token")
	}
	if got, _ := LoadWeb(); got.URL != w.URL || got.Addr != w.Addr || got.Token != t3 {
		t.Fatalf("rotation must keep addr and url: %+v", got)
	}
}

func TestDirHonoursXDG(t *testing.T) {
	t.Setenv("XDG_STATE_HOME", "/x/state")
	if d, _ := Dir(); d != "/x/state/simview" {
		t.Fatal(d)
	}
}

func TestConcurrentWebLeasesShareTokenAndExcludeRotation(t *testing.T) {
	t.Setenv("XDG_STATE_HOME", t.TempDir())
	const instances = 12
	type result struct {
		lease *WebLease
		err   error
	}
	results := make(chan result, instances)
	start := make(chan struct{})
	for range instances {
		go func() {
			<-start
			lease, err := BeginWeb(false)
			results <- result{lease, err}
		}()
	}
	close(start)
	leases := make([]*WebLease, 0, instances)
	var token string
	for range instances {
		select {
		case got := <-results:
			if got.err != nil {
				t.Fatal(got.err)
			}
			t.Cleanup(func() { got.lease.Close() })
			leases = append(leases, got.lease)
			if token != "" && got.lease.Token != token {
				t.Fatal("concurrent startups selected different tokens")
			}
			token = got.lease.Token
		case <-time.After(10 * time.Second):
			t.Fatal("concurrent web startup blocked")
		}
	}
	for _, rotate := range []func() error{
		func() error { _, err := EnsureToken(true); return err },
		func() error { _, err := BeginWeb(true); return err },
	} {
		if err := rotate(); err == nil {
			t.Fatal("rotation succeeded with active web leases")
		}
	}
	if saved, err := LoadWeb(); err != nil || saved.Token != token {
		t.Fatalf("refused rotation changed token: %+v, %v", saved, err)
	}
	for _, lease := range leases {
		if err := lease.Close(); err != nil {
			t.Fatal(err)
		}
	}
	if next, err := EnsureToken(true); err != nil || next == token {
		t.Fatalf("rotation after release: %q, %v", next, err)
	}
}
