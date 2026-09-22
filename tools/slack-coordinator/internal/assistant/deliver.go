package assistant

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"unicode/utf8"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// maxAnswerRunes is the longest answer that replaces the ack in place; a
// longer one is posted as its own thread message under a Done ack.
const (
	maxAnswerRunes = 4000
	// doneAck replaces the ack when the answer is too long to be the ack itself.
	doneAck = "Done"
	// failedAck replaces the ack when a run ends without a usable result.
	failedAck = "Failed"
)

// deliver records out for the dm run and answers the owner. A clean exit
// with a result edits the ack into the answer (or, past maxAnswerRunes, sets
// the ack to doneAck and posts the answer in the thread), records the bot
// row, and finishes the run done. Any other outcome finishes the run failed
// with the reason and makes no Slack call. Slack is called first and the
// database written after; no transaction spans a Slack call.
func (s *Service) deliver(ctx context.Context, run db.AssistantRun, out agent.RunOutcome) {
	if out.ResultSource == "stdout" {
		slog.Info(fmt.Sprintf("run %s: result.md missing, answered from stdout", run.RunID))
	}
	if err := s.deliverDM(ctx, run, out); err != nil {
		slog.Error("run not delivered", "run", run.RunID, "error", err)
	}
}

func (s *Service) deliverDM(ctx context.Context, run db.AssistantRun, out agent.RunOutcome) error {
	writeCtx := context.WithoutCancel(ctx)
	now := stamp(s.Now())
	if out.ExitCode != 0 || out.TimedOut || out.Result == "" {
		failure := s.failureText(out)
		if ctx.Err() != nil && out.TimedOut {
			failure = "daemon shutdown"
		} else {
			s.deliverFailure(ctx, run, failure, out.StderrTail)
		}
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, out.ExitCode, out.TimedOut, out.ResultSource, failure, now)
	}
	req, ok, err := s.DB.GetDMRequest(writeCtx, run.RootTS.String)
	if err != nil {
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, 0, false, out.ResultSource, "deliver: "+err.Error(), now)
	}
	if !ok {
		err := fmt.Errorf("dm request %s not found", run.RootTS.String)
		return s.DB.FinishAssistantRun(writeCtx, run.RunID, db.RunFailed, 0, false, out.ResultSource, "deliver: "+err.Error(), now)
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
// holds it: the edited ack when result fits it, else a new thread message
// under an ack set to doneAck. A request whose ack was never posted gets the
// answer as a new thread message.
func (s *Service) answer(ctx context.Context, req db.DMRequest, result string) (string, error) {
	if !req.AckTS.Valid {
		return s.Slack.PostMessage(ctx, req.ChannelID, req.RootTS, result)
	}
	if utf8.RuneCountInString(result) <= maxAnswerRunes {
		if _, err := s.Slack.UpdateMessage(ctx, req.ChannelID, req.AckTS.String, result); err != nil {
			return "", err
		}
		return req.AckTS.String, nil
	}
	if _, err := s.Slack.UpdateMessage(ctx, req.ChannelID, req.AckTS.String, doneAck); err != nil {
		return "", err
	}
	return s.Slack.PostMessage(ctx, req.ChannelID, req.RootTS, result)
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
