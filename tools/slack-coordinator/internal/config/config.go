package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
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

// Config is the whole of config.yaml.
type Config struct {
	Slack Slack `yaml:"slack"`
}

// Load reads and validates path. A missing file names the command that writes it.
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

// Validate checks the token shapes Slack issues and the owner user ID prefix.
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
	return nil
}
