package cli

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/manifest"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// runOnboard executes `onboard args...` with stdin answering the prompts in
// order and the browser opener recording URLs instead of launching anything.
func runOnboard(t *testing.T, stdin string, args ...string) (out string, urls []string, err error) {
	t.Helper()
	real := openBrowser
	openBrowser = func(u string) error {
		urls = append(urls, u)
		return nil
	}
	t.Cleanup(func() { openBrowser = real })
	var buf bytes.Buffer
	SetOutput(&buf)
	t.Cleanup(func() { output = os.Stdout })
	root := NewRoot()
	root.SetIn(strings.NewReader(stdin))
	root.SetArgs(append([]string{"onboard"}, args...))
	err = root.Execute()
	return buf.String(), urls, err
}

// onboardSlack is the fake Slack a full onboard, a setup run, and the daemon's
// verification DM need. It records the manifest authorization and body, every
// token auth.test, apps.connections.open, and users.info carried, and every
// chat.postMessage form; conversations.open answers D0CLI for any user.
type onboardSlack struct {
	url                        string
	manifestAuth, manifestBody string
	authTokens, probeTokens    []string
	infoTokens, infoUsers      []string

	mu    sync.Mutex
	posts []url.Values
}

// waitPost returns the first chat.postMessage to channel, or fails after five
// seconds.
func (f *onboardSlack) waitPost(t *testing.T, channel string) url.Values {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		f.mu.Lock()
		for _, p := range f.posts {
			if p.Get("channel") == channel {
				f.mu.Unlock()
				return p
			}
		}
		f.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("no chat.postMessage to %s", channel)
	return nil
}

