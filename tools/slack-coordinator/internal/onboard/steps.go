package onboard

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/manifest"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// ManifestAPI is the slice of the Slack client the walkthrough calls.
type ManifestAPI interface {
	ManifestCreate(ctx context.Context, configToken, manifest string) (slackapi.ManifestResult, error)
	ManifestUpdate(ctx context.Context, configToken, appID, manifest string) (slackapi.ManifestResult, error)
	ManifestExport(ctx context.Context, configToken, appID string) (manifest.Live, error)
}

// Deps are the terminal, browser, Slack, config file, and daemon the steps
// talk to. Tests script them; the CLI binds stdin, stdout, the platform
// opener, slackapi, config.yaml, and the service and daemon commands. The
// Slack calls take the token they authorize with, so a fake can assert it.
type Deps struct {
	// Prompt asks one question and returns the answer without its newline.
	Prompt func(label string) (string, error)
	// PromptSecret is Prompt without echo.
	PromptSecret func(label string) (string, error)
	// OpenURL opens url in the user's browser.
	OpenURL func(url string) error
	Slack   ManifestAPI
	Out     io.Writer
	// LookupUserByEmail is users.lookupByEmail with the bot token.
	LookupUserByEmail func(ctx context.Context, botToken, email string) (slackapi.User, error)
	// UserInfo is users.info with the bot token.
	UserInfo func(ctx context.Context, botToken, id string) (slackapi.User, error)
	// AuthTest is auth.test with the bot token.
	AuthTest func(ctx context.Context, botToken string) error
	// ProbeSocketMode is apps.connections.open with the app-level token.
	ProbeSocketMode func(ctx context.Context, appToken string) error
	// LoadConfig returns the existing config.yaml unvalidated, nil when absent.
	LoadConfig func() (*config.Config, error)
	// SaveConfig writes config.yaml readable by the owner only.
	SaveConfig func(*config.Config) error
	// InstallService writes and activates the launchd or systemd user service.
	InstallService func() error
	// UninstallService deactivates and removes the user service; a missing
	// service is not an error.
	UninstallService func() error
	// StartDaemon starts the daemon detached, as daemon start does.
	StartDaemon func() error
	// RestartDaemon stops the running daemon and brings one back on the
	// current config.yaml: the installed service relaunches it, or it is
	// started detached.
	RestartDaemon func() error
	// WaitDaemon polls daemon.health until it answers or five seconds pass,
	// as daemon start does.
	WaitDaemon func(ctx context.Context) error
}

// Flags are the onboard command's flags. Steps 1 to 5 ignore them; step 6 and
// repair read NoService.
type Flags struct {
	// NoService starts the daemon detached instead of installing a service.
	NoService bool
	// Existing updates an installed app's manifest instead of creating one.
	Existing bool
}

// ErrConfigTokenRejected is Slack's invalid_auth on a manifest call: the
// configuration token expired (12 hours) or was revoked.
var ErrConfigTokenRejected = errors.New("configuration token rejected; create a new one at api.slack.com/apps")

// DefaultAppName is the app name an empty answer selects.
const DefaultAppName = "Slack coordinator"

// state is what one invocation holds across steps. The configuration token
// is here and nowhere on disk.
type state struct {
	deps        Deps
	cp          *Checkpoint
	flags       Flags
	configToken string
	// installURL is the OAuth URL apps.manifest.create returned in this
	// invocation; a resumed run rebuilds it from the stored AppID.
	installURL string
}

type step struct {
	name string
	run  func(context.Context, *state) error
	// needsToken marks a step that calls Slack with the configuration token.
	needsToken bool
}

// steps is indexed by Checkpoint.Step. The final health check is not
// checkpointed; it either finishes setup or leaves the saved config intact.
var steps = []step{
	{},
	{name: "configuration token", run: promptConfigToken},
	{name: "create app", run: createApp, needsToken: true},
	{name: "install app", run: installApp},
	{name: "app-level token", run: appLevelToken},
	{name: "owner", run: resolveOwner},
	{name: "write config and start", run: writeConfigAndStart},
	{name: "daemon health", run: checkDaemon},
}

const (
	tokenStep  = 1
	configStep = 6
	healthStep = 7
)

