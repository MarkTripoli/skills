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

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/manifest"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

const configToken = "xoxe.xoxp-1-configuration"

var (
	ada   = slackapi.User{ID: "U0000000001", DisplayName: "ada"}
	grace = slackapi.User{ID: "W0000000002", DisplayName: "Grace Hopper"}
)

// script answers prompts in order, records the URLs opened and every token
// each Slack call carried, serves apps.manifest.create from a fixed result or
// error, resolves two users, stores config.yaml in a temporary home, and
// answers the daemon's verification from verifyResult (the owner replied,
// unless a test says otherwise) after snapshotting onboard.json.
type script struct {
	t       *testing.T
	answers []string
	prompts []string
	urls    []string
	out     bytes.Buffer
	flags   Flags

	createErr    error
	createCalls  int
	createTokens []string
	createBodies []string

	lookupTokens []string
	lookupEmails []string
	infoTokens   []string
	infoIDs      []string
	authErr      error
	authTokens   []string
	probeErr     error
	probeTokens  []string

	configPath     string
	saves          int
	installCalls   int
	uninstallCalls int
	startCalls     int
	restartCalls   int

	cpPath       string
	waitErr      error
	waitCalls    int
	verifyResult ipc.VerifyOwnerResult
	verifyErr    error
	verifyCalls  int
	// cpAtVerify is onboard.json as the verification step found it.
	cpAtVerify []byte
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
		LookupUserByEmail: func(_ context.Context, token, email string) (slackapi.User, error) {
			s.lookupTokens = append(s.lookupTokens, token)
			s.lookupEmails = append(s.lookupEmails, email)
			if email == "ada@example.com" {
				return ada, nil
			}
			return slackapi.User{}, errors.New("users.lookupByEmail: users_not_found")
		},
		UserInfo: func(_ context.Context, token, id string) (slackapi.User, error) {
			s.infoTokens = append(s.infoTokens, token)
			s.infoIDs = append(s.infoIDs, id)
			switch id {
			case ada.ID:
				return ada, nil
			case grace.ID:
				return grace, nil
			}
			return slackapi.User{}, errors.New("users.info: user_not_found")
		},
		AuthTest: func(_ context.Context, token string) error {
			s.authTokens = append(s.authTokens, token)
			return s.authErr
		},
		ProbeSocketMode: func(_ context.Context, token string) error {
			s.probeTokens = append(s.probeTokens, token)
			return s.probeErr
		},
		LoadConfig: func() (*config.Config, error) { return config.Read(s.configPath) },
		SaveConfig: func(cfg *config.Config) error {
			s.saves++
			return config.Save(s.configPath, cfg)
		},
		InstallService: func() error {
			s.installCalls++
			return nil
		},
		UninstallService: func() error {
			s.uninstallCalls++
			return nil
		},
		StartDaemon: func() error {
			s.startCalls++
			return nil
		},
		RestartDaemon: func() error {
			s.restartCalls++
			return nil
		},
		WaitDaemon: func(context.Context) error {
			s.waitCalls++
			return s.waitErr
		},
		VerifyOwner: func(context.Context) (ipc.VerifyOwnerResult, error) {
			s.verifyCalls++
			s.cpAtVerify, _ = os.ReadFile(s.cpPath)
			return s.verifyResult, s.verifyErr
		},
	}
}

func newScript(t *testing.T, answers ...string) *script {
	return &script{
		t:            t,
		answers:      answers,
		configPath:   filepath.Join(t.TempDir(), "config.yaml"),
		verifyResult: ipc.VerifyOwnerResult{OK: true, DisplayName: ada.DisplayName},
	}
}

// run executes the walkthrough from cp against s and returns the checkpoint
// path, the raw file after the run (nil when removed), and the error.
func run(t *testing.T, s *script, cp *Checkpoint) (string, []byte, error) {
	t.Helper()
	s.cpPath = filepath.Join(t.TempDir(), "onboard.json")
	if cp.Step > 0 {
		if err := cp.Save(s.cpPath); err != nil {
			t.Fatal(err)
		}
	}
	err := Run(context.Background(), s.deps(), cp, s.cpPath, s.flags)
	raw, readErr := os.ReadFile(s.cpPath)
	if readErr != nil && !errors.Is(readErr, os.ErrNotExist) {
		t.Fatal(readErr)
	}
	return s.cpPath, raw, err
}

