// Package manifest embeds the Slack app manifest so the repository file and
// the one apps.manifest.create sends are one artifact.
package manifest

import (
	_ "embed"
	"encoding/json"

	"gopkg.in/yaml.v3"
)

//go:embed slack-app-manifest.yaml
var yamlText string

// YAML returns the manifest exactly as stored in slack-app-manifest.yaml.
func YAML() string { return yamlText }

// Live holds the settings of an installed app that apps.manifest.update keeps
// instead of taking them from the embedded manifest. An empty string keeps the
// embedded value.
type Live struct {
	Name             string
	Description      string
	LongDescription  string
	BackgroundColor  string
	BotDisplayName   string
	OrgDeployEnabled bool
}

// JSON returns the embedded manifest encoded as JSON. The apps.manifest.create
// and apps.manifest.update methods accept only a JSON manifest.
func JSON() string { return encodeJSON(func(map[string]any) {}) }

// JSONNamed is JSON with display_information.name and the bot display name
// set to name, so the app Slack creates carries the name the user chose.
func JSONNamed(name string) string {
	return encodeJSON(func(doc map[string]any) {
		doc["display_information"].(map[string]any)["name"] = name
		doc["features"].(map[string]any)["bot_user"].(map[string]any)["display_name"] = name
	})
}

// JSONForUpdate is JSON with the installed app's name, descriptions, color,
// and bot display name kept from live. It keeps org_deploy_enabled true when
// live has it, because Slack rejects a manifest that turns org-wide
// deployment off after it was turned on.
func JSONForUpdate(live Live) string {
	return encodeJSON(func(doc map[string]any) {
		display := doc["display_information"].(map[string]any)
		keep(display, "name", live.Name)
		keep(display, "description", live.Description)
		keep(display, "long_description", live.LongDescription)
		keep(display, "background_color", live.BackgroundColor)
		keep(doc["features"].(map[string]any)["bot_user"].(map[string]any), "display_name", live.BotDisplayName)
		if live.OrgDeployEnabled {
			doc["settings"].(map[string]any)["org_deploy_enabled"] = true
		}
	})
}

func keep(section map[string]any, key, value string) {
	if value != "" {
		section[key] = value
	}
}

func encodeJSON(change func(doc map[string]any)) string {
	var doc map[string]any
	if err := yaml.Unmarshal([]byte(yamlText), &doc); err != nil {
		panic("embedded Slack manifest does not parse: " + err.Error())
	}
	change(doc)
	out, err := json.Marshal(doc)
	if err != nil {
		panic("embedded Slack manifest does not encode as JSON: " + err.Error())
	}
	return string(out)
}

// BotScopes returns oauth_config.scopes.bot from the embedded manifest.
func BotScopes() []string {
	var doc struct {
		OAuth struct {
			Scopes struct {
				Bot []string `yaml:"bot"`
			} `yaml:"scopes"`
		} `yaml:"oauth_config"`
	}
	if err := yaml.Unmarshal([]byte(yamlText), &doc); err != nil {
		panic("embedded Slack manifest does not parse: " + err.Error())
	}
	return doc.OAuth.Scopes.Bot
}