// Run resumes the walkthrough at cp.Step+1 and saves cp to cpPath after each
// completed step through configStep. The configuration-token step runs only
// when a step in this invocation needs the token, and never advances a
// checkpoint that already passed it. A failing step returns
// "<step name>: <cause>" (or ErrConfigTokenRejected) with the checkpoint left
// at the last completed step.
//
// A config.yaml that already holds a bot token, with no checkpoint or one at
// configStep or later, is an existing setup: Run offers repair (see repair)
// instead of creating a second app. A checkpoint between steps 1 and 5
// resumes the walkthrough over any existing file.
//
// Success removes onboard.json after the local daemon answers.
func Run(ctx context.Context, deps Deps, cp *Checkpoint, cpPath string, flags Flags) error {
	if deps.Out == nil {
		deps.Out = io.Discard
	}
	if flags.Existing {
		return runExisting(ctx, deps, cp, cpPath, flags)
	}
	st := &state{deps: deps, cp: cp, flags: flags}
	cfg, err := deps.LoadConfig()
	if err != nil {
		return err
	}
	// A finished setup wins over a checkpoint left by an abandoned onboard.
	// A mid-walkthrough checkpoint (an app id or a token already stored) still resumes.
	staleEarly := cp.Step > 0 && cp.Step < configStep && cp.AppID == "" && cp.BotToken == "" && cp.AppToken == ""
	if cfg != nil && cfg.Slack.BotToken != "" && (cp.Step == 0 || cp.Step >= configStep || staleEarly) {
		if err := repair(ctx, st, cfg); err != nil {
			return err
		}
		return finish(st, cpPath)
	}
	start := cp.Step + 1
	if start > tokenStep && needsToken(start) {
		if err := runStep(ctx, st, tokenStep); err != nil {
			return err
		}
	}
	for i := start; i < healthStep; i++ {
		if i == tokenStep && !needsToken(i+1) {
			continue
		}
		if err := runStep(ctx, st, i); err != nil {
			return err
		}
		cp.Step = i
		if err := cp.Save(cpPath); err != nil {
			return fmt.Errorf("%s: save %s: %w", steps[i].name, cpPath, err)
		}
	}
	if err := runStep(ctx, st, healthStep); err != nil {
		return err
	}
	return finish(st, cpPath)
}

// runExisting updates an installed app's manifest and optionally replaces its
// bot token, then checks local daemon health.
func runExisting(ctx context.Context, deps Deps, cp *Checkpoint, cpPath string, flags Flags) error {
	cfg, err := deps.LoadConfig()
	if err != nil {
		return err
	}
	if cfg == nil {
		return errors.New("no config.yaml; run onboard without --existing to create the app first")
	}
	st := &state{deps: deps, cp: cp, flags: flags}

	// get app ID from checkpoint or prompt
	appID := cp.AppID
	if appID == "" {
		for {
			appID, err = deps.Prompt("App ID (A…)")
			if err != nil {
				return err
			}
			appID = strings.TrimSpace(appID)
			if strings.HasPrefix(appID, "A") {
				break
			}
			fmt.Fprintln(deps.Out, "App ID must start with A; paste it again.")
		}
		st.cp.AppID = appID
	}

	// config token
	fmt.Fprintln(deps.Out, "Generate an app configuration token at https://api.slack.com/apps (Your App Configuration Tokens > Generate).")
	configToken, err := promptToken(st, "App configuration token (xoxe.xoxp-…)", "xoxe.xoxp-", "xoxe-")
	if err != nil {
		return err
	}
	st.configToken = configToken

	fmt.Fprintf(deps.Out, "App ID: %s\n", appID)
	fmt.Fprintf(deps.Out, "Bot token already in config.yaml belongs to owner %s.\n", cfg.Slack.OwnerUserID)
	live, err := deps.Slack.ManifestExport(ctx, configToken, appID)
	if err != nil {
		if strings.HasSuffix(err.Error(), "invalid_auth") {
			return ErrConfigTokenRejected
		}
		return err
	}
	fmt.Fprintf(deps.Out, "Keeps the live app name %q, bot display name %q, descriptions, and background color.\n", live.Name, live.BotDisplayName)
	fmt.Fprintln(deps.Out, "apps.manifest.update replaces the rest of the app manifest with the embedded one. Bot scopes it sets:")
	for _, scope := range manifest.BotScopes() {
		fmt.Fprintf(deps.Out, "  • %s\n", scope)
	}
	fmt.Fprintln(deps.Out, "Events it sets: app_mention, message.channels, message.groups, message.im. Socket Mode and the App Home Messages tab are turned on.")
	if live.OrgDeployEnabled {
		fmt.Fprintln(deps.Out, "Org-wide deployment is enabled on this app and stays enabled; Slack does not allow turning it off.")
	}
	fmt.Fprintln(deps.Out, "Settings that are not in the embedded manifest are removed. Unrelated existing scopes are not kept.")
	confirm, err := deps.Prompt("Type yes to replace the manifest")
	if err != nil {
		return err
	}
	if strings.TrimSpace(confirm) != "yes" {
		return errors.New("manifest update cancelled")
	}

	// update manifest
	if _, err = deps.Slack.ManifestUpdate(ctx, configToken, appID, manifest.JSONForUpdate(live)); err != nil {
		if strings.HasSuffix(err.Error(), "invalid_auth") {
			return ErrConfigTokenRejected
		}
		return err
	}

	// reinstall prompt: Enter keeps current token; xoxb- replaces it
	label := fmt.Sprintf(
		"Manifest updated. Reinstall the app at %s to grant the new scopes, then paste the new bot token (Enter to keep the current one)",
		installURL(appID),
	)
	answer, err := deps.Prompt(label)
	if err != nil {
		return err
	}
	answer = strings.TrimSpace(answer)
	if strings.HasPrefix(answer, "xoxb-") {
		cfg.Slack.BotToken = answer
		if err := deps.SaveConfig(cfg); err != nil {
			return err
		}
	}

	st.cp.OwnerUserID = cfg.Slack.OwnerUserID
	if err := runStep(ctx, st, healthStep); err != nil {
		return err
	}
	return finish(st, cpPath)
}

