package onboard

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/manifest"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

const configToken = "xoxe.xoxp-1-configuration"

// script answers prompts in order, records the URLs opened, and serves
// apps.manifest.create from a fixed result or error.
type script struct {
	t       *testing.T
	answers []string
	prompts []string
	urls    []string
	out     bytes.Buffer

	createErr    error
	createCalls  int
	createTokens []string
	createBodies []string
}

func (s *script) next(label string) (string, error) {
	s.prompts = append(s.prompts, label)
	if len(s.answers) == 0 {
		s.t.Fatalf("unexpected prompt %q after answers ran out", label)
	}
	v := s.answers[0]
	s.answers = s.answers[1:]
	return v, nil
}

func (s *script) ManifestCreate(_ context.Context, token, body string) (slackapi.ManifestResult, error) {
	s.createCalls++
	s.createTokens = append(s.createTokens, token)
	s.createBodies = append(s.createBodies, body)
	if s.createErr != nil {
		return slackapi.ManifestResult{}, s.createErr
	}
	return slackapi.ManifestResult{AppID: "A0EXAMPLE", InstallURL: "https://slack.com/oauth/v2/authorize?client_id=1"}, nil
}

func (s *script) deps() Deps {
	return Deps{
		Prompt:       s.next,
		PromptSecret: s.next,
		OpenURL: func(u string) error {
			s.urls = append(s.urls, u)
			return nil
		},
		Slack: s,
		Out:   &s.out,
	}
}

func newScript(t *testing.T, answers ...string) *script {
	return &script{t: t, answers: answers}
}

// run executes the walkthrough from cp against s and returns the checkpoint
// path, the raw file after the run, and the error.
func run(t *testing.T, s *script, cp *Checkpoint) (string, []byte, error) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "onboard.json")
	if cp.Step > 0 {
		if err := cp.Save(path); err != nil {
			t.Fatal(err)
		}
	}
	err := Run(context.Background(), s.deps(), cp, path, Flags{})
	raw, readErr := os.ReadFile(path)
	if readErr != nil && !errors.Is(readErr, os.ErrNotExist) {
		t.Fatal(readErr)
	}
	return path, raw, err
}

func decode(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("onboard.json %q: %v", raw, err)
	}
	return m
}

func TestFreshRunCompletesFourStepsAndRecordsBothTokens(t *testing.T) {
	s := newScript(t, configToken, "", "xoxb-bot", "xapp-app")
	path, raw, err := run(t, s, &Checkpoint{})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	got := decode(t, raw)
	want := map[string]any{"step": float64(4), "app_id": "A0EXAMPLE", "app_name": DefaultAppName, "bot_token": "xoxb-bot", "app_token": "xapp-app"}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %v, want %v", k, got[k], v)
		}
	}
	if s.createCalls != 1 || s.createTokens[0] != configToken || s.createBodies[0] != manifest.YAML() {
		t.Fatalf("ManifestCreate calls %d tokens %v; want one call with the configuration token and the embedded manifest", s.createCalls, s.createTokens)
	}
	if len(s.urls) != 2 || s.urls[0] != "https://slack.com/oauth/v2/authorize?client_id=1" || s.urls[1] != "https://api.slack.com/apps/A0EXAMPLE/general" {
		t.Fatalf("opened %v; want the returned install URL then the app's general page", s.urls)
	}
	if !strings.Contains(s.out.String(), "connections:write") {
		t.Fatalf("output %q does not name the connections:write scope", s.out.String())
	}
	if out := s.out.String(); !strings.Contains(out, "Created app A0EXAMPLE") || strings.Contains(out, "Created "+DefaultAppName) {
		t.Fatalf("output %q must report the app id and not attribute the prompted name to Slack", out)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if mode := info.Mode().Perm(); mode != 0o600 {
		t.Fatalf("onboard.json mode %o, want 0600", mode)
	}
	if bytes.Contains(raw, []byte(configToken)) || bytes.Contains(raw, []byte("xoxe")) {
		t.Fatalf("onboard.json %q carries the configuration token", raw)
	}
}

func TestWrongBotTokenPrefixRepromptsWithoutAdvancing(t *testing.T) {
	s := newScript(t, configToken, "Ops bot", "xoxp-user-token", "xoxb-bot", "xapp-app")
	_, raw, err := run(t, s, &Checkpoint{})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	botPrompts := 0
	for _, p := range s.prompts {
		if strings.HasPrefix(p, "Bot token") {
			botPrompts++
		}
	}
	if botPrompts != 2 {
		t.Fatalf("bot token prompted %d times, want 2 (one re-prompt); prompts %q", botPrompts, s.prompts)
	}
	if !strings.Contains(s.out.String(), "does not start with xoxb-") {
		t.Fatalf("output %q does not say why the paste was refused", s.out.String())
	}
	got := decode(t, raw)
	if got["bot_token"] != "xoxb-bot" || got["app_name"] != "Ops bot" || got["step"] != float64(4) {
		t.Fatalf("onboard.json = %v", got)
	}
}

