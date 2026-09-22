package assistant

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// queuedAckPrefix opens the ack of a request that had to wait; the dispatcher
// edits such an ack to workingAck when the run starts.
const (
	queuedAckPrefix = "Queued behind"
	workingAck      = "Working on it"
)

// RunDispatcher calls Tick every period and whenever Wake signals, until ctx
// ends; it then waits for the deliveries of running agents, whose Wait
// returns once the ended ctx has killed them.
func (s *Service) RunDispatcher(ctx context.Context, period time.Duration) {
	ticker := time.NewTicker(period)
	defer ticker.Stop()
	defer s.inflight.Wait()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-s.wake:
		}
		if err := s.Tick(ctx); err != nil {
			slog.Warn("dispatcher tick failed", "error", err)
		}
	}
}

// Tick enqueues due tasks and then spawns queued runs into the free slots.
func (s *Service) Tick(ctx context.Context) error {
	if err := s.enqueueDueTasks(ctx); err != nil {
		return err
	}
	return s.spawnQueued(ctx)
}

// enqueueDueTasks queries for active schedule/window_end tasks whose due_at
// has passed and which have no queued or running run, then inserts one queued
// assistant_runs row per task and binds that task's unconsumed messages to it.
func (s *Service) enqueueDueTasks(ctx context.Context) error {
	tasks, err := s.DB.DueTasks(ctx, stamp(s.Now()))
	if err != nil {
		return err
	}
	for _, task := range tasks {
		now := stamp(s.Now())
		runID := ulid.Make().String()
		if err := s.DB.Transact(ctx, func(tx *db.DB) error {
			if err := tx.InsertAssistantRun(ctx, db.AssistantRun{
				RunID:    runID,
				Kind:     db.RunKindTask,
				TaskID:   sql.NullInt64{Int64: task.TaskID, Valid: true},
				State:    db.RunQueued,
				QueuedAt: now,
			}); err != nil {
				return err
			}
			_, err := tx.BindUnconsumedToRun(ctx, task.TaskID, runID)
			return err
		}); err != nil {
			return err
		}
	}
	return nil
}

// spawnQueued starts the oldest queued run while fewer than maxRunningRuns are
// running. A run that cannot start is recorded failed and the next one is
// tried; a database failure ends the tick.
func (s *Service) spawnQueued(ctx context.Context) error {
	if s.Runner == nil {
		return nil
	}
	for {
		running, err := s.DB.CountRunsByState(ctx, db.RunRunning)
		if err != nil {
			return err
		}
		if running >= maxRunningRuns {
			return nil
		}
		run, ok, err := s.DB.OldestQueued(ctx)
		if err != nil || !ok {
			return err
		}
		if err := s.spawn(ctx, run); err != nil {
			return fmt.Errorf("run %s: %w", run.RunID, err)
		}
	}
}

// spawn writes run's inputs, starts the agent, and records the row running
// before any Slack call; then an ack that said the request was queued is
// edited to workingAck, and the delivery waits for the agent in its own
// goroutine. A run whose request, inputs, or process cannot be produced is
// recorded failed with the error text, so the queue moves on.
func (s *Service) spawn(ctx context.Context, run db.AssistantRun) error {
	st, err := s.start(ctx, run)
	if err != nil {
		slog.Error("run not started", "run", run.RunID, "error", err)
		return s.DB.FinishAssistantRun(ctx, run.RunID, db.RunFailed, -1, false, "", err.Error(), stamp(s.Now()))
	}
	if err := s.DB.MarkRunning(ctx, run.RunID, st.handle.Pid, st.handle.Pgid, os.Getpid(), stamp(s.Now())); err != nil {
		st.handle.Kill()
		return err
	}
	if ack := st.req.AckTS; ack.Valid && strings.HasPrefix(ackText(st.thread, ack.String), queuedAckPrefix) {
		if _, err := s.Slack.UpdateMessage(ctx, st.req.ChannelID, ack.String, workingAck); err != nil {
			slog.Warn("queued ack not edited", "run", run.RunID, "error", err)
		}
	}
	s.inflight.Go(func() { s.deliver(ctx, run, st.handle.Wait()) })
	return nil
}

