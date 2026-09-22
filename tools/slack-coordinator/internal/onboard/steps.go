package onboard

import (
	"context"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/manifest"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// ManifestAPI is the slice of the Slack client the walkthrough calls.
type ManifestAPI interface {
	ManifestCreate(ctx context.Context, configToken, manifest string) (slackapi.ManifestResult, error)
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
	// StartDaemon starts the daemon detached, as daemon start does.
	StartDaemon func() error
}

// Flags are the onboard command's flags. Steps 1 to 5 ignore them; step 6
// reads NoService.
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
const DefaultAppName = "Slack assistant"

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

// steps is indexed by Checkpoint.Step: index 0 means nothing completed.
var steps = []step{
	{},
	{name: "configuration token", run: promptConfigToken},
	{name: "create app", run: createApp, needsToken: true},
	{name: "install app", run: installApp},
	{name: "app-level token", run: appLevelToken},
	{name: "owner", run: resolveOwner},
	{name: "write config and start", run: writeConfigAndStart},
}

const tokenStep = 1

// Run resumes the walkthrough at cp.Step+1 and saves cp to cpPath after each
// completed step. The configuration-token step runs only when a step in this
// invocation needs the token, and never advances a checkpoint that already
// passed it. A failing step returns "<step name>: <cause>" (or
// ErrConfigTokenRejected) with the checkpoint left at the last completed step.
func Run(ctx context.Context, deps Deps, cp *Checkpoint, cpPath string, flags Flags) error {
	if deps.Out == nil {
		deps.Out = io.Discard
	}
	st := &state{deps: deps, cp: cp, flags: flags}
	start := cp.Step + 1
	if start > tokenStep && needsToken(start) {
		if err := runStep(ctx, st, tokenStep); err != nil {
			return err
		}
	}
	for i := start; i < len(steps); i++ {
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

// createApp records the name the user chose and creates the app from the
// embedded manifest, sent verbatim. Slack names the app from the manifest's
// display_information.name, so the output line does not attribute the
// prompted name to Slack.
func createApp(ctx context.Context, st *state) error {
	name, err := st.deps.Prompt(fmt.Sprintf("App name [%s]", DefaultAppName))
	if err != nil {
		return err
	}
	if name = strings.TrimSpace(name); name == "" {
		name = DefaultAppName
	}
	res, err := st.deps.Slack.ManifestCreate(ctx, st.configToken, manifest.YAML())
	if err != nil {
		if strings.HasSuffix(err.Error(), "invalid_auth") {
			return ErrConfigTokenRejected
		}
		return err
	}
	st.cp.AppID, st.cp.AppName, st.installURL = res.AppID, name, res.InstallURL
	fmt.Fprintf(st.deps.Out, "Created app %s from the embedded manifest; recorded as %q.\n", res.AppID, name)
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
	fmt.Fprintln(st.deps.Out, "Allow the install. The Bot User OAuth Token then appears under OAuth & Permissions.")
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
	fmt.Fprintln(st.deps.Out, "Under App-Level Tokens, generate a token with the connections:write scope.")
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

// writeConfigAndStart checks both tokens against Slack, writes config.yaml
// with the collected slack keys over any existing file (its agent, retention,
// and jira blocks survive), then installs the user service or, with
// --no-service, starts the daemon detached.
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
	cfg.ApplyDefaults()
	if err := cfg.Validate(); err != nil {
		return err
	}
	if err := d.SaveConfig(cfg); err != nil {
		return err
	}
	if st.flags.NoService {
		if err := d.StartDaemon(); err != nil {
			return err
		}
		fmt.Fprintln(d.Out, "The daemon runs until you log out or reboot; run slack-coordinator service install to keep it running.")
		return nil
	}
	if err := d.InstallService(); err != nil {
		return err
	}
	st.cp.ServiceInstalled = true
	return nil
}

func installURL(appID string) string {
	return "https://api.slack.com/apps/" + appID + "/install-on-team"
}

func generalURL(appID string) string { return "https://api.slack.com/apps/" + appID + "/general" }

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
