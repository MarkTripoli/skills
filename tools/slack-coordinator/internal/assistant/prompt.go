package assistant

import (
	"bytes"
	_ "embed"
	"encoding/json"
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

// taskMessageJSON is the JSON shape of one messages.jsonl line.
type taskMessageJSON struct {
	Author    string `json:"author"`
	Channel   string `json:"channel"`
	TS        string `json:"ts"`
	Text      string `json:"text"`
	Permalink string `json:"permalink"`
}

// renderTaskPrompt writes the prompt for a task run: a header, the skill text,
// the task's instruction, its last result (or "(none)"), and the message count.
func renderTaskPrompt(runID, approval string, task db.Task, msgCount int) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# Assistant run %s\n\nkind: task · approval: %s\n\n", runID, approval)
	b.WriteString(strings.TrimRight(skillText, "\n"))
	b.WriteString("\n\n## Instruction\n\n")
	b.WriteString(task.Instruction)
	b.WriteString("\n\n## Previous result\n\n")
	if task.LastResultAt.Valid {
		b.WriteString("(see previous run)")
	} else {
		b.WriteString("(none)")
	}
	fmt.Fprintf(&b, "\n\n## Collected messages\n\n%d messages in %s\n", msgCount, messagesFile)
	return b.String()
}

// writeTaskInputs creates runDir, writes prompt.md, and writes messages.jsonl
// with one JSON object per message in the order given, both readable by the
// owner only.
func writeTaskInputs(runDir, prompt string, msgs []db.TaskMessage) error {
	if err := agent.Create(runDir); err != nil {
		return fmt.Errorf("create run dir: %w", err)
	}
	if err := os.WriteFile(filepath.Join(runDir, promptFile), []byte(prompt), 0o600); err != nil {
		return fmt.Errorf("write %s: %w", promptFile, err)
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	for _, m := range msgs {
		if err := enc.Encode(taskMessageJSON{
			Author:    m.Author,
			Channel:   m.ChannelID,
			TS:        m.TS,
			Text:      m.Text,
			Permalink: m.Permalink,
		}); err != nil {
			return fmt.Errorf("encode message: %w", err)
		}
	}
	if err := os.WriteFile(filepath.Join(runDir, messagesFile), buf.Bytes(), 0o600); err != nil {
		return fmt.Errorf("write %s: %w", messagesFile, err)
	}
	return nil
}
