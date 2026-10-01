package manifest

import (
	"encoding/json"
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
		Features struct {
			AppHome struct {
				MessagesTab         bool `yaml:"messages_tab_enabled"`
				MessagesTabReadOnly bool `yaml:"messages_tab_read_only_enabled"`
			} `yaml:"app_home"`
		} `yaml:"features"`
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
	if !doc.Features.AppHome.MessagesTab || doc.Features.AppHome.MessagesTabReadOnly {
		t.Fatalf("app_home = %+v; the bot DM needs a writable Messages tab", doc.Features.AppHome)
	}
	for _, scope := range []string{"files:read", "files:write", "bookmarks:read", "lists:read"} {
		if !slices.Contains(doc.OAuth.Scopes.Bot, scope) {
			t.Errorf("missing bot scope %s", scope)
		}
	}
}

func TestJSONForUpdateKeepsTheLiveSettings(t *testing.T) {
	var doc struct {
		Display struct {
			Name            string `json:"name"`
			Description     string `json:"description"`
			LongDescription string `json:"long_description"`
			BackgroundColor string `json:"background_color"`
		} `json:"display_information"`
		Features struct {
			BotUser struct {
				DisplayName string `json:"display_name"`
			} `json:"bot_user"`
		} `json:"features"`
		Settings struct {
			OrgDeployEnabled bool `json:"org_deploy_enabled"`
		} `json:"settings"`
	}
	live := Live{Name: "Ada's bot", Description: "d", LongDescription: "l", BackgroundColor: "#000000", BotDisplayName: "adabot", OrgDeployEnabled: true}
	if err := json.Unmarshal([]byte(JSONForUpdate(live)), &doc); err != nil {
		t.Fatal(err)
	}
	got := Live{doc.Display.Name, doc.Display.Description, doc.Display.LongDescription, doc.Display.BackgroundColor, doc.Features.BotUser.DisplayName, doc.Settings.OrgDeployEnabled}
	if got != live {
		t.Fatalf("JSONForUpdate kept %+v; want %+v", got, live)
	}
}

func TestJSONNamedSetsTheAppAndBotName(t *testing.T) {
	var doc struct {
		Display struct {
			Name string `json:"name"`
		} `json:"display_information"`
		Features struct {
			BotUser struct {
				DisplayName string `json:"display_name"`
			} `json:"bot_user"`
		} `json:"features"`
	}
	if err := json.Unmarshal([]byte(JSONNamed("Ops")), &doc); err != nil || doc.Display.Name != "Ops" || doc.Features.BotUser.DisplayName != "Ops" {
		t.Fatalf("JSONNamed(Ops) name = %q, bot = %q, err %v", doc.Display.Name, doc.Features.BotUser.DisplayName, err)
	}
}

// Slack refuses DMs to a bot whose Messages tab is off or read-only, and the
// owner verification in onboard is a DM.
func TestJSONLetsTheOwnerMessageTheBot(t *testing.T) {
	for name, text := range map[string]string{"JSON": JSON(), "JSONNamed": JSONNamed("Ops"), "JSONForUpdate": JSONForUpdate(Live{Name: "Ops"})} {
		var doc struct {
			Features struct {
				AppHome struct {
					MessagesTab         *bool `json:"messages_tab_enabled"`
					MessagesTabReadOnly *bool `json:"messages_tab_read_only_enabled"`
				} `json:"app_home"`
			} `json:"features"`
		}
		if err := json.Unmarshal([]byte(text), &doc); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		home := doc.Features.AppHome
		if home.MessagesTab == nil || !*home.MessagesTab || home.MessagesTabReadOnly == nil || *home.MessagesTabReadOnly {
			t.Errorf("%s app_home = %+v; want messages_tab_enabled true and messages_tab_read_only_enabled false", name, home)
		}
	}
}
