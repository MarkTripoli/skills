// Package slackapi wraps the Slack Web API calls the daemon and setup use.
// The package name avoids shadowing the SDK import.
package slackapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/slack-go/slack"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
)

// Client is one authenticated Slack Web API client.
type Client struct {
	api *slack.Client
	// httpClient and apiURL back the manifest calls, which bypass the SDK
	// because its apps.manifest.* helpers take a typed Manifest struct and
	// drop app_id and oauth_authorize_url from the response.
	httpClient *http.Client
	apiURL     string
}

// New builds a client from the configured bot and app tokens. cfg.APIURL,
// when set, points the SDK at a fake server.
func New(cfg config.Slack) *Client {
	httpClient := &http.Client{}
	apiURL := slack.APIURL
	opts := []slack.Option{slack.OptionAppLevelToken(cfg.AppToken), slack.OptionHTTPClient(httpClient)}
	if cfg.APIURL != "" {
		apiURL = cfg.APIURL
		if !strings.HasSuffix(apiURL, "/") {
			apiURL += "/"
		}
		opts = append(opts, slack.OptionAPIURL(apiURL))
	}
	return &Client{api: slack.New(cfg.BotToken, opts...), httpClient: httpClient, apiURL: apiURL}
}

// API exposes the SDK client for the Socket Mode connection, which the SDK
// builds from a *slack.Client.
func (c *Client) API() *slack.Client { return c.api }

// AuthTest checks the bot token and returns the bot user and team.
func (c *Client) AuthTest(ctx context.Context) (*slack.AuthTestResponse, error) {
	return c.api.AuthTestContext(ctx)
}

// ProbeSocketMode checks that the app token can open a Socket Mode connection.
// The returned URL is discarded; nothing connects.
func (c *Client) ProbeSocketMode(ctx context.Context) error {
	_, _, err := c.api.StartSocketModeContext(ctx)
	return err
}

// PostMessage posts mrkdwn to channelID, as a thread reply when threadTS is
// set, and returns the message timestamp.
func (c *Client) PostMessage(ctx context.Context, channelID, threadTS, mrkdwn string) (string, error) {
	opts := []slack.MsgOption{slack.MsgOptionText(mrkdwn, false), slack.MsgOptionDisableLinkUnfurl()}
	if threadTS != "" {
		opts = append(opts, slack.MsgOptionTS(threadTS))
	}
	_, ts, err := c.api.PostMessageContext(ctx, channelID, opts...)
	return ts, err
}

// Permalink returns the canonical URL of one message.
func (c *Client) Permalink(ctx context.Context, channelID, ts string) (string, error) {
	return c.api.GetPermalinkContext(ctx, &slack.PermalinkParameters{Channel: channelID, Ts: ts})
}

// UpdateMessage replaces the text of one message and returns its timestamp.
func (c *Client) UpdateMessage(ctx context.Context, channelID, ts, mrkdwn string) (string, error) {
	_, newTS, _, err := c.api.UpdateMessageContext(ctx, channelID, ts, slack.MsgOptionText(mrkdwn, false), slack.MsgOptionDisableLinkUnfurl())
	return newTS, err
}

// AddReaction adds the emoji name (without colons) to one message.
func (c *Client) AddReaction(ctx context.Context, channelID, ts, name string) error {
	return c.api.AddReactionContext(ctx, name, slack.NewRefToMessage(channelID, ts))
}

// OpenConversation opens or resumes the DM with userID and returns its D… channel ID.
func (c *Client) OpenConversation(ctx context.Context, userID string) (string, error) {
	channel, _, _, err := c.api.OpenConversationContext(ctx, &slack.OpenConversationParameters{Users: []string{userID}})
	if err != nil {
		return "", err
	}
	return channel.ID, nil
}

// User is the subset of a Slack user the daemon addresses and schedules by.
type User struct {
	ID          string
	DisplayName string
	TZ          string
}

// LookupUserByEmail is users.lookupByEmail.
func (c *Client) LookupUserByEmail(ctx context.Context, email string) (User, error) {
	u, err := c.api.GetUserByEmailContext(ctx, email)
	if err != nil {
		return User{}, err
	}
	return toUser(u), nil
}

// UserInfo is users.info for one user ID.
func (c *Client) UserInfo(ctx context.Context, userID string) (User, error) {
	u, err := c.api.GetUserInfoContext(ctx, userID)
	if err != nil {
		return User{}, err
	}
	return toUser(u), nil
}

// toUser prefers the profile display name and falls back to the real name,
// which Slack always sets.
func toUser(u *slack.User) User {
	name := u.Profile.DisplayName
	if name == "" {
		name = u.RealName
	}
	return User{ID: u.ID, DisplayName: name, TZ: u.TZ}
}

// ManifestResult identifies the app a manifest call created or updated and
// the OAuth URL that installs it to the workspace.
type ManifestResult struct {
	AppID      string
	InstallURL string
}

// ManifestCreate is apps.manifest.create with the YAML manifest, authorized
// by an app configuration token.
func (c *Client) ManifestCreate(ctx context.Context, configToken, manifest string) (ManifestResult, error) {
	return c.postManifest(ctx, "apps.manifest.create", configToken, url.Values{"manifest": {manifest}})
}

// ManifestUpdate is apps.manifest.update for appID.
func (c *Client) ManifestUpdate(ctx context.Context, configToken, appID, manifest string) (ManifestResult, error) {
	return c.postManifest(ctx, "apps.manifest.update", configToken, url.Values{"app_id": {appID}, "manifest": {manifest}})
}

// postManifest form-posts to <apiURL><method> with a bearer configToken and
// decodes the app_id and oauth_authorize_url fields. A Slack ok:false
// response becomes an error carrying Slack's error string verbatim.
func (c *Client) postManifest(ctx context.Context, method, configToken string, form url.Values) (ManifestResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiURL+method, strings.NewReader(form.Encode()))
	if err != nil {
		return ManifestResult{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Authorization", "Bearer "+configToken)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return ManifestResult{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ManifestResult{}, fmt.Errorf("%s: HTTP %d", method, resp.StatusCode)
	}
	var body struct {
		OK         bool   `json:"ok"`
		Error      string `json:"error"`
		AppID      string `json:"app_id"`
		InstallURL string `json:"oauth_authorize_url"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&body); err != nil {
		return ManifestResult{}, fmt.Errorf("%s: decode response: %w", method, err)
	}
	if !body.OK {
		if body.Error == "" {
			body.Error = "unknown_error"
		}
		return ManifestResult{}, fmt.Errorf("%s: %s", method, body.Error)
	}
	return ManifestResult{AppID: body.AppID, InstallURL: body.InstallURL}, nil
}

// ConversationInfo is conversations.info for one channel ID.
func (c *Client) ConversationInfo(ctx context.Context, id string) (*slack.Channel, error) {
	return c.api.GetConversationInfoContext(ctx, &slack.GetConversationInfoInput{ChannelID: id})
}

// ListConversations returns one conversations.list page of public and private
// channels, archived included, 200 per page, with the cursor for the next page.
func (c *Client) ListConversations(ctx context.Context, cursor string) ([]slack.Channel, string, error) {
	return c.api.GetConversationsContext(ctx, &slack.GetConversationsParameters{
		Cursor: cursor,
		Limit:  200,
		Types:  []string{"public_channel", "private_channel"},
	})
}
