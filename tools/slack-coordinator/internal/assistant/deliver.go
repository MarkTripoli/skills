package assistant

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"unicode/utf8"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// answerEditLimit is the longest answer that replaces the ack in place; a
// longer one is split into chunks posted as thread replies under a `Done` ack.
const answerEditLimit = 4000

// doneAck replaces the ack when the answer is too long to be the ack itself.
const doneAck = "Done"

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