func TestCreateAppFailureLeavesStepOneWithoutTokens(t *testing.T) {
	s := newScript(t, configToken, "")
	s.createErr = errors.New("apps.manifest.create: HTTP 500")
	_, raw, err := run(t, s, &Checkpoint{})
	if err == nil || !strings.HasPrefix(err.Error(), "create app: ") || !strings.Contains(err.Error(), "HTTP 500") {
		t.Fatalf("error %v, want create app: <cause>", err)
	}
	got := decode(t, raw)
	if got["step"] != float64(1) {
		t.Fatalf("step = %v, want 1", got["step"])
	}
	for _, k := range []string{"app_id", "bot_token", "app_token"} {
		if _, ok := got[k]; ok {
			t.Errorf("onboard.json carries %s after a failed create", k)
		}
	}
	if bytes.Contains(raw, []byte(configToken)) {
		t.Fatalf("onboard.json %q carries the configuration token", raw)
	}
	if len(s.urls) != 0 {
		t.Fatalf("opened %v before the app existed", s.urls)
	}
}

func TestInvalidAuthNamesTheExpiredConfigurationToken(t *testing.T) {
	s := newScript(t, configToken, "")
	s.createErr = errors.New("apps.manifest.create: invalid_auth")
	_, _, err := run(t, s, &Checkpoint{})
	if err == nil || err.Error() != "configuration token rejected; create a new one at api.slack.com/apps" {
		t.Fatalf("error %v, want the fixed rejected-token line", err)
	}
}

func TestResumeFromStepTwoSkipsCreateAndUsesStoredAppID(t *testing.T) {
	s := newScript(t, "xoxb-bot", "xapp-app")
	_, raw, err := run(t, s, &Checkpoint{Step: 2, AppID: "A0STORED", AppName: "Stored"})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if s.createCalls != 0 {
		t.Fatalf("ManifestCreate called %d times on resume", s.createCalls)
	}
	for _, p := range s.prompts {
		if strings.HasPrefix(p, "App configuration token") {
			t.Fatalf("configuration token prompted although no remaining step needs it; prompts %q", s.prompts)
		}
	}
	if len(s.urls) != 2 || s.urls[0] != "https://api.slack.com/apps/A0STORED/install-on-team" || s.urls[1] != "https://api.slack.com/apps/A0STORED/general" {
		t.Fatalf("opened %v; want URLs built from the stored app id", s.urls)
	}
	got := decode(t, raw)
	if got["step"] != float64(4) || got["app_id"] != "A0STORED" || got["app_name"] != "Stored" || got["bot_token"] != "xoxb-bot" || got["app_token"] != "xapp-app" {
		t.Fatalf("onboard.json = %v", got)
	}
}

func TestResumeFromStepOneAsksForTheTokenAgainWithoutRegressing(t *testing.T) {
	s := newScript(t, configToken, "", "xoxb-bot", "xapp-app")
	_, raw, err := run(t, s, &Checkpoint{Step: 1})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if s.createCalls != 1 || s.createTokens[0] != configToken {
		t.Fatalf("ManifestCreate calls %d tokens %v; want one call with the re-prompted token", s.createCalls, s.createTokens)
	}
	if got := decode(t, raw); got["step"] != float64(4) {
		t.Fatalf("step = %v, want 4", got["step"])
	}
}

func TestBrowserOpenFailureWarnsAndContinuesToThePrompt(t *testing.T) {
	s := newScript(t, configToken, "", "xoxb-bot", "xapp-app")
	deps := s.deps()
	deps.OpenURL = func(string) error { return errors.New("exec: \"xdg-open\": executable file not found in $PATH") }
	path := filepath.Join(t.TempDir(), "onboard.json")
	if err := Run(context.Background(), deps, &Checkpoint{}, path, Flags{}); err != nil {
		t.Fatalf("Run: %v; an opener failure must not stop the walkthrough", err)
	}
	out := s.out.String()
	if !strings.Contains(out, "Opening https://slack.com/oauth/v2/authorize?client_id=1") || !strings.Contains(out, "open the URL above by hand") {
		t.Fatalf("output %q must print the URL and say the browser did not open", out)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := decode(t, raw); got["step"] != float64(4) || got["bot_token"] != "xoxb-bot" {
		t.Fatalf("onboard.json = %v, want both tokens recorded", got)
	}
}

func TestLoadCheckpointRejectsNegativeStep(t *testing.T) {
	path := filepath.Join(t.TempDir(), "onboard.json")
	if err := os.WriteFile(path, []byte(`{"step": -1}`), 0o600); err != nil {
		t.Fatal(err)
	}
	cp, err := LoadCheckpoint(path)
	if err == nil || !strings.Contains(err.Error(), "step -1 out of range") {
		t.Fatalf("LoadCheckpoint = %+v, %v; want an out-of-range error", cp, err)
	}
}

func TestLoadCheckpointAbsentIsZeroValue(t *testing.T) {
	cp, err := LoadCheckpoint(filepath.Join(t.TempDir(), "missing.json"))
	if err != nil || *cp != (Checkpoint{}) {
		t.Fatalf("LoadCheckpoint = %+v, %v; want zero value", cp, err)
	}
}
