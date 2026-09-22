package cli

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/manifest"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
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

// onboardSlack is the fake Slack a full onboard and a setup run need. It
// records the manifest authorization and body and every token auth.test,
// apps.connections.open, and users.info carried.
type onboardSlack struct {
	manifestAuth, manifestBody string
	authTokens, probeTokens    []string
	infoTokens, infoUsers      []string
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
		f.infoTokens = append(f.infoTokens, r.PostForm.Get("token"))
		f.infoUsers = append(f.infoUsers, r.PostForm.Get("user"))
		_, _ = w.Write([]byte(`{"ok":true,"user":{"id":"U0CLI","real_name":"Ada Lovelace","tz":"Europe/London","profile":{"real_name":"Ada Lovelace","display_name":"ada"}}}`))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "unexpected "+r.URL.Path, http.StatusNotFound)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	slackAPIURL = srv.URL
	t.Cleanup(func() { slackAPIURL = "" })
	return f
}

func TestOnboardWritesTheConfigSetupWritesAndInstallsTheService(t *testing.T) {
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

	home := t.TempDir()
	t.Setenv(paths.EnvHome, home)
	out, urls, err := runOnboard(t, "xoxe.xoxp-1-cfg\n\nxoxb-cli\nxapp-cli\nU0CLI\n\n")
	if code := exitCode(err); code != ExitOK {
		t.Fatalf("exit %d (err %v), output %q", code, err, out)
	}
	if fake.manifestAuth != "Bearer xoxe.xoxp-1-cfg" || fake.manifestBody != manifest.YAML() {
		t.Fatalf("apps.manifest.create authorized %q with manifest matching embedded=%t", fake.manifestAuth, fake.manifestBody == manifest.YAML())
	}
	if len(urls) != 2 || urls[0] != "https://slack.com/oauth/v2/authorize?client_id=cli" || urls[1] != "https://api.slack.com/apps/A0CLI/general" {
		t.Fatalf("opened %v", urls)
	}
	if got := strings.Join(fake.infoTokens, ","); got != "xoxb-cli" || fake.infoUsers[0] != "U0CLI" {
		t.Fatalf("users.info tokens %v users %v; want one call with the pasted bot token", fake.infoTokens, fake.infoUsers)
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
	if !strings.HasSuffix(strings.TrimSpace(out), "Setup written; verification arrives in a later change.") {
		t.Fatalf("output %q lacks the closing line", out)
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

	raw, err := os.ReadFile(filepath.Join(home, "onboard.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cp map[string]any
	if err := json.Unmarshal(raw, &cp); err != nil {
		t.Fatal(err)
	}
	if cp["step"] != float64(6) || cp["app_id"] != "A0CLI" || cp["bot_token"] != "xoxb-cli" || cp["app_token"] != "xapp-cli" || cp["owner_user_id"] != "U0CLI" || cp["owner_display_name"] != "ada" || cp["service_installed"] != true {
		t.Fatalf("onboard.json = %v", cp)
	}
	if bytes.Contains(raw, []byte("xoxe")) {
		t.Fatalf("onboard.json %q carries the configuration token", raw)
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
