package config

import "testing"

func TestGlobalConfigRejectsUnknownKeys(t *testing.T) {
	_, err := LoadGlobalFromBytes([]byte("unknown: true\n"))
	if err == nil {
		t.Fatal("expected unknown configuration key to be rejected")
	}
}
func TestRepoConfigLoadsDefaults(t *testing.T) {
	cfg, err := LoadRepoFromBytes([]byte("{}\n"))
	if err != nil {
		t.Fatal(err)
	}
	if cfg == nil {
		t.Fatal("expected repository config")
	}
}
