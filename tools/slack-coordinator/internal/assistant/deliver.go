package assistant

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// answerEditLimit is the longest answer that replaces the ack in place; a
// longer one is split into chunks posted as thread replies under a `Done` ack.
const answerEditLimit = 4000

// maxAnswerRunes is the task-delivery name for answerEditLimit.
const maxAnswerRunes = answerEditLimit

// doneAck replaces the ack when the answer is too long to be the ack itself.
const doneAck = "Done"

// failedAck replaces the ack when a run ends without a usable result.
const failedAck = "Failed"

// deliver records out for run and routes to the kind-specific handler.
func (s *Service) deliver(ctx context.Context, run db.AssistantRun, out agent.RunOutcome) {
	if out.ResultSource == "stdout" {
		slog.Info(fmt.Sprintf("run %s: result.md missing, answered from stdout", run.RunID))
	}
	var err error
	switch run.Kind {
	case db.RunKindTask:
		err = s.deliverTask(ctx, run, out)
	default:
		err = s.deliverDM(ctx, run, out)
	}
	if err != nil {
		slog.Error("run not delivered", "run", run.RunID, "error", err)
	}
}

func (s *Service) deliverDM(ctx context.Context, run db.AssistantRun, out agent.RunOutcome) error {
	writeCtx := context.WithoutCancel(ctx)
	now := stamp(s.Now())
	if out.ExitCode != 0 || out.TimedOut {
		failure := s.failureText(out)
		if ctx.Err() != nil && out.TimedOut {
			failure = "daemon shutdown"
		} else {
			s.deliverFailure(ctx, run, failure, out.StderrTail)
		}
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, out.ExitCode, out.TimedOut, out.ResultSource, failure, now)
	}
	if out.ProposalErr != nil {
		s.deliverFailure(ctx, run, out.ProposalErr.Error(), "")
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, out.ExitCode, out.TimedOut, out.ResultSource, out.ProposalErr.Error(), now)
	}
	req, ok, err := s.DB.GetDMRequest(writeCtx, run.RootTS.String)
	if err != nil {
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, 0, false, out.ResultSource, "deliver: "+err.Error(), now)
	}
	if !ok {
		err := fmt.Errorf("dm request %s not found", run.RootTS.String)
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, 0, false, out.ResultSource, "deliver: "+err.Error(), now)
	}
	if out.Proposal != nil {
		return s.renderProposal(ctx, run, req, out)
	}
	if out.Result == "" {
		failure := "agent wrote no result"
		s.deliverFailure(ctx, run, failure, out.StderrTail)
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, out.ExitCode, out.TimedOut, out.ResultSource, failure, now)
	}
	answerTS, err := s.answer(ctx, req, out.Result)
	if err != nil {
		// The answer is on disk in the run directory; free the slot and keep
		// the reason rather than hold the row running forever.
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, 0, false, out.ResultSource, "deliver: "+err.Error(), now)
	}
	return s.DB.Transact(writeCtx, func(tx *db.DB) error {
		row := db.DMMessage{RootTS: req.RootTS, TS: answerTS, Author: db.AuthorBot, Text: out.Result, RunID: sql.NullString{String: run.RunID, Valid: true}}
		if err := tx.UpsertDMMessage(writeCtx, row); err != nil {
			return err
		}
		return tx.FinishAssistantRun(writeCtx, run.RunID, db.RunDone, 0, false, out.ResultSource, "", now)
	})
}

// answer puts result in req's thread and returns the ts of the message that
// holds it: the edited ack when result fits it, else the first chunk's ts
// under an ack set to doneAck. A request whose ack was never posted gets the
// answer as a new thread message.
func (s *Service) answer(ctx context.Context, req db.DMRequest, result string) (string, error) {
	if !req.AckTS.Valid {
		return s.Slack.PostMessage(ctx, req.ChannelID, req.RootTS, result)
	}
	if utf8.RuneCountInString(result) <= answerEditLimit {
		if _, err := s.Slack.UpdateMessage(ctx, req.ChannelID, req.AckTS.String, result); err != nil {
			return "", err
		}
		return req.AckTS.String, nil
	}
	if _, err := s.Slack.UpdateMessage(ctx, req.ChannelID, req.AckTS.String, doneAck); err != nil {
		return "", err
	}
	chunks := chunk(result, answerEditLimit)
	var firstTS string
	for _, c := range chunks {
		ts, err := s.Slack.PostMessage(ctx, req.ChannelID, req.RootTS, c)
		if err != nil {
			return "", err
		}
		if firstTS == "" {
			firstTS = ts
		}
	}
	return firstTS, nil
}