// finish removes the setup checkpoint and prints how to start run coordination.
func finish(st *state, cpPath string) error {
	if err := os.Remove(cpPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove %s: %w", cpPath, err)
	}
	fmt.Fprintln(st.deps.Out, "Invite the bot to run channels, or start a run with --dm.")
	if st.flags.NoService {
		fmt.Fprintln(st.deps.Out, "The daemon runs until you log out or reboot. Run slack-coordinator service install to keep it running.")
	}
	return nil
}

// needsToken reports whether any step from index from onward uses the
// configuration token.
func needsToken(from int) bool {
	for i := from; i < len(steps); i++ {
		if steps[i].needsToken {
			return true
		}
	}
	return false
}

func runStep(ctx context.Context, st *state, i int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	err := steps[i].run(ctx, st)
	if err == nil || errors.Is(err, ErrConfigTokenRejected) {
		return err
	}
	return fmt.Errorf("%s: %w", steps[i].name, err)
}

// promptConfigToken holds the app configuration token in memory for the
// manifest calls of this invocation.
func promptConfigToken(_ context.Context, st *state) error {
	fmt.Fprintln(st.deps.Out, "Create an app configuration token at https://api.slack.com/apps (Your App Configuration Tokens > Generate).")
	token, err := promptToken(st, "App configuration token (xoxe.xoxp-…)", "xoxe.xoxp-", "xoxe-")
	if err != nil {
		return err
	}
	st.configToken = token
	return nil
}

// createApp creates the app from the embedded manifest with the app name and
// bot display name set to the name the user chose, and records that name.
func createApp(ctx context.Context, st *state) error {
	name, err := st.deps.Prompt(fmt.Sprintf("App name [%s]", DefaultAppName))
	if err != nil {
		return err
	}
	if name = strings.TrimSpace(name); name == "" {
		name = DefaultAppName
	}
	res, err := st.deps.Slack.ManifestCreate(ctx, st.configToken, manifest.JSONNamed(name))
	if err != nil {
		if strings.HasSuffix(err.Error(), "invalid_auth") {
			return ErrConfigTokenRejected
		}
		return err
	}
	st.cp.AppID, st.cp.AppName, st.installURL = res.AppID, name, res.InstallURL
	fmt.Fprintf(st.deps.Out, "Created app %s named %q from the embedded manifest.\n", res.AppID, name)
	return nil
}

// installApp opens the workspace install page and collects the bot token it
// reveals.
func installApp(_ context.Context, st *state) error {
	url := st.installURL
	if url == "" {
		url = installURL(st.cp.AppID)
	}
	open(st, url)
	fmt.Fprintf(st.deps.Out, "Allow the install, then copy the Bot User OAuth Token from OAuth & Permissions: %s\n", oauthURL(st.cp.AppID))
	token, err := promptToken(st, "Bot token (xoxb-…)", "xoxb-")
	if err != nil {
		return err
	}
	st.cp.BotToken = token
	return nil
}

// appLevelToken opens Basic Information and collects the Socket Mode token.
func appLevelToken(_ context.Context, st *state) error {
	open(st, generalURL(st.cp.AppID))
	fmt.Fprintf(st.deps.Out, "On Basic Information (%s), under App-Level Tokens, generate a token with the connections:write scope.\n", generalURL(st.cp.AppID))
	token, err := promptToken(st, "App-level token (xapp-…)", "xapp-")
	if err != nil {
		return err
	}
	st.cp.AppToken = token
	return nil
}

