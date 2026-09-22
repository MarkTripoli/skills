package assistant

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"syscall"
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

	// eachMessageFloor is the minimum gap the dispatcher enforces between
	// successive runs of an each_message task, measured from last_run_started_at.
	eachMessageFloor = 10 * time.Minute
)

// RunDispatcher calls Tick every period and whenever Wake signals, until ctx
// ends; it kills every live agent handle and then waits for deliveries.
func (s *Service) RunDispatcher(ctx context.Context, period time.Duration) {
	ticker := time.NewTicker(period)
	defer ticker.Stop()
	defer s.inflight.Wait()
	for {
		select {
		case <-ctx.Done():
			s.handlesMu.Lock()
			for _, h := range s.handles {
				h.Kill()
			}
			s.handlesMu.Unlock()
			return
		case <-ticker.C:
		case <-s.wake:
		}
		if err := s.Tick(ctx); err != nil {
			slog.Warn("dispatcher tick failed", "error", err)
		}
	}
}

// Tick reaps orphaned runs, enqueues due tasks, and spawns queued runs.
func (s *Service) Tick(ctx context.Context) error {
	if err := s.reapOrphans(ctx); err != nil {
		return err
	}
	if err := s.enqueueDueTasks(ctx); err != nil {
		return err
	}
	return s.spawnQueued(ctx)
}

// reapOrphans kills and fails every running row whose daemon_pid differs from
// this process's PID: they were left running by a daemon that restarted. DM
// runs also have their ack edited to Failed and a reply posted.
func (s *Service) reapOrphans(ctx context.Context) error {
	runs, err := s.DB.RunningOrphanedRuns(ctx, os.Getpid())
	if err != nil {
		return err
	}
	for _, run := range runs {
		pgid := int(run.PGID.Int64)
		if err := syscall.Kill(-pgid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
			slog.Warn("reapOrphans: kill", "run", run.RunID, "pgid", pgid, "error", err)
		} else if err != nil {
			slog.Info("reapOrphans: pgid gone", "run", run.RunID, "pgid", pgid)
		}
		if err := s.DB.FinishAssistantRun(ctx, run.RunID, db.RunFailed, -1, false, "", "daemon restarted", stamp(s.Now())); err != nil {
			slog.Error("reapOrphans: finish run", "run", run.RunID, "error", err)
		}
		if run.Kind == db.RunKindDM {
			s.deliverFailure(ctx, run, "daemon restarted", "")
		}
	}
	return nil
}

// enqueueDueTasks queries for active schedule/window_end tasks whose due_at
// has passed and which have no queued or running run, then inserts one queued
// assistant_runs row per task and binds that task's unconsumed messages to it.
// It also handles each_message tasks that have crossed their debounce window
// and are outside the 10-minute floor since last_run_started_at.
func (s *Service) enqueueDueTasks(ctx context.Context) error {
	now := s.Now()
	nowStr := stamp(now)

	tasks, err := s.DB.DueTasks(ctx, nowStr)
	if err != nil {
		return err
	}
	for _, task := range tasks {
		runID := ulid.Make().String()
		if err := s.DB.Transact(ctx, func(tx *db.DB) error {
			if err := tx.InsertAssistantRun(ctx, db.AssistantRun{
				RunID:    runID,
				Kind:     db.RunKindTask,
				TaskID:   sql.NullInt64{Int64: task.TaskID, Valid: true},
				State:    db.RunQueued,
				QueuedAt: nowStr,
			}); err != nil {
				return err
			}
			_, err := tx.BindUnconsumedToRun(ctx, task.TaskID, runID)
			return err
		}); err != nil {
			return err
		}
	}

	floorStr := stamp(now.Add(-eachMessageFloor))
	emTasks, err := s.DB.DueEachMessageTasks(ctx, nowStr, floorStr)
	if err != nil {
		return err
	}
	for _, task := range emTasks {
		runID := ulid.Make().String()
		if err := s.DB.Transact(ctx, func(tx *db.DB) error {
			if err := tx.InsertAssistantRun(ctx, db.AssistantRun{
				RunID:    runID,
				Kind:     db.RunKindTask,
				TaskID:   sql.NullInt64{Int64: task.TaskID, Valid: true},
				State:    db.RunQueued,
				QueuedAt: nowStr,
			}); err != nil {
				return err
			}
			if _, err := tx.BindUnconsumedToRun(ctx, task.TaskID, runID); err != nil {
				return err
			}
			return tx.ClearTaskDue(ctx, task.TaskID)
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
		run, ok, err := s.DB.OldestQueuedSpawnable(ctx)
		if err != nil || !ok {
			return err
		}
		// Hourly run cap: count runs started within the last hour.
		if s.Agent != nil && s.Agent.MaxRunsPerHour > 0 {
			since := stamp(s.Now().Add(-time.Hour))
			started, err := s.DB.CountStartedSince(ctx, since)
			if err != nil {
				return err
			}
			if started >= s.Agent.MaxRunsPerHour {
				// Log once per held run per tick.
				var msg string
				if run.Kind == db.RunKindTask {
					n, err := s.DB.CountTaskMessagesForRun(ctx, run.RunID)
					if err != nil {
						return err
					}
					msg = fmt.Sprintf("cap reached: run %s held (task %d, %d messages)", run.RunID, run.TaskID.Int64, n)
				} else {
					msg = fmt.Sprintf("cap reached: run %s held (dm)", run.RunID)
				}
				slog.Info(msg)
				return nil
			}
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
		cause := err.Error()
		s.deliverFailure(ctx, run, cause, "")
		return s.DB.FinishAssistantRun(ctx, run.RunID, db.RunFailed, -1, false, "", cause, stamp(s.Now()))
	}
	if err := s.DB.MarkRunning(ctx, run.RunID, st.handle.Pid, st.handle.Pgid, os.Getpid(), stamp(s.Now())); err != nil {
		st.handle.Kill()
		return err
	}
	if run.Kind == db.RunKindDM && run.RootTS.Valid {
		if err := s.DB.ClaimPendingOwnerMessages(ctx, run.RunID, run.RootTS.String); err != nil {
			slog.Warn("pending owner messages not claimed", "run", run.RunID, "error", err)
		}
	}
	if ack := st.req.AckTS; ack.Valid && strings.HasPrefix(ackText(st.thread, ack.String), queuedAckPrefix) {
		if _, err := s.Slack.UpdateMessage(ctx, st.req.ChannelID, ack.String, workingAck); err != nil {
			slog.Warn("queued ack not edited", "run", run.RunID, "error", err)
		}
	}
	s.handlesMu.Lock()
	s.handles[run.RunID] = st.handle
	s.handlesMu.Unlock()
	s.inflight.Go(func() {
		out := st.handle.Wait()
		s.handlesMu.Lock()
		delete(s.handles, run.RunID)
		s.handlesMu.Unlock()
		s.deliver(ctx, run, out)
	})
	return nil
}

// startedRun is a spawned agent with the data it needs for delivery.
type startedRun struct {
	handle *agent.Handle
	req    db.DMRequest     // dm runs: the request being answered
	thread []db.DMMessage   // dm runs: the request's dm_messages in ts order
	task   db.Task          // task runs: the task being run
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
		PendingProposal: req.PendingProposal.String,
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
