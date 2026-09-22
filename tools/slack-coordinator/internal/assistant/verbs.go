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

// helpText lists every verb the DM understands.
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

// noActiveRunsReply answers `!runs` when no runs row is active.
const noActiveRunsReply = "No active runs."

// noTasksReply answers `!tasks` when no task is active or paused.
const noTasksReply = "No standing tasks."

// waitingForMessages stands in for a due time when a task has none: an
// each_message task waits for its watched channels, a paused task waits too.
const waitingForMessages = "waiting for messages"

// showRunLimit is how many of a task's newest runs `!show` prints.
const showRunLimit = 5

// resultExcerptRunes bounds the result.md text `!show` prints per run.
const resultExcerptRunes = 500

// verbTable maps each lowercased verb to its handler.
func (s *Service) verbTable() map[string]verb {
	return map[string]verb{
		"!help":   s.help,
		"!status": s.status,
		"!runs":   s.runs,
		"!tasks":  s.tasks,
		"!show":   s.show,
		"!pause":  s.pause,
		"!resume": s.resume,
		"!cancel": s.cancel,
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

// tasks lists the active and paused tasks, one per line, or noTasksReply.
func (s *Service) tasks(ctx context.Context, _ []string) (string, error) {
	list, err := s.DB.ListTasks(ctx, db.TaskActive, db.TaskPaused)
	if err != nil {
		return "", err
	}
	if len(list) == 0 {
		return noTasksReply, nil
	}
	var b strings.Builder
	for i, t := range list {
		if i > 0 {
			b.WriteByte('\n')
		}
		channels, err := s.DB.TaskChannels(ctx, t.TaskID)
		if err != nil {
			return "", err
		}
		names := make([]string, len(channels))
		for j, id := range channels {
			names[j] = s.channelName(ctx, id)
		}
		watches := "none"
		if len(names) > 0 {
			watches = strings.Join(names, ", ")
		}
		next := waitingForMessages
		if t.DueAt.Valid {
			next = dueText(t, t.DueAt.String)
		}
		last := "none"
		if t.LastResultAt.Valid {
			last = t.LastResultAt.String
		}
		fmt.Fprintf(&b, "t%d · %s · watches %s · %s · next %s · last result %s", t.TaskID, t.State, watches, scheduleText(t), next, last)
	}
	return b.String(), nil
}

// show prints one task: its state, its instruction verbatim, and its newest
// runs, each followed by an excerpt of its result.md when the run dir has one.
// Completed and cancelled tasks show like any other row.
func (s *Service) show(ctx context.Context, args []string) (string, error) {
	t, reply, err := s.taskArg(ctx, args)
	if err != nil || reply != "" {
		return reply, err
	}
	runs, err := s.DB.RecentRunsForTask(ctx, t.TaskID, showRunLimit)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	fmt.Fprintf(&b, "t%d · %s\n%s", t.TaskID, t.State, t.Instruction)
	for _, r := range runs {
		b.WriteString("\n" + runLine(r))
		excerpt, err := resultExcerpt(filepath.Join(s.Paths.RunDir(r.RunID), "result.md"))
		if err != nil {
			return "", err
		}
		if excerpt != "" {
			b.WriteString("\n" + excerpt)
		}
	}
	return b.String(), nil
}

// runLine is one `!show` run: when it ended (or started, or was queued), its
// state, and its exit code or failure once it has one.
func runLine(r db.TaskRun) string {
	when := r.QueuedAt
	switch {
	case r.FinishedAt.Valid:
		when = r.FinishedAt.String
	case r.StartedAt.Valid:
		when = r.StartedAt.String
	}
	line := when + " · " + r.State
	switch {
	case r.ExitCode.Valid:
		line += fmt.Sprintf(" · exit %d", r.ExitCode.Int64)
	case r.Failure.Valid:
		line += " · " + r.Failure.String
	}
	return line
}

// resultExcerpt reads at most resultExcerptRunes of the file at name, trailing
// whitespace trimmed; a missing file is "".
func resultExcerpt(name string) (string, error) {
	data, err := os.ReadFile(name)
	if errors.Is(err, fs.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	text := string(data)
	if runes := []rune(text); len(runes) > resultExcerptRunes {
		text = string(runes[:resultExcerptRunes])
	}
	return strings.TrimRight(text, " \t\r\n"), nil
}

// pause moves an active task to paused and clears its due time.
func (s *Service) pause(ctx context.Context, args []string) (string, error) {
	t, reply, err := s.taskArg(ctx, args)
	if err != nil || reply != "" {
		return reply, err
	}
	if t.State != db.TaskActive {
		return fmt.Sprintf("t%d is %s", t.TaskID, t.State), nil
	}
	if err := s.DB.SetTaskState(ctx, t.TaskID, db.TaskPaused, nil, nil); err != nil {
		return "", err
	}
	return fmt.Sprintf("t%d paused", t.TaskID), nil
}

// resume moves a paused task back to active with a fresh due time from its
// schedule (none for each_message, or for a window whose `at` has passed) and
// forgets its consecutive failures.
func (s *Service) resume(ctx context.Context, args []string) (string, error) {
	t, reply, err := s.taskArg(ctx, args)
	if err != nil || reply != "" {
		return reply, err
	}
	if t.State != db.TaskPaused {
		return fmt.Sprintf("t%d is %s", t.TaskID, t.State), nil
	}
	var due *string
	next := waitingForMessages
	if t.Trigger != db.TriggerEachMessage {
		at, err := NextDue(t.Schedule.String, s.Now())
		if err != nil {
			return "", fmt.Errorf("resume t%d: %w", t.TaskID, err)
		}
		if at.IsZero() {
			next = "window already passed"
		} else {
			d := stamp(at)
			due = &d
			next = "next due " + dueText(t, d)
		}
	}
	err = s.DB.Transact(ctx, func(tx *db.DB) error {
		if err := tx.SetTaskState(ctx, t.TaskID, db.TaskActive, due, nil); err != nil {
			return err
		}
		return tx.ResetTaskFailures(ctx, t.TaskID)
	})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("t%d resumed · %s", t.TaskID, next), nil
}

// cancel ends an active or paused task now.
func (s *Service) cancel(ctx context.Context, args []string) (string, error) {
	t, reply, err := s.taskArg(ctx, args)
	if err != nil || reply != "" {
		return reply, err
	}
	if t.State != db.TaskActive && t.State != db.TaskPaused {
		return fmt.Sprintf("t%d is %s", t.TaskID, t.State), nil
	}
	ended := stamp(s.Now())
	if err := s.DB.SetTaskState(ctx, t.TaskID, db.TaskCancelled, nil, &ended); err != nil {
		return "", err
	}
	return fmt.Sprintf("t%d cancelled", t.TaskID), nil
}

// taskArg resolves the id argument of a task verb to its row. A missing,
// malformed, or unknown id yields the reply naming the active and paused ids
// instead, and the verb posts that.
func (s *Service) taskArg(ctx context.Context, args []string) (db.Task, string, error) {
	if len(args) > 0 {
		if id, err := parseTaskID(args[0]); err == nil {
			t, err := s.DB.GetTask(ctx, id)
			if err == nil {
				return t, "", nil
			}
			if !errors.Is(err, db.ErrTaskNotFound) {
				return db.Task{}, "", err
			}
		}
	}
	known, err := s.DB.ListTasks(ctx, db.TaskActive, db.TaskPaused)
	if err != nil {
		return db.Task{}, "", err
	}
	var b strings.Builder
	b.WriteString("unknown id, known:")
	for _, t := range known {
		fmt.Fprintf(&b, " t%d", t.TaskID)
	}
	if len(known) == 0 {
		b.WriteString(" none")
	}
	return db.Task{}, b.String(), nil
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