func decode(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("onboard.json %q: %v", raw, err)
	}
	return m
}

// savedConfig reads the config.yaml the run wrote and checks its mode.
func savedConfig(t *testing.T, s *script) *config.Config {
	t.Helper()
	info, err := os.Stat(s.configPath)
	if err != nil {
		t.Fatalf("config.yaml: %v", err)
	}
	if mode := info.Mode().Perm(); mode != 0o600 {
		t.Fatalf("config.yaml mode %o, want 0600", mode)
	}
	cfg, err := config.Load(s.configPath)
	if err != nil {
		t.Fatalf("config.yaml does not load: %v", err)
	}
	return cfg
}

// tokensStep4 is the checkpoint a run that collected both tokens leaves.
func tokensStep4() *Checkpoint {
	return &Checkpoint{Step: 4, AppID: "A0STORED", AppName: "Stored", BotToken: "xoxb-bot", AppToken: "xapp-app"}
}

// existingSetup writes a config.yaml with slack tokens and an agent block, the
// state a completed step 6 leaves behind.
func existingSetup(t *testing.T, s *script) {
	t.Helper()
	existing := "agent:\n  command: omp\n  extra_dirs:\n    - /srv/repos\nslack:\n  bot_token: xoxb-old\n  app_token: xapp-old\n  owner_user_id: " + ada.ID + "\n"
	if err := os.WriteFile(s.configPath, []byte(existing), 0o600); err != nil {
		t.Fatal(err)
	}
}

// wantVerified checks the run ended verified: one verification after the
// daemon answered, the checkpoint removed, and the next steps printed.
func wantVerified(t *testing.T, s *script, raw []byte, verifiedLine string) {
	t.Helper()
	if s.waitCalls != 1 || s.verifyCalls != 1 {
		t.Fatalf("WaitDaemon %d VerifyOwner %d; want one health wait then one verification", s.waitCalls, s.verifyCalls)
	}
	if raw != nil {
		t.Fatalf("onboard.json still present after verification: %s", raw)
	}
	out := s.out.String()
	if !strings.Contains(out, verifiedLine) || !strings.Contains(out, "Invite the bot to the channels it should watch, then DM it !help.") {
		t.Fatalf("output %q lacks %q or the next steps", out, verifiedLine)
	}
}

// count returns how many prompts start with prefix.
func (s *script) count(prefix string) int {
	n := 0
	for _, p := range s.prompts {
		if strings.HasPrefix(p, prefix) {
			n++
		}
	}
	return n
}

func TestFreshRunCompletesSevenStepsAndInstallsTheService(t *testing.T) {
	s := newScript(t, configToken, "", "xoxb-bot", "xapp-app", "ada@example.com", "")
	_, raw, err := run(t, s, &Checkpoint{})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	wantVerified(t, s, raw, "Verified: ada replied to "+DefaultAppName+".")
	got := decode(t, s.cpAtVerify)
	want := map[string]any{"step": float64(6), "app_id": "A0EXAMPLE", "app_name": DefaultAppName, "bot_token": "xoxb-bot", "app_token": "xapp-app", "owner_user_id": ada.ID, "owner_display_name": ada.DisplayName, "service_installed": true}
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
	if got := strings.Join(s.lookupTokens, ","); got != "xoxb-bot" || s.lookupEmails[0] != "ada@example.com" || len(s.infoIDs) != 0 {
		t.Fatalf("lookupByEmail tokens %v emails %v, users.info ids %v; want one lookup with the bot token", s.lookupTokens, s.lookupEmails, s.infoIDs)
	}
	if !strings.Contains(strings.Join(s.prompts, "\n"), "Owner: ada (U0000000001). Correct? [Y/n]") {
		t.Fatalf("prompts %q lack the owner confirmation", s.prompts)
	}
	if strings.Join(s.authTokens, ",") != "xoxb-bot" || strings.Join(s.probeTokens, ",") != "xapp-app" {
		t.Fatalf("auth.test tokens %v, apps.connections.open tokens %v; want the pasted bot and app tokens", s.authTokens, s.probeTokens)
	}
	cfg := savedConfig(t, s)
	if cfg.Slack.BotToken != "xoxb-bot" || cfg.Slack.AppToken != "xapp-app" || cfg.Slack.OwnerUserID != ada.ID {
		t.Fatalf("config.yaml slack = %+v", cfg.Slack)
	}
	if s.installCalls != 1 || s.startCalls != 0 {
		t.Fatalf("InstallService %d StartDaemon %d; want the service installed and no detached start", s.installCalls, s.startCalls)
	}
	if bytes.Contains(s.cpAtVerify, []byte(configToken)) || bytes.Contains(s.cpAtVerify, []byte("xoxe")) {
		t.Fatalf("onboard.json %q carries the configuration token", s.cpAtVerify)
	}
}

