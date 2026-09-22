// Package slackapi wraps the Slack Web API calls the daemon and setup use.
// The package name avoids shadowing the SDK import.
package slackapi

import (
	"context"
	"strings"

	"github.com/slack-go/slack"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
)

// Client is one authenticated Slack Web API client.
type Client struct {
	api *slack.Client
}

// New builds a client from the configured bot and app tokens. cfg.APIURL,
// when set, points the SDK at a fake server.
func New(cfg config.Slack) *Client {
	opts := []slack.Option{slack.OptionAppLevelToken(cfg.AppToken)}
	if cfg.APIURL != "" {
		url := cfg.APIURL
		if !strings.HasSuffix(url, "/") {
			url += "/"
		}
		opts = append(opts, slack.OptionAPIURL(url))
	}
	return &Client{api: slack.New(cfg.BotToken, opts...)}
}

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