// userIDPattern is the shape of a Slack user id: U or W followed by
// uppercase letters and digits.
var userIDPattern = regexp.MustCompile(`^[UW][A-Z0-9]+$`)

// errNoSuchUser is an answer that names nobody in the workspace: a malformed
// id, or Slack's users_not_found (lookupByEmail) or user_not_found (info).
var errNoSuchUser = errors.New("no such user")

// resolveOwner asks for the owner by email or user id until Slack resolves
// one and the user confirms it, then records the id and display name.
func resolveOwner(ctx context.Context, st *state) error {
	for {
		answer, err := st.deps.Prompt("Owner email or Slack user id")
		if err != nil {
			return err
		}
		user, err := lookupUser(ctx, st, strings.TrimSpace(answer))
		if errors.Is(err, errNoSuchUser) {
			fmt.Fprintln(st.deps.Out, "No such user in this workspace.")
			continue
		}
		if err != nil {
			return err
		}
		confirm, err := st.deps.Prompt(fmt.Sprintf("Owner: %s (%s). Correct? [Y/n]", user.DisplayName, user.ID))
		if err != nil {
			return err
		}
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(confirm)), "n") {
			continue
		}
		st.cp.OwnerUserID, st.cp.OwnerDisplayName = user.ID, user.DisplayName
		return nil
	}
}

// lookupUser resolves answer with the bot token: an address containing @ goes
// to users.lookupByEmail, a well-formed id to users.info.
func lookupUser(ctx context.Context, st *state, answer string) (slackapi.User, error) {
	var user slackapi.User
	var err error
	switch {
	case strings.Contains(answer, "@"):
		user, err = st.deps.LookupUserByEmail(ctx, st.cp.BotToken, answer)
	case userIDPattern.MatchString(answer):
		user, err = st.deps.UserInfo(ctx, st.cp.BotToken, answer)
	default:
		return slackapi.User{}, errNoSuchUser
	}
	if err != nil && (strings.HasSuffix(err.Error(), "users_not_found") || strings.HasSuffix(err.Error(), "user_not_found")) {
		return slackapi.User{}, errNoSuchUser
	}
	return user, err
}

// writeConfigAndStart checks both tokens, preserves optional Jira settings,
// and installs the service or starts the daemon detached.
func writeConfigAndStart(ctx context.Context, st *state) error {
	d := st.deps
	if err := d.AuthTest(ctx, st.cp.BotToken); err != nil {
		return fmt.Errorf("bot token rejected by auth.test: %w", err)
	}
	if err := d.ProbeSocketMode(ctx, st.cp.AppToken); err != nil {
		return fmt.Errorf("app token cannot open Socket Mode: %w", err)
	}
	cfg, err := d.LoadConfig()
	if err != nil {
		return err
	}
	if cfg == nil {
		cfg = &config.Config{}
	}
	cfg.Slack.BotToken, cfg.Slack.AppToken, cfg.Slack.OwnerUserID = st.cp.BotToken, st.cp.AppToken, st.cp.OwnerUserID

	if err := cfg.Validate(); err != nil {
		return err
	}
	if err := d.SaveConfig(cfg); err != nil {
		return err
	}
	if st.flags.NoService {
		return d.StartDaemon()
	}
	if err := d.InstallService(); err != nil {
		return err
	}
	st.cp.ServiceInstalled = true
	return nil
}

// checkDaemon waits for the daemon's local health endpoint.
func checkDaemon(ctx context.Context, st *state) error {
	if err := st.deps.WaitDaemon(ctx); err != nil {
		return fmt.Errorf("daemon is not answering: %w", err)
	}
	fmt.Fprintln(st.deps.Out, "Daemon is ready. Start a run to coordinate work in Slack.")
	return nil
}

// repairMenu is the choice an existing setup gets instead of the walkthrough.
const repairMenu = "Existing setup found. [1] check daemon [2] reinstall service [3] replace a token"

// repair updates an existing setup without creating a second app, then checks
// that the local daemon answers.
func repair(ctx context.Context, st *state, cfg *config.Config) error {
	st.cp.OwnerUserID = cfg.Slack.OwnerUserID
	choice, err := promptChoice(st, repairMenu, 3)
	if err != nil {
		return err
	}
	switch choice {
	case 2:
		if err := reinstallService(st); err != nil {
			return fmt.Errorf("reinstall service: %w", err)
		}
	case 3:
		if err := replaceToken(ctx, st, cfg); err != nil {
			return fmt.Errorf("replace token: %w", err)
		}
	}
	return runStep(ctx, st, healthStep)
}

