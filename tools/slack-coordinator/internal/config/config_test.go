package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveLoadRoundTripIsOwnerOnly(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "config.yaml")
	want := &Config{Slack: Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U123", APIURL: "http://127.0.0.1:1/"}}
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
