package cli

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/manifest"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/onboard"
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

// onboardSlack records setup token and manifest calls against an offline server.
type onboardSlack struct {
	url                                     string
	manifestAuth, manifestBody              string
	manifestUpdateAuth, manifestUpdateAppID string
	manifestUpdateBody                      string
	authTokens, probeTokens                 []string
	infoTokens, infoUsers                   []string
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
	mux.HandleFunc("/apps.manifest.update", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.manifestUpdateAuth = r.Header.Get("Authorization")
		f.manifestUpdateAppID = r.PostForm.Get("app_id")
		f.manifestUpdateBody = r.PostForm.Get("manifest")
		_, _ = w.Write([]byte(`{"ok":true,"app_id":"` + r.PostForm.Get("app_id") + `"}`))
	})
	mux.HandleFunc("/apps.manifest.export", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"ok":true,"manifest":{"settings":{"org_deploy_enabled":false}}}`))
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
		f.infoTokens = append(f.infoTokens, r.PostForm.Get("token"))
		f.infoUsers = append(f.infoUsers, r.PostForm.Get("user"))
		_, _ = w.Write([]byte(`{"ok":true,"user":{"id":"U0CLI","real_name":"Ada Lovelace","tz":"Europe/London","profile":{"real_name":"Ada Lovelace","display_name":"ada"}}}`))
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

func TestOnboardWritesTheConfigAndInstallsTheService(t *testing.T) {
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

	out, urls, err := runOnboard(t, "xoxe.xoxp-1-cfg\n\nxoxb-cli\nxapp-cli\nU0CLI\n\n")
	if code := exitCode(err); code != ExitOK {
		t.Fatalf("exit %d (err %v), output %q", code, err, out)
	}
	if fake.manifestAuth != "Bearer xoxe.xoxp-1-cfg" || fake.manifestBody != manifest.JSONNamed(onboard.DefaultAppName) {
		t.Fatalf("apps.manifest.create authorized %q with manifest matching embedded=%t", fake.manifestAuth, fake.manifestBody == manifest.JSONNamed(onboard.DefaultAppName))
	}
	if len(urls) != 2 || urls[0] != "https://slack.com/oauth/v2/authorize?client_id=cli" || urls[1] != "https://api.slack.com/apps/A0CLI/general" {
		t.Fatalf("opened %v", urls)
	}
	infoTokens, infoUsers := strings.Join(fake.infoTokens, ","), strings.Join(fake.infoUsers, ",")
	if infoTokens != "xoxb-cli,xoxb-cli" || infoUsers != "U0CLI,U0CLI" {
		t.Fatalf("users.info tokens %q users %q; want setup and onboard owner lookups", infoTokens, infoUsers)
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

func TestOnboardExistingUpdatesManifest(t *testing.T) {
	fake := newOnboardSlack(t)

	home := newTestHome(t)
	inbound := make(chan socketmode.Event, 4)
	startTestDaemonAt(t, home, &config.Config{Slack: config.Slack{BotToken: "xoxb-cli", AppToken: "xapp-cli", OwnerUserID: "U0CLI", APIURL: fake.url}}, daemon.Options{
		SocketModeHealth: func() string { return slackapi.SocketConnected },
		Inbound:          inbound,
	})

	// write config.yaml so --existing finds it
	cfgPath := filepath.Join(home, "config.yaml")
	if err := os.WriteFile(cfgPath, []byte("slack:\n  bot_token: xoxb-cli\n  app_token: xapp-cli\n  owner_user_id: U0CLI\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	// write onboard.json with app_id so the prompt is skipped
	cpPath := filepath.Join(home, "onboard.json")
	if err := os.WriteFile(cpPath, []byte(`{"step":6,"app_id":"A0CLI"}`+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	// stdin: config token, then Enter (keep bot token)
	out, _, err := runOnboard(t, "xoxe.xoxp-1-cfg\nyes\n\n", "--existing", "--no-service")
	if code := exitCode(err); code != ExitOK {
		t.Fatalf("exit %d (err %v), output %q", code, err, out)
	}
	if fake.manifestUpdateAuth != "Bearer xoxe.xoxp-1-cfg" || fake.manifestUpdateAppID != "A0CLI" || fake.manifestUpdateBody != manifest.JSON() {
		t.Fatalf("apps.manifest.update auth=%q appID=%q bodyMatch=%v",
			fake.manifestUpdateAuth, fake.manifestUpdateAppID, fake.manifestUpdateBody == manifest.JSON())
	}
}
