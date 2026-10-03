package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
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
		Slack: Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U123", APIURL: "http://127.0.0.1:1/"},
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
	cfg, err = Read(writeConfig(t, "jira:\n  email: me@example.com\n"))
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if cfg.Jira == nil || cfg.Jira.Email != "me@example.com" || cfg.Slack != (Slack{}) {
		t.Fatalf("Read = %+v; want the partial Jira block without Slack defaults", cfg)
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

func TestValidateRejectsPlaceholderOwner(t *testing.T) {
	cfg := &Config{Slack: validSlack}
	cfg.Slack.OwnerUserID = "U…"
	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "member ID") {
		t.Fatalf("Validate() = %v, want the placeholder rejected", err)
	}
}

func TestLegacyAutomationKeysAreInertAndRemovedOnSave(t *testing.T) {
	path := writeConfig(t, slackOnlyYAML+"agent:\n  command: unknown\n  timeout: not-a-duration\nretention:\n  days: -1\n")
	cfg, err := Load(path)
	if err != nil || cfg.Slack != validSlack || cfg.Jira != nil {
		t.Fatalf("legacy keys affected coordinator config: %+v, %v", cfg, err)
	}
	if err := Save(path, cfg); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "agent:") || strings.Contains(string(raw), "retention:") {
		t.Fatalf("removed automation settings persisted after save: %s", raw)
	}
}