func TestCheckpointIsOwnerOnlyWhileTheRunIsUnfinished(t *testing.T) {
	s := newScript(t, ada.ID, "")
	s.authErr = errors.New("invalid_auth")
	path, _, err := run(t, s, tokensStep4())
	if err == nil {
		t.Fatal("Run succeeded with a rejected bot token")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if mode := info.Mode().Perm(); mode != 0o600 {
		t.Fatalf("onboard.json mode %o, want 0600", mode)
	}
}

func TestOwnerByIDUsesUsersInfoWithTheBotToken(t *testing.T) {
	s := newScript(t, grace.ID, "y")
	_, raw, err := run(t, s, tokensStep4())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if strings.Join(s.infoTokens, ",") != "xoxb-bot" || strings.Join(s.infoIDs, ",") != grace.ID || len(s.lookupEmails) != 0 {
		t.Fatalf("users.info tokens %v ids %v, lookupByEmail emails %v; want one info call with the bot token", s.infoTokens, s.infoIDs, s.lookupEmails)
	}
	got := decode(t, s.cpAtVerify)
	if got["owner_user_id"] != grace.ID || got["owner_display_name"] != grace.DisplayName || got["step"] != float64(6) {
		t.Fatalf("onboard.json at verification = %v", got)
	}
	wantVerified(t, s, raw, "Verified: ada replied to Stored.")
}

func TestUnknownOwnerRepromptsWithoutWritingConfig(t *testing.T) {
	s := newScript(t, "nobody@example.com", "bob", "U0000000009", ada.ID, "")
	_, _, err := run(t, s, tokensStep4())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if n := s.count("Owner email or Slack user id"); n != 4 {
		t.Fatalf("owner prompted %d times, want 4; prompts %q", n, s.prompts)
	}
	if n := strings.Count(s.out.String(), "No such user in this workspace."); n != 3 {
		t.Fatalf("refusal printed %d times, want 3; output %q", n, s.out.String())
	}
	if got := strings.Join(s.infoIDs, ","); got != "U0000000009,"+ada.ID {
		t.Fatalf("users.info ids %q; the malformed id must not reach Slack", got)
	}
	if s.saves != 1 {
		t.Fatalf("config saved %d times, want once after the owner resolved", s.saves)
	}
	if cfg := savedConfig(t, s); cfg.Slack.OwnerUserID != ada.ID {
		t.Fatalf("config.yaml owner = %q", cfg.Slack.OwnerUserID)
	}
}

func TestDecliningTheOwnerReprompts(t *testing.T) {
	s := newScript(t, "ada@example.com", "n", grace.ID, "")
	_, _, err := run(t, s, tokensStep4())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if n := s.count("Owner: "); n != 2 {
		t.Fatalf("confirmation prompted %d times, want 2; prompts %q", n, s.prompts)
	}
	got := decode(t, s.cpAtVerify)
	if got["owner_user_id"] != grace.ID || got["owner_display_name"] != grace.DisplayName {
		t.Fatalf("onboard.json = %v, want the second owner", got)
	}
	if cfg := savedConfig(t, s); cfg.Slack.OwnerUserID != grace.ID {
		t.Fatalf("config.yaml owner = %q, want %q", cfg.Slack.OwnerUserID, grace.ID)
	}
}

func TestMidWalkthroughResumeKeepsAnExistingAgentBlock(t *testing.T) {
	s := newScript(t, ada.ID, "")
	existing := "agent:\n  command: omp\n  extra_dirs:\n    - /srv/repos\nretention:\n  days: 90\n  consumed_days: 3\nslack:\n  bot_token: xoxb-old\n  app_token: xapp-old\n  owner_user_id: U0LD\n"
	if err := os.WriteFile(s.configPath, []byte(existing), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := run(t, s, tokensStep4()); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if s.count("Existing setup found.") != 0 {
		t.Fatalf("prompts %q offered repair to a walkthrough resumed at step 4", s.prompts)
	}
	cfg := savedConfig(t, s)
	if cfg.Slack.BotToken != "xoxb-bot" || cfg.Slack.AppToken != "xapp-app" || cfg.Slack.OwnerUserID != ada.ID {
		t.Fatalf("slack = %+v, want the pasted tokens and the resolved owner", cfg.Slack)
	}
	if cfg.Agent == nil || cfg.Agent.Command != "omp" || len(cfg.Agent.ExtraDirs) != 1 || cfg.Agent.ExtraDirs[0] != "/srv/repos" {
		t.Fatalf("agent = %+v, want the pre-existing block", cfg.Agent)
	}
	if cfg.Retention.Days != 90 || cfg.Retention.ConsumedDays != 3 {
		t.Fatalf("retention = %+v, want the pre-existing values", cfg.Retention)
	}
}

func TestNoServiceStartsTheDaemonInstead(t *testing.T) {
	s := newScript(t, ada.ID, "")
	s.flags.NoService = true
	_, raw, err := run(t, s, tokensStep4())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if s.startCalls != 1 || s.installCalls != 0 {
		t.Fatalf("StartDaemon %d InstallService %d; want the detached start only", s.startCalls, s.installCalls)
	}
	wantVerified(t, s, raw, "Verified: ada replied to Stored.")
	out := s.out.String()
	closing := "Verification passed; the daemon runs until you log out or reboot. Run slack-coordinator service install to keep it running."
	if !strings.HasSuffix(strings.TrimSpace(out), closing) {
		t.Fatalf("output %q does not close by saying verification passed and the daemon is unsupervised", out)
	}
	if got := decode(t, s.cpAtVerify); got["service_installed"] != nil {
		t.Fatalf("onboard.json claims a service was installed: %v", got)
	}
}

func TestVerifyTimeoutPrintsHintsInOrderAndKeepsEverything(t *testing.T) {
	s := newScript(t, ada.ID, "")
	s.verifyResult = ipc.VerifyOwnerResult{Timeout: true}
	_, raw, err := run(t, s, tokensStep4())
	if !errors.Is(err, ErrVerifyTimeout) {
		t.Fatalf("error %v, want ErrVerifyTimeout", err)
	}
	out := s.out.String()
	hints := []string{
		"1. The app was not reinstalled after the scope change; reinstall it at https://api.slack.com/apps/A0STORED/install-on-team.",
		"2. The message.im event subscription is missing",
		"3. The owner id is wrong; config.yaml names " + ada.ID + ".",
	}
	last := -1
	for _, h := range hints {
		i := strings.Index(out, h)
		if i < 0 || i < last {
			t.Fatalf("output %q lacks %q in order", out, h)
		}
		last = i
	}
	if strings.Contains(out, "Invite the bot") {
		t.Fatalf("output %q prints next steps after a failed verification", out)
	}
	if got := decode(t, raw); got["step"] != float64(6) {
		t.Fatalf("onboard.json = %v, want step 6 kept", got)
	}
	savedConfig(t, s)
	if s.installCalls != 1 || s.uninstallCalls != 0 || s.restartCalls != 0 {
		t.Fatalf("install %d uninstall %d restart %d; the service must be left as installed", s.installCalls, s.uninstallCalls, s.restartCalls)
	}
}

func TestRepairReverifiesAnExistingSetupWithoutCreatingAnApp(t *testing.T) {
	s := newScript(t, "x", "1")
	existingSetup(t, s)
	_, raw, err := run(t, s, &Checkpoint{Step: 6, AppID: "A0STORED", AppName: "Stored", BotToken: "xoxb-old", AppToken: "xapp-old", OwnerUserID: ada.ID})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if s.prompts[0] != repairMenu || !strings.Contains(s.out.String(), "Answer with a number from 1 to 3.") {
		t.Fatalf("prompts %q output %q; want the repair menu and a reprompt after a bad answer", s.prompts, s.out.String())
	}
	if s.createCalls != 0 || s.saves != 0 || s.installCalls != 0 || s.uninstallCalls != 0 || s.restartCalls != 0 {
		t.Fatalf("create %d save %d install %d uninstall %d restart %d; re-verify must only verify", s.createCalls, s.saves, s.installCalls, s.uninstallCalls, s.restartCalls)
	}
	wantVerified(t, s, raw, "Verified: ada replied to Stored.")
}

func TestRepairReinstallsTheServiceThenVerifies(t *testing.T) {
	s := newScript(t, "2")
	existingSetup(t, s)
	_, raw, err := run(t, s, &Checkpoint{})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if s.createCalls != 0 || s.uninstallCalls != 1 || s.installCalls != 1 || s.restartCalls != 0 {
		t.Fatalf("create %d uninstall %d install %d restart %d; want the service removed and installed again", s.createCalls, s.uninstallCalls, s.installCalls, s.restartCalls)
	}
	wantVerified(t, s, raw, "Verified: ada replied.")

	s = newScript(t, "2")
	s.flags.NoService = true
	existingSetup(t, s)
	if _, _, err := run(t, s, &Checkpoint{}); err != nil {
		t.Fatalf("Run with --no-service: %v", err)
	}
	if s.uninstallCalls != 0 || s.installCalls != 0 || s.restartCalls != 1 {
		t.Fatalf("uninstall %d install %d restart %d; --no-service must restart the detached daemon", s.uninstallCalls, s.installCalls, s.restartCalls)
	}
}

func TestRepairReplacesOneTokenAndRestartsTheDaemon(t *testing.T) {
	s := newScript(t, "3", "1", "xoxp-wrong", "xoxb-new")
	existingSetup(t, s)
	_, raw, err := run(t, s, &Checkpoint{})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if strings.Join(s.authTokens, ",") != "xoxb-new" || len(s.probeTokens) != 0 {
		t.Fatalf("auth.test tokens %v probe tokens %v; want the new bot token checked once", s.authTokens, s.probeTokens)
	}
	cfg := savedConfig(t, s)
	if cfg.Slack.BotToken != "xoxb-new" || cfg.Slack.AppToken != "xapp-old" || cfg.Slack.OwnerUserID != ada.ID {
		t.Fatalf("slack = %+v, want only the bot token replaced", cfg.Slack)
	}
	if cfg.Agent == nil || cfg.Agent.Command != "omp" {
		t.Fatalf("agent = %+v, want the pre-existing block", cfg.Agent)
	}
	if s.createCalls != 0 || s.restartCalls != 1 || s.installCalls != 0 {
		t.Fatalf("create %d restart %d install %d; want one restart and no app or service work", s.createCalls, s.restartCalls, s.installCalls)
	}
	wantVerified(t, s, raw, "Verified: ada replied.")
}

func TestRepairRejectedTokenLeavesConfigUnchanged(t *testing.T) {
	s := newScript(t, "3", "2", "xapp-new")
	s.probeErr = errors.New("invalid_auth")
	existingSetup(t, s)
	_, _, err := run(t, s, &Checkpoint{})
	if err == nil || !strings.Contains(err.Error(), "replace token: app token cannot open Socket Mode") {
		t.Fatalf("error %v", err)
	}
	if s.saves != 0 || s.restartCalls != 0 || s.verifyCalls != 0 {
		t.Fatalf("saves %d restarts %d verifications %d after a rejected token; want none", s.saves, s.restartCalls, s.verifyCalls)
	}
}

func TestAuthTestFailureLeavesStepFiveWithoutConfig(t *testing.T) {
	s := newScript(t, ada.ID, "")
	s.authErr = errors.New("invalid_auth")
	_, raw, err := run(t, s, tokensStep4())
	if err == nil || !strings.HasPrefix(err.Error(), "write config and start: ") || !strings.Contains(err.Error(), "invalid_auth") {
		t.Fatalf("error %v, want write config and start: <cause>", err)
	}
	got := decode(t, raw)
	if got["step"] != float64(5) || got["owner_user_id"] != ada.ID {
		t.Fatalf("onboard.json = %v, want step 5 with the owner recorded", got)
	}
	if _, statErr := os.Stat(s.configPath); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("config.yaml written after a rejected bot token: %v", statErr)
	}
	if len(s.probeTokens) != 0 || s.installCalls != 0 || s.startCalls != 0 || s.verifyCalls != 0 {
		t.Fatalf("probe %d install %d start %d verify %d after auth.test failed; want none", len(s.probeTokens), s.installCalls, s.startCalls, s.verifyCalls)
	}
}

func TestWrongBotTokenPrefixRepromptsWithoutAdvancing(t *testing.T) {
	s := newScript(t, configToken, "Ops bot", "xoxp-user-token", "xoxb-bot", "xapp-app", ada.ID, "")
	_, _, err := run(t, s, &Checkpoint{})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if n := s.count("Bot token"); n != 2 {
		t.Fatalf("bot token prompted %d times, want 2 (one re-prompt); prompts %q", n, s.prompts)
	}
	if !strings.Contains(s.out.String(), "does not start with xoxb-") {
		t.Fatalf("output %q does not say why the paste was refused", s.out.String())
	}
	got := decode(t, s.cpAtVerify)
	if got["bot_token"] != "xoxb-bot" || got["app_name"] != "Ops bot" || got["step"] != float64(6) {
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
	s := newScript(t, "xoxb-bot", "xapp-app", ada.ID, "")
	_, raw, err := run(t, s, &Checkpoint{Step: 2, AppID: "A0STORED", AppName: "Stored"})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if s.createCalls != 0 {
		t.Fatalf("ManifestCreate called %d times on resume", s.createCalls)
	}
	if n := s.count("App configuration token"); n != 0 {
		t.Fatalf("configuration token prompted although no remaining step needs it; prompts %q", s.prompts)
	}
	if len(s.urls) != 2 || s.urls[0] != "https://api.slack.com/apps/A0STORED/install-on-team" || s.urls[1] != "https://api.slack.com/apps/A0STORED/general" {
		t.Fatalf("opened %v; want URLs built from the stored app id", s.urls)
	}
	got := decode(t, s.cpAtVerify)
	if got["step"] != float64(6) || got["app_id"] != "A0STORED" || got["app_name"] != "Stored" || got["bot_token"] != "xoxb-bot" || got["app_token"] != "xapp-app" {
		t.Fatalf("onboard.json = %v", got)
	}
	wantVerified(t, s, raw, "Verified: ada replied to Stored.")
}

func TestResumeFromStepOneAsksForTheTokenAgainWithoutRegressing(t *testing.T) {
	s := newScript(t, configToken, "", "xoxb-bot", "xapp-app", ada.ID, "")
	_, _, err := run(t, s, &Checkpoint{Step: 1})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if s.createCalls != 1 || s.createTokens[0] != configToken {
		t.Fatalf("ManifestCreate calls %d tokens %v; want one call with the re-prompted token", s.createCalls, s.createTokens)
	}
	if got := decode(t, s.cpAtVerify); got["step"] != float64(6) {
		t.Fatalf("step = %v, want 6", got["step"])
	}
}

func TestBrowserOpenFailureWarnsAndContinuesToThePrompt(t *testing.T) {
	s := newScript(t, configToken, "", "xoxb-bot", "xapp-app", ada.ID, "")
	deps := s.deps()
	deps.OpenURL = func(string) error { return errors.New("exec: \"xdg-open\": executable file not found in $PATH") }
	s.cpPath = filepath.Join(t.TempDir(), "onboard.json")
	if err := Run(context.Background(), deps, &Checkpoint{}, s.cpPath, Flags{}); err != nil {
		t.Fatalf("Run: %v; an opener failure must not stop the walkthrough", err)
	}
	out := s.out.String()
	if !strings.Contains(out, "Opening https://slack.com/oauth/v2/authorize?client_id=1") || !strings.Contains(out, "open the URL above by hand") {
		t.Fatalf("output %q must print the URL and say the browser did not open", out)
	}
	if got := decode(t, s.cpAtVerify); got["step"] != float64(6) || got["bot_token"] != "xoxb-bot" {
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
