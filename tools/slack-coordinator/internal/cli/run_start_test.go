package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// fakeChannel is one row the fake conversations.info and conversations.list serve.
type fakeChannel struct {
	ID, Name         string
	Archived, Member bool
}

func (c fakeChannel) json() string {
	return fmt.Sprintf(`{"id":%q,"name":%q,"is_archived":%t,"is_member":%t}`, c.ID, c.Name, c.Archived, c.Member)
}

// testChannels is the workspace every CLI test sees. conversations.list serves
// one channel per page, so a name on a later page exercises the cursor.
var testChannels = []fakeChannel{
	{ID: "C0000000001", Name: "agent-runs", Member: true},
	{ID: "C0000000002", Name: "old-runs", Archived: true, Member: true},
	{ID: "C0000000003", Name: "private-ops", Member: false},
	{ID: "C0000000004", Name: "deep-runs", Member: true},
}

type fakeSlack struct {
	mu            sync.Mutex
	posts         []url.Values
	updates       []url.Values
	reactions     []url.Values
	failPosts     atomic.Bool
	failUpdates   atomic.Bool
	failReactions atomic.Bool
	requests      atomic.Int64
}

func (f *fakeSlack) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.posts)
}

// post returns the i-th recorded chat.postMessage form.
func (f *fakeSlack) post(i int) url.Values {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.posts[i]
}

func (f *fakeSlack) updateCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.updates)
}

// update returns the i-th recorded chat.update form.
func (f *fakeSlack) update(i int) url.Values {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.updates[i]
}

