package manifest

import (
	"slices"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestYAMLIsTheEmbeddedManifest(t *testing.T) {
	text := YAML()
	if text == "" {
		t.Fatal("YAML() is empty")
	}
	var doc struct {
		Display struct {
			Name string `yaml:"name"`
		} `yaml:"display_information"`
		OAuth struct {
			Scopes struct {
				Bot []string `yaml:"bot"`
			} `yaml:"scopes"`
		} `yaml:"oauth_config"`
		Settings struct {
			SocketMode bool `yaml:"socket_mode_enabled"`
		} `yaml:"settings"`
	}
	if err := yaml.Unmarshal([]byte(text), &doc); err != nil {
		t.Fatalf("YAML() does not parse: %v", err)
	}
	if doc.Display.Name != "slack-coordinator" || !doc.Settings.SocketMode {
		t.Fatalf("manifest = %+v; want name slack-coordinator with Socket Mode enabled", doc)
	}
	for _, scope := range []string{"files:read", "files:write", "bookmarks:read", "lists:read"} {
		if !slices.Contains(doc.OAuth.Scopes.Bot, scope) {
			t.Errorf("missing bot scope %s", scope)
		}
	}
}
