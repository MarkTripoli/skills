package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
)

type fakeSlack struct {
	mu    sync.Mutex
	posts []url.Values
}

func (f *fakeSlack) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.posts)
}

func newFakeSlack(t *testing.T) (*fakeSlack, string) {
	f := &fakeSlack{}
	mux := http.NewServeMux()
	mux.HandleFunc("/chat.postMessage", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.mu.Lock()
		f.posts = append(f.posts, r.PostForm)
		f.mu.Unlock()
		_, _ = w.Write([]byte(`{"ok":true,"channel":"` + r.PostForm.Get("channel") + `","ts":"1700000000.000100"}`))
	})
	mux.HandleFunc("/chat.getPermalink", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"ok":true,"channel":"C1","permalink":"https://t.slack.com/archives/C1/p1700000000000100"}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return f, srv.URL
}

// startTestDaemon runs the daemon in-process against a fresh home under /tmp,
// so the Unix socket path fits, and returns a stop function.
func startTestDaemon(t *testing.T, cfg *config.Config) func() {
	home, err := os.MkdirTemp("/tmp", "sc-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(home) })
	t.Setenv(paths.EnvHome, home)
	if err := config.Save(filepath.Join(home, "config.yaml"), cfg); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- daemon.Serve(ctx, paths.WithRoot(home), cfg, daemon.Options{}) }()
	var once sync.Once
	stop := func() {
		once.Do(func() {
			cancel()
			if err := <-done; err != nil {
				t.Errorf("daemon.Serve: %v", err)
			}
		})
	}
	t.Cleanup(stop)
	if err := waitForDaemon(5 * time.Second); err != nil {
		t.Fatalf("daemon never became healthy: %v", err)
	}
	return stop
}

func runCLI(t *testing.T, args ...string) (string, int) {
	var buf bytes.Buffer
	SetOutput(&buf)
	t.Cleanup(func() { output = os.Stdout })
	root := NewRoot()
	root.SetArgs(args)
	err := root.Execute()
	return buf.String(), exitCode(err)
}

func TestRunStartPostsOneRootMessage(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	stop := startTestDaemon(t, cfg)

	args := []string{"run", "start", "--channel", "C1", "--work", "Add flag", "--goal", "Print commands", "--scope", "cli", "--link", "https://example.com/pr/1", "--run-id", "RUN1"}
	out, code := runCLI(t, args...)
	if code != ExitOK {
		t.Fatalf("run start exit %d, output %q", code, out)
	}
	var ref coordinator.SlackRunRef
	if err := json.Unmarshal([]byte(out), &ref); err != nil {
		t.Fatalf("stdout %q is not JSON: %v", out, err)
	}
	want := coordinator.SlackRunRef{RunID: "RUN1", ChannelID: "C1", ThreadTS: "1700000000.000100", Permalink: "https://t.slack.com/archives/C1/p1700000000000100"}
	if ref != want {
		t.Fatalf("stdout = %+v, want %+v", ref, want)
	}
	if fake.count() != 1 {
		t.Fatalf("chat.postMessage called %d times, want 1", fake.count())
	}
	text := fake.posts[0].Get("text")
	for _, part := range []string{"*Work:* Add flag", "*Owner:* <@U1>", "• https://example.com/pr/1"} {
		if !strings.Contains(text, part) {
			t.Errorf("root text missing %q:\n%s", part, text)
		}
	}
	if fake.posts[0].Get("channel") != "C1" {
		t.Errorf("posted to channel %q", fake.posts[0].Get("channel"))
	}

	if _, code := runCLI(t, args...); code != ExitUsage {
		t.Fatalf("duplicate run-id exit %d, want %d", code, ExitUsage)
	}
	if fake.count() != 1 {
		t.Fatalf("duplicate run-id posted; %d posts", fake.count())
	}

	stop()
	if _, code := runCLI(t, args...); code != ExitUnavailable {
		t.Fatalf("run start with daemon stopped exit %d, want %d", code, ExitUnavailable)
	}
}

func TestRunStartRequiresChannel(t *testing.T) {
	t.Setenv(paths.EnvHome, t.TempDir())
	if _, code := runCLI(t, "run", "start", "--work", "x"); code != ExitUsage {
		t.Fatalf("missing --channel exit %d, want %d", code, ExitUsage)
	}
}
