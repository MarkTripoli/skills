package onboard

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/manifest"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// ManifestAPI is the slice of the Slack client the walkthrough calls.
type ManifestAPI interface {
	ManifestCreate(ctx context.Context, configToken, manifest string) (slackapi.ManifestResult, error)
}

// Deps are the terminal, browser, and Slack the steps talk to. Tests script
// them; the CLI binds stdin, stdout, the platform opener, and slackapi.
type Deps struct {
	// Prompt asks one question and returns the answer without its newline.
	Prompt func(label string) (string, error)
	// PromptSecret is Prompt without echo.
	PromptSecret func(label string) (string, error)
	// OpenURL opens url in the user's browser.
	OpenURL func(url string) error
	Slack   ManifestAPI
	Out     io.Writer
}

// Flags are the onboard command's flags. Neither changes steps 1 to 4;
// later steps read them.
type Flags struct {
	// NoService starts the daemon in the foreground instead of installing a service.
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

// createApp names the app and creates it from the embedded manifest.
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
	fmt.Fprintf(st.deps.Out, "Created %s (%s).\n", name, res.AppID)
	return nil
}

// installApp opens the workspace install page and collects the bot token it
// reveals.
func installApp(_ context.Context, st *state) error {
	url := st.installURL
	if url == "" {
		url = installURL(st.cp.AppID)
	}
	if err := open(st, url); err != nil {
		return err
	}
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
	if err := open(st, generalURL(st.cp.AppID)); err != nil {
		return err
	}
	fmt.Fprintln(st.deps.Out, "Under App-Level Tokens, generate a token with the connections:write scope.")
	token, err := promptToken(st, "App-level token (xapp-…)", "xapp-")
	if err != nil {
		return err
	}
	st.cp.AppToken = token
	return nil
}

func installURL(appID string) string {
	return "https://api.slack.com/apps/" + appID + "/install-on-team"
}

func generalURL(appID string) string { return "https://api.slack.com/apps/" + appID + "/general" }

// open prints url, so a headless terminal still has it, then opens it.
func open(st *state, url string) error {
	fmt.Fprintf(st.deps.Out, "Opening %s\n", url)
	if err := st.deps.OpenURL(url); err != nil {
		return fmt.Errorf("open %s: %w", url, err)
	}
	return nil
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
