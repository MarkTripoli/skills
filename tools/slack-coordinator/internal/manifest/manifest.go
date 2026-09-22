// Package manifest embeds the Slack app manifest so the repository file and
// the one apps.manifest.create sends are one artifact.
package manifest

import _ "embed"

//go:embed slack-app-manifest.yaml
var yamlText string

// YAML returns the manifest exactly as stored in slack-app-manifest.yaml.
func YAML() string { return yamlText }
