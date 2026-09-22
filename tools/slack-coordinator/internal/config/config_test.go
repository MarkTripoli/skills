package config

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

var validSlack = Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U123"}

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestSaveLoadRoundTripIsOwnerOnly(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "config.yaml")
	want := &Config{
		Slack:     Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U123", APIURL: "http://127.0.0.1:1/"},
		Retention: Retention{Days: 30, ConsumedDays: 7},
	}
	if err := Save(path, want); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if mode := info.Mode().Perm(); mode != 0o600 {
		t.Fatalf("config mode %o, want 600", mode)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if *got != *want {
		t.Fatalf("round trip changed config: %+v", got)
	}
}

func TestLoadMissingFileNamesSetup(t *testing.T) {
	_, err := Load(filepath.Join(t.TempDir(), "config.yaml"))
	if err == nil || !strings.Contains(err.Error(), "slack-coordinator setup") {
		t.Fatalf("missing config error = %v, want mention of setup", err)
	}
}

// Read hands a partial file back as written: no defaults, no validation, so
// onboard can rewrite only the slack keys of a file Load would reject.
func TestReadKeepsPartialFilesAndReportsAbsence(t *testing.T) {
	cfg, err := Read(filepath.Join(t.TempDir(), "config.yaml"))
	if err != nil || cfg != nil {
		t.Fatalf("Read(absent) = %+v, %v; want nil, nil", cfg, err)
	}
	cfg, err = Read(writeConfig(t, "agent:\n  command: omp\n"))
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if cfg.Agent == nil || cfg.Agent.Command != "omp" || cfg.Agent.Approval != "" || cfg.Retention.Days != 0 || cfg.Slack != (Slack{}) {
		t.Fatalf("Read = %+v; want the agent block alone, no defaults", cfg)
	}
}

func TestValidateRejectsMissingAppToken(t *testing.T) {
	cfg := &Config{Slack: Slack{BotToken: "xoxb-1", OwnerUserID: "U123"}}
	if err := cfg.Validate(); err == nil || !strings.Contains(err.Error(), "app_token") {
		t.Fatalf("Validate() = %v, want app_token error", err)
	}
}