// chunk splits text at newline boundaries into pieces of at most limit runes,
// hard-splitting any single line that exceeds limit. It never emits an empty piece.
func chunk(text string, limit int) []string {
	var result []string
	var cur strings.Builder
	curRunes := 0

	flush := func() {
		if curRunes > 0 {
			result = append(result, cur.String())
			cur.Reset()
			curRunes = 0
		}
	}

	for _, line := range strings.SplitAfter(text, "\n") {
		if line == "" {
			continue
		}
		lineRunes := []rune(line)
		for len(lineRunes) > 0 {
			space := limit - curRunes
			if space <= 0 {
				flush()
				space = limit
			}
			take := len(lineRunes)
			if take > space {
				if curRunes > 0 {
					flush()
					space = limit
					take = len(lineRunes)
					if take > space {
						take = space
					}
				} else {
					take = space
				}
			}
			cur.WriteString(string(lineRunes[:take]))
			curRunes += take
			lineRunes = lineRunes[take:]
		}
	}
	flush()
	return result
}

// deliverTo is the decoded tasks.deliver_to JSON.
type deliverTo struct {
	DM        bool   `json:"dm"`
	ChannelID string `json:"channel_id"`
	ThreadTS  string `json:"thread_ts"`
}

// deliverTask handles delivery for kind=task runs. On success it posts the
// header and result to the task's target and updates the task row. On failure
// it unbinds the run's messages, increments consecutive_failures, and advances
// due_at for schedule tasks.
func (s *Service) deliverTask(ctx context.Context, run db.AssistantRun, out agent.RunOutcome) error {
	writeCtx := context.WithoutCancel(ctx)
	now := stamp(s.Now())

	task, err := s.DB.GetTask(writeCtx, run.TaskID.Int64)
	if err != nil {
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, -1, false, out.ResultSource, "deliver: "+err.Error(), now)
	}

	if out.ExitCode != 0 || out.TimedOut || out.Result == "" {
		failure := s.failureText(out)
		if ctx.Err() != nil && out.TimedOut {
			failure = "daemon shutdown"
		}
		if err := s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, out.ExitCode, out.TimedOut, out.ResultSource, failure, now); err != nil {
			return err
		}
		if err := s.DB.UnbindRunMessages(writeCtx, run.RunID); err != nil {
			return err
		}
		return s.DB.RecordTaskFailure(writeCtx, task.TaskID, s.taskNextDue(task, now))
	}

	// Count bound messages for the header.
	msgs, err := s.DB.MessagesForRun(writeCtx, run.RunID)
	if err != nil {
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, 0, false, out.ResultSource, "deliver: "+err.Error(), now)
	}

	// Build channel name list for the header.
	channels, _ := s.DB.TaskChannels(writeCtx, task.TaskID)
	names := make([]string, 0, len(channels))
	for _, ch := range channels {
		names = append(names, s.channelName(ctx, ch))
	}
	header := fmt.Sprintf("t%d · %s · %d new items", task.TaskID, strings.Join(names, ", "), len(msgs))

	// Resolve the delivery target.
	var target deliverTo
	if err := json.Unmarshal([]byte(task.DeliverTo), &target); err != nil {
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, 0, false, out.ResultSource, "deliver: bad deliver_to: "+err.Error(), now)
	}

	var channelID, threadTS string
	if target.DM {
		if s.ownerDM == "" {
			dm, err := s.Slack.OpenConversation(ctx, s.Owner)
			if err != nil {
				return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, 0, false, out.ResultSource, "deliver: open dm: "+err.Error(), now)
			}
			s.ownerDM = dm
		}
		channelID = s.ownerDM
		threadTS = ""
	} else {
		channelID = target.ChannelID
		threadTS = target.ThreadTS
	}

	// Post header + result, chunking at maxAnswerRunes.
	chunks := chunkResult(header, out.Result)
	for _, chunk := range chunks {
		if _, err := s.Slack.PostMessage(ctx, channelID, threadTS, chunk); err != nil {
			return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, 0, false, out.ResultSource, "deliver: post: "+err.Error(), now)
		}
	}

	if err := s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunDone, 0, false, out.ResultSource, "", now); err != nil {
		return err
	}
	var nextDue, endedAt *string
	if task.Trigger == db.TriggerSchedule {
		nd := s.taskNextDueStr(task, now)
		nextDue = nd
	} else {
		endedAt = &now
	}
	return s.DB.RecordTaskSuccess(writeCtx, task.TaskID, nextDue, endedAt, now)
}