func newFakeSlack(t *testing.T) (*fakeSlack, string) {
	f := &fakeSlack{}
	mux := http.NewServeMux()
	mux.HandleFunc("/chat.postMessage", func(w http.ResponseWriter, r *http.Request) {
		if f.failPosts.Load() {
			http.Error(w, "slack is down", http.StatusInternalServerError)
			return
		}
		_ = r.ParseForm()
		f.mu.Lock()
		f.posts = append(f.posts, r.PostForm)
		ts := fmt.Sprintf("1700000000.%06d", len(f.posts)*100)
		f.mu.Unlock()
		_, _ = w.Write([]byte(`{"ok":true,"channel":"` + r.PostForm.Get("channel") + `","ts":"` + ts + `"}`))
	})
	mux.HandleFunc("/chat.update", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.mu.Lock()
		f.updates = append(f.updates, r.PostForm)
		f.mu.Unlock()
		if f.failUpdates.Load() {
			http.Error(w, "slack is down", http.StatusInternalServerError)
			return
		}
		_, _ = w.Write([]byte(`{"ok":true,"channel":"` + r.PostForm.Get("channel") + `","ts":"` + r.PostForm.Get("ts") + `","text":"edited"}`))
	})
	mux.HandleFunc("/reactions.add", func(w http.ResponseWriter, r *http.Request) {
		if f.failReactions.Load() {
			_, _ = w.Write([]byte(`{"ok":false,"error":"ratelimited"}`))
			return
		}
		_ = r.ParseForm()
		f.mu.Lock()
		f.reactions = append(f.reactions, r.PostForm)
		f.mu.Unlock()
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/chat.getPermalink", func(w http.ResponseWriter, r *http.Request) {
		ch := r.URL.Query().Get("channel")
		_, _ = w.Write([]byte(`{"ok":true,"channel":"` + ch + `","permalink":"https://t.slack.com/archives/` + ch + `/p1700000000000100"}`))
	})
	mux.HandleFunc("/conversations.info", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		for _, c := range testChannels {
			if c.ID == r.PostForm.Get("channel") {
				_, _ = w.Write([]byte(`{"ok":true,"channel":` + c.json() + `}`))
				return
			}
		}
		_, _ = w.Write([]byte(`{"ok":false,"error":"channel_not_found"}`))
	})
	mux.HandleFunc("/conversations.open", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.PostForm.Get("users") == "" {
			_, _ = w.Write([]byte(`{"ok":false,"error":"invalid_users"}`))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true,"channel":{"id":"D0000000001","is_im":true,"is_open":true,"is_member":true}}`))
	})
	mux.HandleFunc("/conversations.list", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		i, _ := strconv.Atoi(r.PostForm.Get("cursor"))
		if i >= len(testChannels) {
			_, _ = w.Write([]byte(`{"ok":true,"channels":[],"response_metadata":{"next_cursor":""}}`))
			return
		}
		next := ""
		if i+1 < len(testChannels) {
			next = strconv.Itoa(i + 1)
		}
		_, _ = w.Write([]byte(`{"ok":true,"channels":[` + testChannels[i].json() + `],"response_metadata":{"next_cursor":"` + next + `"}}`))
	})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.requests.Add(1)
		mux.ServeHTTP(w, r)
	}))
	t.Cleanup(srv.Close)
	return f, srv.URL
}

// startTestDaemon runs the daemon in-process against a fresh home under /tmp,
// so the Unix socket path fits, with Socket Mode reported connected, and
// returns a stop function.
func startTestDaemon(t *testing.T, cfg *config.Config) func() {
	return startTestDaemonWith(t, cfg, daemon.Options{SocketModeHealth: func() string { return slackapi.SocketConnected }})
}

// startTestDaemonWith is startTestDaemon with explicit daemon options. Tests
// always inject SocketModeHealth; no test opens a WebSocket.
func startTestDaemonWith(t *testing.T, cfg *config.Config, opts daemon.Options) func() {
	home := newTestHome(t)
	if err := config.Save(filepath.Join(home, "config.yaml"), cfg); err != nil {
		t.Fatal(err)
	}
	return startTestDaemonAt(t, home, cfg, opts)
}

// newTestHome creates a fresh runtime home under /tmp, so the Unix socket
// path fits, and points the CLI at it.
func newTestHome(t *testing.T) string {
	t.Helper()
	home, err := os.MkdirTemp("/tmp", "sc-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(home) })
	t.Setenv(paths.EnvHome, home)
	return home
}

// startTestDaemonAt serves cfg in-process from home, which need not hold a
// config.yaml, and returns a stop function.
func startTestDaemonAt(t *testing.T, home string, cfg *config.Config, opts daemon.Options) func() {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- daemon.Serve(ctx, paths.WithRoot(home), cfg, opts) }()
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

	args := []string{"run", "start", "--channel", "C0000000001", "--work", "Add flag", "--goal", "Print commands", "--scope", "cli", "--link", "https://example.com/pr/1", "--run-id", "RUN1"}
	out, code := runCLI(t, args...)
	if code != ExitOK {
		t.Fatalf("run start exit %d, output %q", code, out)
	}
	var ref coordinator.SlackRunRef
	if err := json.Unmarshal([]byte(out), &ref); err != nil {
		t.Fatalf("stdout %q is not JSON: %v", out, err)
	}
	want := coordinator.SlackRunRef{RunID: "RUN1", ChannelID: "C0000000001", ThreadTS: "1700000000.000100", Permalink: "https://t.slack.com/archives/C0000000001/p1700000000000100"}
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
	if fake.posts[0].Get("channel") != "C0000000001" {
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

// writeRepo creates a repository root holding AGENTS.md with body and returns its path.
func writeRepo(t *testing.T, agentsMD string) string {
	repo := t.TempDir()
	if err := os.WriteFile(filepath.Join(repo, "AGENTS.md"), []byte(agentsMD), 0o600); err != nil {
		t.Fatal(err)
	}
	return repo
}

func TestRunStartResolvesAgentsMDDirectiveByName(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	startTestDaemon(t, cfg)
	repo := writeRepo(t, "# Project\n\nSlack default channel: #Deep-Runs\n")

	out, code := runCLI(t, "run", "start", "--repo", repo, "--work", "x", "--run-id", "RUN2")
	if code != ExitOK {
		t.Fatalf("run start exit %d, output %q", code, out)
	}
	var ref coordinator.SlackRunRef
	if err := json.Unmarshal([]byte(out), &ref); err != nil {
		t.Fatalf("stdout %q is not JSON: %v", out, err)
	}
	if ref.ChannelID != "C0000000004" {
		t.Fatalf("resolved channel %q, want C0000000004 (#deep-runs on the last list page)", ref.ChannelID)
	}
	if fake.count() != 1 || fake.posts[0].Get("channel") != "C0000000004" {
		t.Fatalf("posts = %d to %q", fake.count(), fake.posts[0].Get("channel"))
	}
}

func TestRunStartRefusesUnusableChannelsBeforePosting(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	startTestDaemon(t, cfg)

	cases := []struct {
		name string
		args []string
		want string
	}{
		{name: "archived by flag id", args: []string{"--channel", "C0000000002"}, want: "channel #old-runs is archived"},
		{name: "not a member by flag name", args: []string{"--channel", "#private-ops"}, want: "bot is not a member of #private-ops"},
		{name: "unknown id", args: []string{"--channel", "C0000000009"}, want: "channel C0000000009 not found"},
		{name: "unknown name from AGENTS.md", args: []string{"--repo", writeRepo(t, "Slack default channel: #nowhere\n")}, want: "channel #nowhere not found"},
		{name: "archived from AGENTS.md", args: []string{"--repo", writeRepo(t, "Slack default channel: old-runs\n")}, want: "channel #old-runs is archived"},
		{name: "no directive", args: []string{"--repo", writeRepo(t, "# Project\n")}, want: "no `Slack default channel:` line"},
		{name: "two directives", args: []string{"--repo", writeRepo(t, "Slack default channel: #a\nSlack default channel: #b\n")}, want: "more than one"},
		{name: "missing AGENTS.md", args: []string{"--repo", t.TempDir()}, want: "AGENTS.md"},
		{name: "comma in channel", args: []string{"--channel", "C0000000001,C0000000004"}, want: "without spaces or commas"},
		{name: "space in channel", args: []string{"--channel", "agent runs"}, want: "without spaces or commas"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var stderr bytes.Buffer
			SetOutput(&stderr)
			t.Cleanup(func() { output = os.Stdout })
			root := NewRoot()
			root.SetArgs(append([]string{"run", "start", "--work", "x"}, tc.args...))
			err := root.Execute()
			if code := exitCode(err); code != ExitUsage {
				t.Fatalf("exit %d, want %d (err %v)", code, ExitUsage, err)
			}
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error %q does not name the cause %q", err, tc.want)
			}
		})
	}
	if fake.count() != 0 {
		t.Fatalf("refused channels still posted %d messages", fake.count())
	}
}

func TestRunStartRejectsOwnerFlagBeforeAnyCall(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	startTestDaemon(t, cfg)

	SetOutput(&bytes.Buffer{})
	t.Cleanup(func() { output = os.Stdout })
	root := NewRoot()
	root.SetArgs([]string{"run", "start", "--owner", "U1", "--work", "w", "--goal", "g", "--scope", "s"})
	err := root.Execute()
	if code := exitCode(err); code != ExitUsage {
		t.Fatalf("exit %d, want %d (err %v)", code, ExitUsage, err)
	}
	if err == nil || !strings.Contains(err.Error(), "unknown flag: --owner") {
		t.Fatalf("error %q does not name the unknown flag", err)
	}
	if n := fake.requests.Load(); n != 0 {
		t.Fatalf("rejected --owner still made %d Slack calls", n)
	}
}