func TestJiraBlockRoundTripsAndIsValidated(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	want := &Config{
		Slack: Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U123"},
		Jira:  &Jira{BaseURL: "https://acme.atlassian.net", Email: "me@example.com", APIToken: "tok", FieldID: "customfield_10042"},
	}
	if !want.JiraEnabled() {
		t.Fatal("JiraEnabled() = false with a jira block")
	}
	if err := Save(path, want); err != nil {
		t.Fatal(err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if got.Slack != want.Slack || got.Jira == nil || *got.Jira != *want.Jira {
		t.Fatalf("round trip changed config: %+v jira %+v", got, got.Jira)
	}

	if (&Config{Slack: want.Slack}).JiraEnabled() {
		t.Fatal("JiraEnabled() = true without a jira block")
	}
	partial := &Config{Slack: want.Slack, Jira: &Jira{BaseURL: "https://acme.atlassian.net", Email: "me@example.com", APIToken: "tok", FieldID: "summary"}}
	if err := partial.Validate(); err == nil || !strings.Contains(err.Error(), "field_id") {
		t.Fatalf("Validate() = %v, want field_id error", err)
	}
}

const slackOnlyYAML = "slack:\n  bot_token: xoxb-1\n  app_token: xapp-1\n  owner_user_id: U123\n"

func TestLoadFillsAgentAndRetentionDefaults(t *testing.T) {
	cases := []struct {
		name      string
		yaml      string
		wantAgent *Agent
	}{
		{name: "slack only", yaml: slackOnlyYAML},
		{
			name: "agent with only command",
			yaml: slackOnlyYAML + "agent:\n  command: codex\n",
			wantAgent: &Agent{
				Command:        "codex",
				Approval:       "edits",
				Timeout:        10 * time.Minute,
				MaxRunsPerHour: 30,
			},
		},
		{
			name: "explicit values are kept",
			yaml: slackOnlyYAML + "agent:\n  command: omp\n  approval: full\n  timeout: 90s\n  max_runs_per_hour: 5\n  extra_dirs: [/srv/a, /srv/b]\n",
			wantAgent: &Agent{
				Command:        "omp",
				Approval:       "full",
				Timeout:        90 * time.Second,
				MaxRunsPerHour: 5,
				ExtraDirs:      []string{"/srv/a", "/srv/b"},
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Load(writeConfig(t, tc.yaml))
			if err != nil {
				t.Fatal(err)
			}
			if want := (Retention{Days: 30, ConsumedDays: 7}); got.Retention != want {
				t.Fatalf("Retention = %+v, want %+v", got.Retention, want)
			}
			if !reflect.DeepEqual(got.Agent, tc.wantAgent) {
				t.Fatalf("Agent = %+v, want %+v", got.Agent, tc.wantAgent)
			}
			if got.AgentEnabled() != (tc.wantAgent != nil) {
				t.Fatalf("AgentEnabled() = %v with agent %+v", got.AgentEnabled(), got.Agent)
			}
		})
	}
}

func TestLoadKeepsExplicitRetention(t *testing.T) {
	got, err := Load(writeConfig(t, slackOnlyYAML+"retention:\n  days: 90\n  consumed_days: 1\n"))
	if err != nil {
		t.Fatal(err)
	}
	if want := (Retention{Days: 90, ConsumedDays: 1}); got.Retention != want {
		t.Fatalf("Retention = %+v, want %+v", got.Retention, want)
	}
}

func validAgent() *Agent {
	return &Agent{Command: "claude", Approval: "edits", Timeout: time.Minute, MaxRunsPerHour: 1, ExtraDirs: []string{"/srv/repo"}}
}

func TestValidateRejectsAgentAndRetentionValues(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*Config)
		want   []string // every substring the error must carry: the key and the allowed values
	}{
		{"unknown command", func(c *Config) { c.Agent.Command = "cursor" }, []string{"agent.command", "cursor", "omp", "claude", "codex"}},
		{"empty command", func(c *Config) { c.Agent.Command = "" }, []string{"agent.command", "omp", "claude", "codex"}},
		{"unknown approval", func(c *Config) { c.Agent.Approval = "none" }, []string{"agent.approval", "none", "edits", "full"}},
		{"zero timeout", func(c *Config) { c.Agent.Timeout = 0 }, []string{"agent.timeout", "greater than 0"}},
		{"negative timeout", func(c *Config) { c.Agent.Timeout = -time.Second }, []string{"agent.timeout", "greater than 0"}},
		{"zero max runs", func(c *Config) { c.Agent.MaxRunsPerHour = 0 }, []string{"agent.max_runs_per_hour", "greater than 0"}},
		{"negative max runs", func(c *Config) { c.Agent.MaxRunsPerHour = -1 }, []string{"agent.max_runs_per_hour", "greater than 0"}},
		{"relative extra dir", func(c *Config) { c.Agent.ExtraDirs = []string{"/srv/ok", "relative/dir"} }, []string{"agent.extra_dirs[1]", "relative/dir", "absolute"}},
		{"zero retention days", func(c *Config) { c.Retention.Days = 0 }, []string{"retention.days", "greater than 0"}},
		{"negative retention days", func(c *Config) { c.Retention.Days = -3 }, []string{"retention.days", "greater than 0"}},
		{"zero consumed days", func(c *Config) { c.Retention.ConsumedDays = 0 }, []string{"retention.consumed_days", "greater than 0"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := &Config{Slack: validSlack, Agent: validAgent(), Retention: Retention{Days: 30, ConsumedDays: 7}}
			if err := cfg.Validate(); err != nil {
				t.Fatalf("baseline Validate() = %v", err)
			}
			tc.mutate(cfg)
			err := cfg.Validate()
			if err == nil {
				t.Fatal("Validate() = nil, want error")
			}
			for _, s := range tc.want {
				if !strings.Contains(err.Error(), s) {
					t.Fatalf("Validate() = %q, want it to contain %q", err, s)
				}
			}
		})
	}
}

func TestLoadRejectsInvalidAgentNamingTheKey(t *testing.T) {
	_, err := Load(writeConfig(t, slackOnlyYAML+"agent:\n  command: cursor\n"))
	if err == nil || !strings.Contains(err.Error(), "agent.command") {
		t.Fatalf("Load() error = %v, want agent.command error", err)
	}
}

func TestAgentAndRetentionRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	want := &Config{
		Slack:     validSlack,
		Agent:     &Agent{Command: "omp", Approval: "full", Timeout: 45 * time.Minute, MaxRunsPerHour: 12, ExtraDirs: []string{"/srv/a", "/srv/b"}},
		Retention: Retention{Days: 14, ConsumedDays: 2},
	}
	if err := Save(path, want); err != nil {
		t.Fatal(err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("round trip changed config: %+v agent %+v", got, got.Agent)
	}
}