// taskNextDue returns the next due time for task as a *string for schedule
// tasks, or nil for window_end tasks.
func (s *Service) taskNextDue(task db.Task, now string) *string {
	if task.Trigger != db.TriggerSchedule || !task.Schedule.Valid {
		return nil
	}
	return s.taskNextDueStr(task, now)
}

// taskNextDueStr computes NextDue for task and returns a *string pointer.
// A schedule that fails to parse or produces a zero time returns nil.
func (s *Service) taskNextDueStr(task db.Task, now string) *string {
	t, err := time.Parse(time.RFC3339, now)
	if err != nil {
		return nil
	}
	next, err := NextDue(task.Schedule.String, t)
	if err != nil || next.IsZero() {
		return nil
	}
	v := stamp(next)
	return &v
}

// chunkResult splits header+"\n"+result into consecutive chunks of at most
// maxAnswerRunes runes; the header appears only in the first chunk.
func chunkResult(header, result string) []string {
	full := header + "\n" + result
	if utf8.RuneCountInString(full) <= maxAnswerRunes {
		return []string{full}
	}
	runes := []rune(result)
	headerRunes := utf8.RuneCountInString(header) + 1 // +1 for "\n"
	var chunks []string
	firstCap := maxAnswerRunes - headerRunes
	if firstCap > 0 && len(runes) > 0 {
		end := firstCap
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, header+"\n"+string(runes[:end]))
		runes = runes[end:]
	} else {
		chunks = append(chunks, header)
	}
	for len(runes) > 0 {
		end := maxAnswerRunes
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, string(runes[:end]))
		runes = runes[end:]
	}
	return chunks
}

// deliverFailure edits the ack to failedAck, posts a thread reply whose
// first line is cause (followed by stderrTail in a code fence when non-empty),
// and inserts a dm_messages bot row bound to the run. Slack errors are logged
// and do not prevent the database write. It does not record the run as failed;
// callers do that.
func (s *Service) deliverFailure(ctx context.Context, run db.AssistantRun, cause, stderrTail string) {
	writeCtx := context.WithoutCancel(ctx)
	req, ok, err := s.DB.GetDMRequest(writeCtx, run.RootTS.String)
	if err != nil {
		slog.Error("deliverFailure: get dm request", "run", run.RunID, "error", err)
		return
	}
	if !ok {
		slog.Error("deliverFailure: dm request not found", "run", run.RunID)
		return
	}
	text := cause
	if stderrTail != "" {
		text = cause + "\n\n```\n" + stderrTail + "\n```"
	}
	if req.AckTS.Valid {
		if _, err := s.Slack.UpdateMessage(ctx, req.ChannelID, req.AckTS.String, failedAck); err != nil {
			slog.Error("deliverFailure: edit ack", "run", run.RunID, "error", err)
		}
	}
	replyTS, err := s.Slack.PostMessage(ctx, req.ChannelID, req.RootTS, text)
	if err != nil {
		slog.Error("deliverFailure: post reply", "run", run.RunID, "error", err)
		return
	}
	row := db.DMMessage{
		RootTS: req.RootTS,
		TS:     replyTS,
		Author: db.AuthorBot,
		Text:   text,
		RunID:  sql.NullString{String: run.RunID, Valid: true},
	}
	if err := s.DB.UpsertDMMessage(writeCtx, row); err != nil {
		slog.Error("deliverFailure: upsert dm_messages", "run", run.RunID, "error", err)
	}
}

// failureText names why out is not an answer.
func (s *Service) failureText(out agent.RunOutcome) string {
	switch {
	case out.TimedOut:
		return fmt.Sprintf("timed out after %s", s.Agent.Timeout)
	case out.ExitCode != 0:
		return fmt.Sprintf("exit %d", out.ExitCode)
	default:
		return "agent wrote no result"
	}
}
