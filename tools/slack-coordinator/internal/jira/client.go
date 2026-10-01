// Package jira writes a run's Slack thread URL to one Jira issue custom field.
package jira

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
)

// Client is one authenticated Jira Cloud REST client bound to a custom field.
type Client struct {
	base    *url.URL
	email   string
	token   string
	fieldID string
	http    *http.Client
}

// New builds a client from a validated Jira config.
func New(cfg config.Jira) (*Client, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	base, err := url.Parse(strings.TrimSuffix(cfg.BaseURL, "/"))
	if err != nil {
		return nil, fmt.Errorf("parse jira base_url: %w", err)
	}
	return &Client{
		base:    base,
		email:   cfg.Email,
		token:   cfg.APIToken,
		fieldID: cfg.FieldID,
		http:    &http.Client{Timeout: 15 * time.Second},
	}, nil
}

// bodyPrefix is how much of a failed response body an error carries.
const bodyPrefix = 200

// SetThreadURL writes threadURL to the configured field of issueKey with
// PUT {base}/rest/api/3/issue/{key}. Jira answers 204 on success; any other
// status is an error naming the status and the start of the body.
func (c *Client) SetThreadURL(ctx context.Context, issueKey, threadURL string) error {
	payload, err := json.Marshal(map[string]map[string]string{"fields": {c.fieldID: threadURL}})
	if err != nil {
		return err
	}
	endpoint := c.base.JoinPath("rest", "api", "3", "issue", issueKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, endpoint.String(), bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.email, c.token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("jira PUT %s: %w", issueKey, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNoContent {
		return nil
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, bodyPrefix))
	return fmt.Errorf("jira PUT %s: %s: %s", issueKey, resp.Status, strings.TrimSpace(string(body)))
}
