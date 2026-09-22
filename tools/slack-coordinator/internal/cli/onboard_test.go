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

func TestOnboardCreatesTheAppAndSavesBothTokens(t *testing.T) {
	home := t.TempDir()
	t.Setenv(paths.EnvHome, home)
	var gotAuth, gotManifest string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/apps.manifest.create" {
			http.Error(w, "unexpected "+r.URL.Path, http.StatusNotFound)
			return
		}
		_ = r.ParseForm()
		gotAuth, gotManifest = r.Header.Get("Authorization"), r.PostForm.Get("manifest")
		_, _ = w.Write([]byte(`{"ok":true,"app_id":"A0CLI","oauth_authorize_url":"https://slack.com/oauth/v2/authorize?client_id=cli"}`))
	}))
	t.Cleanup(srv.Close)
	onboardAPIURL = srv.URL
	t.Cleanup(func() { onboardAPIURL = "" })

	out, urls, err := runOnboard(t, "xoxe.xoxp-1-cfg\n\nxoxb-cli\nxapp-cli\n")
	if code := exitCode(err); code != ExitOK {
		t.Fatalf("exit %d (err %v), output %q", code, err, out)
	}
	if gotAuth != "Bearer xoxe.xoxp-1-cfg" || gotManifest != manifest.YAML() {
		t.Fatalf("apps.manifest.create authorized %q with manifest matching embedded=%t", gotAuth, gotManifest == manifest.YAML())
	}
	if len(urls) != 2 || urls[0] != "https://slack.com/oauth/v2/authorize?client_id=cli" || urls[1] != "https://api.slack.com/apps/A0CLI/general" {
		t.Fatalf("opened %v", urls)
	}
	if !strings.HasSuffix(strings.TrimSpace(out), "Tokens saved to onboard.json; the remaining steps arrive in a later change.") {
		t.Fatalf("output %q lacks the closing line", out)
	}
	raw, err := os.ReadFile(filepath.Join(home, "onboard.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cp map[string]any
	if err := json.Unmarshal(raw, &cp); err != nil {
		t.Fatal(err)
	}
	if cp["step"] != float64(4) || cp["app_id"] != "A0CLI" || cp["bot_token"] != "xoxb-cli" || cp["app_token"] != "xapp-cli" {
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
	onboardAPIURL = srv.URL
	t.Cleanup(func() { onboardAPIURL = "" })

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