// startedRun is a spawned agent with the data it needs for delivery.
type startedRun struct {
	handle *agent.Handle
	req    db.DMRequest    // dm runs: the request being answered
	thread []db.DMMessage  // dm runs: the request's dm_messages in ts order
	task   db.Task         // task runs: the task being run
	msgs   []db.TaskMessage // task runs: the messages bound to this run
}

// start dispatches to startDM or startTask based on run.Kind.
func (s *Service) start(ctx context.Context, run db.AssistantRun) (startedRun, error) {
	switch run.Kind {
	case db.RunKindDM:
		return s.startDM(ctx, run)
	case db.RunKindTask:
		return s.startTask(ctx, run)
	default:
		return startedRun{}, fmt.Errorf("unknown kind %q", run.Kind)
	}
}

// startDM loads run's request and thread, renders the prompt, writes the run
// directory inputs, and spawns the configured agent.
func (s *Service) startDM(ctx context.Context, run db.AssistantRun) (startedRun, error) {
	if run.Kind != db.RunKindDM || !run.RootTS.Valid {
		return startedRun{}, fmt.Errorf("kind %q is not a dm request", run.Kind)
	}
	req, ok, err := s.DB.GetDMRequest(ctx, run.RootTS.String)
	if err != nil {
		return startedRun{}, err
	}
	if !ok {
		return startedRun{}, fmt.Errorf("dm request %s not found", run.RootTS.String)
	}
	thread, err := s.DB.ListDMMessages(ctx, run.RootTS.String)
	if err != nil {
		return startedRun{}, err
	}
	if err := s.Paths.EnsureWorkspace(); err != nil {
		return startedRun{}, fmt.Errorf("ensure workspace: %w", err)
	}
	runDir := s.Paths.RunDir(run.RunID)
	prompt := renderPrompt(promptInput{
		RunID:    run.RunID,
		Kind:     "dm request",
		Approval: s.Agent.Approval,
		Request:  newestOwnerMessage(thread),
		Thread:   thread,
	})
	if err := writeInputs(runDir, prompt); err != nil {
		return startedRun{}, err
	}
	handle, err := s.Runner.Start(ctx, agent.RunSpec{
		RunDir:    runDir,
		Approval:  s.Agent.Approval,
		ExtraDirs: s.Agent.ExtraDirs,
		Timeout:   s.Agent.Timeout,
	})
	if err != nil {
		return startedRun{}, err
	}
	return startedRun{handle: handle, req: req, thread: thread}, nil
}

// startTask loads run's task and bound messages, renders the prompt, writes
// the run directory inputs, marks the task started, and spawns the agent.
func (s *Service) startTask(ctx context.Context, run db.AssistantRun) (startedRun, error) {
	if run.Kind != db.RunKindTask || !run.TaskID.Valid {
		return startedRun{}, fmt.Errorf("kind %q is not a task run", run.Kind)
	}
	task, err := s.DB.GetTask(ctx, run.TaskID.Int64)
	if err != nil {
		return startedRun{}, err
	}
	msgs, err := s.DB.MessagesForRun(ctx, run.RunID)
	if err != nil {
		return startedRun{}, err
	}
	if err := s.Paths.EnsureWorkspace(); err != nil {
		return startedRun{}, fmt.Errorf("ensure workspace: %w", err)
	}
	runDir := s.Paths.RunDir(run.RunID)
	prompt := renderTaskPrompt(run.RunID, s.Agent.Approval, task, len(msgs))
	if err := writeTaskInputs(runDir, prompt, msgs); err != nil {
		return startedRun{}, err
	}
	if err := s.DB.MarkTaskRunStarted(ctx, task.TaskID, stamp(s.Now())); err != nil {
		return startedRun{}, err
	}
	handle, err := s.Runner.Start(ctx, agent.RunSpec{
		RunDir:    runDir,
		Approval:  s.Agent.Approval,
		ExtraDirs: s.Agent.ExtraDirs,
		Timeout:   s.Agent.Timeout,
	})
	if err != nil {
		return startedRun{}, err
	}
	return startedRun{handle: handle, task: task, msgs: msgs}, nil
}

// ackText is the stored text of the bot row at ackTS in thread, or "".
func ackText(thread []db.DMMessage, ackTS string) string {
	for _, m := range thread {
		if m.TS == ackTS && m.Author == db.AuthorBot {
			return m.Text
		}
	}
	return ""
}