// reinstallService rewrites and reactivates the user service, which relaunches
// the daemon on the current config.yaml; with --no-service the detached
// daemon is restarted instead.
func reinstallService(st *state) error {
	d := st.deps
	if st.flags.NoService {
		return d.RestartDaemon()
	}
	if err := d.UninstallService(); err != nil {
		return err
	}
	return d.InstallService()
}

// replaceToken collects one new token, checks it against Slack the way step 6
// does, writes it into config.yaml (every other key survives), and restarts
// the daemon so it reads the new value.
func replaceToken(ctx context.Context, st *state, cfg *config.Config) error {
	d := st.deps
	choice, err := promptChoice(st, "Replace [1] the bot token [2] the app-level token", 2)
	if err != nil {
		return err
	}
	switch choice {
	case 1:
		if st.cp.AppID != "" {
			fmt.Fprintf(d.Out, "Reinstall the app if needed, then copy the Bot User OAuth Token from OAuth & Permissions: %s\n", oauthURL(st.cp.AppID))
		} else {
			fmt.Fprintln(d.Out, "Select your app at https://api.slack.com/apps, then copy the Bot User OAuth Token from OAuth & Permissions (reinstall the app if needed).")
		}
		token, err := promptToken(st, "Bot token (xoxb-…)", "xoxb-")
		if err != nil {
			return err
		}
		if err := d.AuthTest(ctx, token); err != nil {
			return fmt.Errorf("bot token rejected by auth.test: %w", err)
		}
		cfg.Slack.BotToken, st.cp.BotToken = token, token
	case 2:
		if st.cp.AppID != "" {
			fmt.Fprintf(d.Out, "On Basic Information (%s), generate an App-Level Token with connections:write.\n", generalURL(st.cp.AppID))
		} else {
			fmt.Fprintln(d.Out, "Select your app at https://api.slack.com/apps, then under Basic Information > App-Level Tokens generate a token with connections:write.")
		}
		token, err := promptToken(st, "App-level token (xapp-…)", "xapp-")
		if err != nil {
			return err
		}
		if err := d.ProbeSocketMode(ctx, token); err != nil {
			return fmt.Errorf("app token cannot open Socket Mode: %w", err)
		}
		cfg.Slack.AppToken, st.cp.AppToken = token, token
	}

	if err := cfg.Validate(); err != nil {
		return err
	}
	if err := d.SaveConfig(cfg); err != nil {
		return err
	}
	return d.RestartDaemon()
}

// promptChoice asks label until the answer is a number from 1 to n.
func promptChoice(st *state, label string, n int) (int, error) {
	for {
		answer, err := st.deps.Prompt(label)
		if err != nil {
			return 0, err
		}
		choice, err := strconv.Atoi(strings.TrimSpace(answer))
		if err == nil && choice >= 1 && choice <= n {
			return choice, nil
		}
		fmt.Fprintf(st.deps.Out, "Answer with a number from 1 to %d.\n", n)
	}
}

func installURL(appID string) string {
	return "https://api.slack.com/apps/" + appID + "/install-on-team"
}

func generalURL(appID string) string { return "https://api.slack.com/apps/" + appID + "/general" }

func oauthURL(appID string) string { return "https://api.slack.com/apps/" + appID + "/oauth" }

// open prints url, so a headless terminal still has it, then opens it. An
// opener failure is a warning, not a stop: the URL is already on screen and
// the following prompt is what the step needs.
func open(st *state, url string) {
	fmt.Fprintf(st.deps.Out, "Opening %s\n", url)
	if err := st.deps.OpenURL(url); err != nil {
		fmt.Fprintf(st.deps.Out, "Could not open a browser (%v); open the URL above by hand.\n", err)
	}
}

// promptToken asks for a secret until it carries one of the prefixes,
// naming the expected prefix on each mismatch.
func promptToken(st *state, label string, prefixes ...string) (string, error) {
	for {
		v, err := st.deps.PromptSecret(label)
		if err != nil {
			return "", err
		}
		v = strings.TrimSpace(v)
		for _, p := range prefixes {
			if strings.HasPrefix(v, p) {
				return v, nil
			}
		}
		fmt.Fprintf(st.deps.Out, "That token does not start with %s; paste it again.\n", strings.Join(prefixes, " or "))
	}
}