func newOnboardSlack(t *testing.T) *onboardSlack {
	t.Helper()
	f := &onboardSlack{}
	mux := http.NewServeMux()
	mux.HandleFunc("/apps.manifest.create", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.manifestAuth, f.manifestBody = r.Header.Get("Authorization"), r.PostForm.Get("manifest")
		_, _ = w.Write([]byte(`{"ok":true,"app_id":"A0CLI","oauth_authorize_url":"https://slack.com/oauth/v2/authorize?client_id=cli"}`))
	})
	mux.HandleFunc("/auth.test", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.authTokens = append(f.authTokens, r.PostForm.Get("token"))
		_, _ = w.Write([]byte(`{"ok":true,"url":"https://t.slack.com/","team":"T","user":"bot","team_id":"T1","user_id":"UBOT","bot_id":"B1"}`))
	})
	mux.HandleFunc("/apps.connections.open", func(w http.ResponseWriter, r *http.Request) {
		f.probeTokens = append(f.probeTokens, strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		_, _ = w.Write([]byte(`{"ok":true,"url":"wss://example.invalid/link"}`))
	})
	mux.HandleFunc("/users.info", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.mu.Lock()
		f.infoTokens = append(f.infoTokens, r.PostForm.Get("token"))
		f.infoUsers = append(f.infoUsers, r.PostForm.Get("user"))
		f.mu.Unlock()
		_, _ = w.Write([]byte(`{"ok":true,"user":{"id":"U0CLI","real_name":"Ada Lovelace","tz":"Europe/London","profile":{"real_name":"Ada Lovelace","display_name":"ada"}}}`))
	})
	mux.HandleFunc("/conversations.open", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"ok":true,"channel":{"id":"D0CLI"}}`))
	})
	mux.HandleFunc("/chat.postMessage", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.mu.Lock()
		f.posts = append(f.posts, r.PostForm)
		f.mu.Unlock()
		_, _ = w.Write([]byte(`{"ok":true,"channel":"` + r.PostForm.Get("channel") + `","ts":"1700000000.000100"}`))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "unexpected "+r.URL.Path, http.StatusNotFound)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	f.url = srv.URL
	slackAPIURL = srv.URL
	t.Cleanup(func() { slackAPIURL = "" })
	return f
}

// ownerDM is the Socket Mode envelope for a top-level DM from user in channel.
func ownerDM(user, channel, ts, text string) socketmode.Event {
	return socketmode.Event{
		Type: socketmode.EventTypeEventsAPI,
		Data: slackevents.EventsAPIEvent{
			Type: slackevents.CallbackEvent,
			InnerEvent: slackevents.EventsAPIInnerEvent{
				Type: string(slackevents.Message),
				Data: &slackevents.MessageEvent{Type: "message", User: user, Text: text, TimeStamp: ts, Channel: channel},
			},
		},
		Request: &socketmode.Request{Type: "events_api", EnvelopeID: ts},
	}
}

func TestOnboardWritesTheConfigInstallsTheServiceAndVerifiesTheOwner(t *testing.T) {
	fake := newOnboardSlack(t)
	executor := injectService(t, "darwin")

	setupHome := t.TempDir()
	t.Setenv(paths.EnvHome, setupHome)
	t.Setenv("SLACK_BOT_TOKEN", "xoxb-cli")
	t.Setenv("SLACK_APP_TOKEN", "xapp-cli")
	if out, code := runCLI(t, "setup", "--owner", "U0CLI"); code != ExitOK {
		t.Fatalf("setup exit %d, output %q", code, out)
	}
	setupConfig, err := os.ReadFile(filepath.Join(setupHome, "config.yaml"))
	if err != nil {
		t.Fatal(err)
	}

	// The daemon the fake launchctl would supervise runs in-process instead,
	// on the configuration onboard is about to write; its home holds no
	// config.yaml yet, so onboard walks the fresh path.
	home := newTestHome(t)
	inbound := make(chan socketmode.Event, 4)
	startTestDaemonAt(t, home, &config.Config{Slack: config.Slack{BotToken: "xoxb-cli", AppToken: "xapp-cli", OwnerUserID: "U0CLI", APIURL: fake.url}}, daemon.Options{
		SocketModeHealth: func() string { return slackapi.SocketConnected },
		Inbound:          inbound,
	})
	replied := make(chan struct{})
	go func() {
		defer close(replied)
		post := fake.waitPost(t, "D0CLI")
		if post.Get("text") != "Reply to this message to finish setup" || post.Get("thread_ts") != "" {
			t.Errorf("setup DM = %v; want the fixed text at the top level", post)
		}
		inbound <- ownerDM("U0CLI", "D0CLI", "1700000000.000200", "here I am")
	}()

	out, urls, err := runOnboard(t, "xoxe.xoxp-1-cfg\n\nxoxb-cli\nxapp-cli\nU0CLI\n\n")
	<-replied
	if code := exitCode(err); code != ExitOK {
		t.Fatalf("exit %d (err %v), output %q", code, err, out)
	}
	if fake.manifestAuth != "Bearer xoxe.xoxp-1-cfg" || fake.manifestBody != manifest.YAML() {
		t.Fatalf("apps.manifest.create authorized %q with manifest matching embedded=%t", fake.manifestAuth, fake.manifestBody == manifest.YAML())
	}
	if len(urls) != 2 || urls[0] != "https://slack.com/oauth/v2/authorize?client_id=cli" || urls[1] != "https://api.slack.com/apps/A0CLI/general" {
		t.Fatalf("opened %v", urls)
	}
	fake.mu.Lock()
	infoTokens, infoUsers := strings.Join(fake.infoTokens, ","), strings.Join(fake.infoUsers, ",")
	fake.mu.Unlock()
	if infoTokens != "xoxb-cli,xoxb-cli" || infoUsers != "U0CLI,U0CLI" {
		t.Fatalf("users.info tokens %q users %q; want onboard's owner lookup and the daemon's display-name lookup", infoTokens, infoUsers)
	}
	if got := strings.Join(fake.authTokens, ","); got != "xoxb-cli,xoxb-cli" {
		t.Fatalf("auth.test tokens %v; want the bot token from setup and from onboard", fake.authTokens)
	}
	if got := strings.Join(fake.probeTokens, ","); got != "xapp-cli,xapp-cli" {
		t.Fatalf("apps.connections.open tokens %v; want the app token from setup and from onboard", fake.probeTokens)
	}
	if !strings.Contains(out, "Owner: ada (U0CLI). Correct? [Y/n]") {
		t.Fatalf("output %q lacks the owner confirmation", out)
	}
	if !strings.Contains(out, "Verified: ada replied to Slack assistant.") || !strings.HasSuffix(strings.TrimSpace(out), "Invite the bot to the channels it should watch, then DM it !help.") {
		t.Fatalf("output %q lacks the verified line or does not close with the next steps", out)
	}
	plist := filepath.Join(home, "slack-coordinator.plist")
	if got := strings.Join(executor.commands, ";"); got != "launchctl load -w "+plist {
		t.Fatalf("onboard ran %q; want the service loaded", got)
	}
	if _, err := os.Stat(plist); err != nil {
		t.Fatalf("service definition: %v", err)
	}

	onboardConfig, err := os.ReadFile(filepath.Join(home, "config.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(onboardConfig, setupConfig) {
		t.Fatalf("onboard config.yaml differs from setup's:\n%s\n---\n%s", onboardConfig, setupConfig)
	}
	info, err := os.Stat(filepath.Join(home, "config.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if mode := info.Mode().Perm(); mode != 0o600 {
		t.Fatalf("config.yaml mode %o, want 0600", mode)
	}
	if _, err := os.Stat(filepath.Join(home, "onboard.json")); !os.IsNotExist(err) {
		t.Fatalf("onboard.json after a verified run: %v", err)
	}
}

func TestOnboardManifestFailureExitsTwoAndKeepsStepOne(t *testing.T) {
	home := t.TempDir()
	t.Setenv(paths.EnvHome, home)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"ok":false,"error":"invalid_manifest"}`))
	}))
	t.Cleanup(srv.Close)
	slackAPIURL = srv.URL
	t.Cleanup(func() { slackAPIURL = "" })

	_, urls, err := runOnboard(t, "xoxe-cfg\nOps\n")
	if code := exitCode(err); code != ExitUsage {
		t.Fatalf("exit %d, want %d (err %v)", code, ExitUsage, err)
	}
	if err == nil || !strings.HasPrefix(err.Error(), "create app: ") || !strings.Contains(err.Error(), "invalid_manifest") {
		t.Fatalf("error %v", err)
	}
	if len(urls) != 0 {
		t.Fatalf("opened %v before the app existed", urls)
	}
	raw, readErr := os.ReadFile(filepath.Join(home, "onboard.json"))
	if readErr != nil {
		t.Fatal(readErr)
	}
	if !strings.Contains(string(raw), `"step": 1`) || strings.Contains(string(raw), "xoxe") {
		t.Fatalf("onboard.json = %s", raw)
	}
}

func TestOnboardExistingIsNotImplementedYet(t *testing.T) {
	t.Setenv(paths.EnvHome, t.TempDir())
	_, _, err := runOnboard(t, "", "--existing", "--no-service")
	if code := exitCode(err); code != ExitUsage || err.Error() != "not implemented yet" {
		t.Fatalf("exit %d, err %v; want exit 2 with not implemented yet", code, err)
	}
}
