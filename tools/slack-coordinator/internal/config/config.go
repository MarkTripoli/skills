package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

// Slack holds the one bot/app token pair a daemon installation uses.
type Slack struct {
	BotToken    string `yaml:"bot_token"`
	AppToken    string `yaml:"app_token"`
	OwnerUserID string `yaml:"owner_user_id"`
	// APIURL points the SDK at a fake server. Tests only; empty uses the SDK default.
	APIURL string `yaml:"api_url,omitempty"`
}

// Jira holds the Jira Cloud site and the custom field a run's thread
// permalink is written to. Absent when Jira backlinks are not configured.
type Jira struct {
	BaseURL  string `yaml:"base_url"`
	Email    string `yaml:"email"`
	APIToken string `yaml:"api_token"`
	FieldID  string `yaml:"field_id"`
}

// Config is the whole of config.yaml.
type Config struct {
	Slack Slack `yaml:"slack"`
	Jira  *Jira `yaml:"jira,omitempty"`
}

// Load reads and validates path. A missing file names the setup command.
func Load(path string) (*Config, error) {
	cfg, err := Read(path)
	if err != nil {
		return nil, err
	}
	if cfg == nil {
		return nil, fmt.Errorf("%s does not exist; run `slack-coordinator setup` first", path)
	}

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return cfg, nil
}

// Read parses path as written, without defaults or validation, so a partial
// file survives a rewrite of only some keys. An absent file is nil, nil.
func Read(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &cfg, nil
}

// Save writes cfg to path readable by the owner only.
func Save(path string, cfg *Config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	raw, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return err
	}
	return os.Chmod(path, 0o600)
}

// ownerIDPattern is a Slack member ID: U or W, then letters and digits.
// It rejects the help-text placeholder U…, which used to pass a prefix check.
var ownerIDPattern = regexp.MustCompile(`^[UW][A-Z0-9]+$`)

// Validate checks the Slack tokens, owner member ID, and optional Jira block.
func (c *Config) Validate() error {
	s := c.Slack
	switch {
	case !strings.HasPrefix(s.BotToken, "xoxb-"):
		return errors.New("slack.bot_token must start with xoxb-")
	case !strings.HasPrefix(s.AppToken, "xapp-"):
		return errors.New("slack.app_token must start with xapp-")
	case !ownerIDPattern.MatchString(s.OwnerUserID):
		return fmt.Errorf("slack.owner_user_id %q must be your Slack member ID (U or W followed by letters and digits). Copy it from your profile menu; the help-text example is not an ID", s.OwnerUserID)
	}
	if c.Jira != nil {
		if err := c.Jira.Validate(); err != nil {
			return err
		}
	}
	return nil
}

// JiraEnabled reports whether runs may carry a --jira-issue backlink.
func (c *Config) JiraEnabled() bool { return c.Jira != nil }

var fieldIDPattern = regexp.MustCompile(`^customfield_\d+$`)

// Validate requires every Jira key: an absolute http(s) base_url, email,
// api_token, and a field_id of the form customfield_<digits>.
func (j *Jira) Validate() error {
	u, err := url.Parse(j.BaseURL)
	switch {
	case j.BaseURL == "":
		return errors.New("jira.base_url is required")
	case err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "":
		return fmt.Errorf("jira.base_url %q must be an absolute http(s) URL", j.BaseURL)
	case j.Email == "":
		return errors.New("jira.email is required")
	case j.APIToken == "":
		return errors.New("jira.api_token is required")
	case !fieldIDPattern.MatchString(j.FieldID):
		return fmt.Errorf("jira.field_id %q must match customfield_<digits>", j.FieldID)
	}
	return nil
}
