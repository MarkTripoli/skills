package assistant

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// skillText is the contract every headless run reads: the run directory
// files, the proposal schema, the approval levels, and the rules.
//
//go:embed skill/ASSISTANT.md
var skillText string

// Files the dispatcher writes into a run directory before the agent starts.
const (
	promptFile   = "prompt.md"
	messagesFile = "messages.jsonl"
)

// promptInput is what one prompt.md says beyond the skill text.
type promptInput struct {
	RunID    string
	Kind     string // "dm request"
	Approval string // edits | full
	Request  string // the newest owner message
	Thread   []db.DMMessage
}

// renderPrompt writes the prompt for p: a header naming the run, its kind and
// approval level, the skill text, the request, the thread so far in ts order
// as `owner: …` / `bot: …` lines, and the collected-message count, which a
// direct request leaves at zero.
func renderPrompt(p promptInput) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# Assistant run %s\n\nkind: %s · approval: %s\n\n", p.RunID, p.Kind, p.Approval)
	b.WriteString(strings.TrimRight(skillText, "\n"))
	b.WriteString("\n\n## Request\n\n")
	b.WriteString(p.Request)
	b.WriteString("\n\n## Thread so far\n\n")
	for _, m := range p.Thread {
		fmt.Fprintf(&b, "%s: %s\n", m.Author, m.Text)
	}
	b.WriteString("\n## Collected messages\n\n0 messages in " + messagesFile + "\n")
	return b.String()
}

// newestOwnerMessage is the text of the last owner row in thread, which is in
// ts order; an empty string when the owner wrote nothing.
func newestOwnerMessage(thread []db.DMMessage) string {
	for i := len(thread) - 1; i >= 0; i-- {
		if thread[i].Author == db.AuthorOwner {
			return thread[i].Text
		}
	}
	return ""
}

// writeInputs creates runDir and writes prompt.md holding prompt and an empty
// messages.jsonl, both readable by the owner only.
func writeInputs(runDir, prompt string) error {
	if err := agent.Create(runDir); err != nil {
		return fmt.Errorf("create run dir: %w", err)
	}
	if err := os.WriteFile(filepath.Join(runDir, promptFile), []byte(prompt), 0o600); err != nil {
		return fmt.Errorf("write %s: %w", promptFile, err)
	}
	if err := os.WriteFile(filepath.Join(runDir, messagesFile), nil, 0o600); err != nil {
		return fmt.Errorf("write %s: %w", messagesFile, err)
	}
	return nil
}
