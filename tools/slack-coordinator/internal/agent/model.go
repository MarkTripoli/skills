package agent

import "strings"

// Default models a Slack run passes with --model. An empty flag would
// inherit the CLI default: pi's provider is google, and a login may
// otherwise select a different model than the one named here.
const (
	modelPiSonnet     = "claude-bridge/claude-sonnet-5"
	modelClaudeSonnet = "sonnet"
	modelCodexLuna    = "gpt-6-luna"
)

// modelPhrase is one owner-message token and the id each CLI accepts.
// Claude gets a short alias. Pi gets a claude-bridge id so the provider
// is never anthropic and never google.
type modelPhrase struct {
	phrase string
	pi     string
	claude string
}

// modelPhrases is longest-first after init. A shorter phrase such as
// "opus" must not win inside "opus 5.5".
var modelPhrases = []modelPhrase{
	{"sonnet 5", modelPiSonnet, "sonnet"},
	{"sonnet 4.6", "claude-bridge/claude-sonnet-4-6", "sonnet"},
	{"sonnet 4.5", "claude-bridge/claude-sonnet-4-5", "sonnet"},
	{"sonnet", modelPiSonnet, "sonnet"},
	{"haiku", "claude-bridge/claude-haiku-4-5", "haiku"},
	{"opus 5.5", "claude-bridge/claude-opus-5", "opus"},
	{"opus 5", "claude-bridge/claude-opus-5", "opus"},
	{"opus 4.8", "claude-bridge/claude-opus-4-8", "opus"},
	{"opus 4.7", "claude-bridge/claude-opus-4-7", "opus"},
	{"opus 4.6", "claude-bridge/claude-opus-4-6", "opus"},
	{"opus 4.5", "claude-bridge/claude-opus-4-5", "opus"},
	{"opus", "claude-bridge/claude-opus-5", "opus"},
}

func init() {
	// Longest phrase first. Equal lengths keep the declaration order.
	for i := 1; i < len(modelPhrases); i++ {
		for j := i; j > 0 && len(modelPhrases[j].phrase) > len(modelPhrases[j-1].phrase); j-- {
			modelPhrases[j], modelPhrases[j-1] = modelPhrases[j-1], modelPhrases[j]
		}
	}
}

// SelectModel returns the --model value for command. text is the owner
// message this run will consume; an empty text, or text that names no
// known model, returns the command default. Codex stays on gpt-6-luna
// even when the text names a Claude model. The last named model in text
// wins, so a correction at the end of the message is the one that runs.
func SelectModel(command, text string) string {
	if command == "codex" {
		return modelCodexLuna
	}
	if phrase, ok := lastModel(text); ok {
		switch command {
		case "claude":
			return phrase.claude
		case "pi":
			return phrase.pi
		}
	}
	return defaultModel(command)
}

// modelID is the flag value for one run: an explicit RunSpec.Model, or
// the command default when the caller left it empty.
func modelID(spec RunSpec, command string) string {
	if spec.Model != "" {
		return spec.Model
	}
	return defaultModel(command)
}

func defaultModel(command string) string {
	switch command {
	case "pi":
		return modelPiSonnet
	case "claude":
		return modelClaudeSonnet
	case "codex":
		return modelCodexLuna
	default:
		return ""
	}
}

// lastModel is the rightmost known model phrase in text. A phrase must
// not sit inside a longer token: the character on either side, when
// present, is not a letter, digit, underscore, or hyphen.
func lastModel(text string) (modelPhrase, bool) {
	s := strings.ToLower(text)
	var found modelPhrase
	ok := false
	for i := 0; i < len(s); {
		hit := false
		for _, phrase := range modelPhrases {
			if !strings.HasPrefix(s[i:], phrase.phrase) {
				continue
			}
			if i > 0 && isModelChar(s[i-1]) {
				continue
			}
			end := i + len(phrase.phrase)
			if end < len(s) && isModelChar(s[end]) {
				continue
			}
			found = phrase
			ok = true
			i = end
			hit = true
			break
		}
		if !hit {
			i++
		}
	}
	return found, ok
}

func isModelChar(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= '0' && b <= '9') || b == '_' || b == '-'
}
