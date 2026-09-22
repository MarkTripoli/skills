package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

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

// Agent selects the coding agent the daemon runs for a thread and bounds how
// it runs. Absent when the daemon only coordinates and never spawns an agent.
type Agent struct {
	Command        string        `yaml:"command"`           // omp | claude | codex
	Approval       string        `yaml:"approval"`          // edits | full; default edits
	Timeout        time.Duration `yaml:"timeout"`           // default 10m
	MaxRunsPerHour int           `yaml:"max_runs_per_hour"` // default 30
	ExtraDirs      []string      `yaml:"extra_dirs"`        // absolute paths
}

// Retention bounds how long run records live: Days for every run and
// ConsumedDays for runs whose output the owner already consumed.
type Retention struct {
	Days         int `yaml:"days"`          // default 30
	ConsumedDays int `yaml:"consumed_days"` // default 7
}

const (
	defaultApproval       = "edits"
	defaultTimeout        = 10 * time.Minute
	defaultMaxRunsPerHour = 30
	defaultRetentionDays  = 30
	defaultConsumedDays   = 7
)

// Config is the whole of config.yaml.
type Config struct {
	Slack     Slack     `yaml:"slack"`
	Jira      *Jira     `yaml:"jira,omitempty"`
	Agent     *Agent    `yaml:"agent,omitempty"`
	Retention Retention `yaml:"retention"`
}

// Load reads path, fills defaults for unset agent and retention values, and
// validates the result. A missing file names the command that writes it.
func Load(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("%s does not exist; run `slack-coordinator setup` first", path)
	}
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	cfg.ApplyDefaults()
	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
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

// ApplyDefaults fills the zero-valued retention and agent settings a file or
// a hand-built Config may omit. Load calls it before Validate; setup calls it
// before validating a Config it assembled. It never sets agent.command: a
// present agent block must name one.
func (c *Config) ApplyDefaults() {
	if c.Retention.Days == 0 {
		c.Retention.Days = defaultRetentionDays
	}
	if c.Retention.ConsumedDays == 0 {
		c.Retention.ConsumedDays = defaultConsumedDays
	}
	if a := c.Agent; a != nil {
		if a.Approval == "" {
			a.Approval = defaultApproval
		}
		if a.Timeout == 0 {
			a.Timeout = defaultTimeout
		}
		if a.MaxRunsPerHour == 0 {
			a.MaxRunsPerHour = defaultMaxRunsPerHour
		}
	}
}

// Validate checks the token shapes Slack issues, the owner user ID prefix,
// the retention bounds, and the Jira and agent blocks when present.
func (c *Config) Validate() error {
	s := c.Slack
	switch {
	case !strings.HasPrefix(s.BotToken, "xoxb-"):
		return errors.New("slack.bot_token must start with xoxb-")
	case !strings.HasPrefix(s.AppToken, "xapp-"):
		return errors.New("slack.app_token must start with xapp-")
	case !strings.HasPrefix(s.OwnerUserID, "U") && !strings.HasPrefix(s.OwnerUserID, "W"):
		return errors.New("slack.owner_user_id must start with U or W")
	}
	if c.Jira != nil {
		if err := c.Jira.Validate(); err != nil {
			return err
		}
	}
	if c.Agent != nil {
		if err := c.Agent.Validate(); err != nil {
			return err
		}
	}
	return c.Retention.Validate()
}

// AgentEnabled reports whether the daemon may spawn a coding agent for a thread.
func (c *Config) AgentEnabled() bool { return c.Agent != nil }

// Validate requires a known command and approval mode, positive timeout and
// run budget, and absolute extra_dirs entries.
func (a *Agent) Validate() error {
	switch a.Command {
	case "omp", "claude", "codex":
	default:
		return fmt.Errorf("agent.command %q must be one of omp, claude, codex", a.Command)
	}
	switch a.Approval {
	case "edits", "full":
	default:
		return fmt.Errorf("agent.approval %q must be edits or full", a.Approval)
	}
	if a.Timeout <= 0 {
		return fmt.Errorf("agent.timeout %s must be greater than 0", a.Timeout)
	}
	if a.MaxRunsPerHour <= 0 {
		return fmt.Errorf("agent.max_runs_per_hour %d must be greater than 0", a.MaxRunsPerHour)
	}
	for i, dir := range a.ExtraDirs {
		if !filepath.IsAbs(dir) {
			return fmt.Errorf("agent.extra_dirs[%d] %q must be an absolute path", i, dir)
		}
	}
	return nil
}

// Validate requires both retention windows to be positive day counts.
func (r Retention) Validate() error {
	if r.Days <= 0 {
		return fmt.Errorf("retention.days %d must be greater than 0", r.Days)
	}
	if r.ConsumedDays <= 0 {
		return fmt.Errorf("retention.consumed_days %d must be greater than 0", r.ConsumedDays)
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
