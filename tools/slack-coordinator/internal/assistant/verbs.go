package assistant

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// verb answers one `!` command with the text to post. args are the
// whitespace-separated tokens after the verb itself.
type verb func(ctx context.Context, args []string) (string, error)

// helpText lists every verb the DM understands. The task verbs are listed
// before they work so the table is stable; until then they answer
// notAvailableReply.
const helpText = "```\n" +
	"!help          this table\n" +
	"!status        uptime, Socket Mode, run and task counts, agent, disk use\n" +
	"!tasks         list the assistant's tasks\n" +
	"!show <id>     one task in detail\n" +
	"!runs          active coding-agent runs\n" +
	"!pause <id>    pause a task\n" +
	"!resume <id>   resume a paused task\n" +
	"!cancel <id>   cancel a task\n" +
	"```\n" +
	"Anything else sent here goes to the assistant."

// notAvailableReply answers a listed verb whose handler is not implemented yet.
const notAvailableReply = "not available yet"

// noActiveRunsReply answers `!runs` when no runs row is active.
const noActiveRunsReply = "No active runs."

// verbTable maps each lowercased verb to its handler.
func (s *Service) verbTable() map[string]verb {
	notYet := func(context.Context, []string) (string, error) { return notAvailableReply, nil }
	return map[string]verb{
		"!help":   s.help,
		"!status": s.status,
		"!runs":   s.runs,
		"!tasks":  notYet,
		"!show":   notYet,
		"!pause":  notYet,
		"!resume": notYet,
		"!cancel": notYet,
	}
}

// runVerb answers text, an owner top-level DM starting with `!`, at the top
// level of channel. The first token, lowercased, selects the verb; an unknown
// verb or a bare `!` gets the help table. No row is written.
func (s *Service) runVerb(ctx context.Context, channel, text string) error {
	fields := strings.Fields(text)
	v, ok := s.verbs[strings.ToLower(fields[0])]
	if !ok {
		v = s.help
	}
	reply, err := v(ctx, fields[1:])
	if err != nil {
		return err
	}
	_, err = s.Slack.PostMessage(ctx, channel, "", reply)
	return err
}

func (s *Service) help(context.Context, []string) (string, error) { return helpText, nil }

// status reports the daemon: uptime, Socket Mode state, active coding-agent
// runs, tasks by state, the configured agent, row counts, and disk use.
func (s *Service) status(ctx context.Context, _ []string) (string, error) {
	active, err := s.DB.ActiveRuns(ctx)
	if err != nil {
		return "", err
	}
	var tasks [4]int
	for i, state := range [...]string{db.TaskActive, db.TaskPaused, db.TaskCompleted, db.TaskCancelled} {
		if tasks[i], err = s.DB.CountTasksByState(ctx, state); err != nil {
			return "", err
		}
	}
	messages, err := s.DB.CountCollectedMessages(ctx)
	if err != nil {
		return "", err
	}
	runs, err := s.DB.CountAssistantRuns(ctx)
	if err != nil {
		return "", err
	}
	dbBytes, err := fileBytes(s.Paths.DB(), s.Paths.DB()+"-wal", s.Paths.DB()+"-shm")
	if err != nil {
		return "", err
	}
	runsBytes, err := dirBytes(filepath.Join(s.Paths.Workspace(), "runs"))
	if err != nil {
		return "", err
	}
	agent := "none"
	if s.Agent != nil {
		agent = fmt.Sprintf("%s (approval: %s)", s.Agent.Command, s.Agent.Approval)
	}
	return fmt.Sprintf("up %s\nsocket mode: %s\nactive runs: %d\ntasks: active %d · paused %d · completed %d · cancelled %d\nagent: %s\nmessages: %d · runs: %d\ndisk: %s db · %s runs",
		s.Now().Sub(s.started).Truncate(time.Second), s.socketHealth(), len(active),
		tasks[0], tasks[1], tasks[2], tasks[3], agent, messages, runs,
		humanBytes(dbBytes), humanBytes(runsBytes)), nil
}

// runs lists the active runs rows, one per line, or noActiveRunsReply.
func (s *Service) runs(ctx context.Context, _ []string) (string, error) {
	active, err := s.DB.ActiveRuns(ctx)
	if err != nil {
		return "", err
	}
	if len(active) == 0 {
		return noActiveRunsReply, nil
	}
	var b strings.Builder
	for i, r := range active {
		if i > 0 {
			b.WriteByte('\n')
		}
		fmt.Fprintf(&b, "%s · %s · started %s · %s", r.RunID, r.ChannelID, r.StartedAt, r.Permalink)
	}
	return b.String(), nil
}

// socketHealth is the coordinator's Socket Mode state; a coordinator without
// Health reads as not_started, as run check does.
func (s *Service) socketHealth() string {
	if s.Coord.Health == nil {
		return slackapi.SocketNotStarted
	}
	return s.Coord.Health()
}

// fileBytes sums the sizes of the named files; a file that does not exist
// contributes 0.
func fileBytes(names ...string) (int64, error) {
	var total int64
	for _, name := range names {
		info, err := os.Stat(name)
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return 0, err
		}
		total += info.Size()
	}
	return total, nil
}

// dirBytes sums the sizes of the regular files under root; a missing root is 0.
func dirBytes(root string) (int64, error) {
	var total int64
	err := filepath.WalkDir(root, func(_ string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.Type().IsRegular() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		total += info.Size()
		return nil
	})
	if errors.Is(err, fs.ErrNotExist) {
		return 0, nil
	}
	return total, err
}

// humanBytes formats n as `12.3 MB`, in 1024-based units; below 1 KB it is `n B`.
func humanBytes(n int64) string {
	const unit = 1024
	if n < unit {
		return fmt.Sprintf("%d B", n)
	}
	div, exp := int64(unit), 0
	for m := n / unit; m >= unit; m /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(n)/float64(div), "KMGTPE"[exp])
}
