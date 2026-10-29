package watch

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type BugSource interface {
	ScanBugs(context.Context, string) (BugScan, error)
}

type Runner struct {
	Store           Store
	Jira            BugSource
	Codex           Codex
	Workspace       string
	SkillFile       string
	BinPath         string
	IncludeExisting bool
	Now             func() time.Time
}

const retryDelay = time.Hour
const maxNotifications = 2

func (r Runner) deliverable(e Event, now time.Time) bool {
	return e.Attempts == 0 || (e.Attempts < maxNotifications && !e.LastNotified.IsZero() && !now.Before(e.LastNotified.Add(retryDelay)))
}

func (r Runner) markNotified(s *State, keys []string, threadID string, now time.Time) {
	for _, key := range keys {
		e := s.Pending[key]
		e.NotifiedThread = threadID
		e.LastNotified = now
		e.Attempts++
		s.Pending[key] = e
	}
}

func (r Runner) now() time.Time {
	if r.Now != nil {
		return r.Now()
	}
	return time.Now().UTC()
}

func (r Runner) PollOnce(ctx context.Context) (int, error) {
	scan, err := r.Jira.ScanBugs(ctx, r.Store.Epic)
	if err != nil {
		_ = r.Store.With(func(s *State) error { s.LastError = err.Error(); return nil })
		return 0, err
	}
	var added int
	err = r.Store.With(func(s *State) error {
		var err error
		if r.IncludeExisting && !s.Initialized {
			s.Initialized = true
		}
		added, err = s.Observe(scan.Eligible, scan.OnHold, r.now())
		return err
	})
	return added, err
}

func (r Runner) DeliverOnce(ctx context.Context) (string, error) {
	result := "none"
	err := r.Store.With(func(s *State) error {
		now := r.now()
		var keys []string
		for _, key := range s.PendingKeys() {
			if r.deliverable(s.Pending[key], now) {
				keys = append(keys, key)
			}
		}
		if len(keys) == 0 {
			return nil
		}
		if s.ThreadID != "" {
			turnID, err := r.Codex.ActiveTurn(ctx, s.ThreadID)
			if err != nil {
				return err
			}
			if turnID != "" {
				var unsent []string
				for _, key := range keys {
					if s.Pending[key].NotifiedThread != s.ThreadID {
						unsent = append(unsent, key)
					}
				}
				if len(unsent) == 0 {
					return nil
				}
				if err := r.Codex.Steer(ctx, s.ThreadID, turnID, r.activePrompt(unsent)); err != nil {
					return err
				}
				r.markNotified(s, unsent, s.ThreadID, now)
				result = "steered"
				return nil
			}
		}
		threadID, err := r.Codex.Start(ctx, r.Workspace, r.newPrompt(keys))
		if err != nil {
			return err
		}
		s.ThreadID = threadID
		r.markNotified(s, keys, threadID, now)
		result = "started"
		return nil
	})
	return result, err
}

func (r Runner) activePrompt(keys []string) string {
	return fmt.Sprintf(`Bug coordinator found eligible Bugs under %s: %s. At the next safe orchestration point, use Jira MCP to confirm each Bug, reconcile its dependencies and existing work, and add it to the epic ledger. Do not change a worker's current assignment or take its runtime lease. After recording each disposition in the ledger, acknowledge the key using the %s executable with epic %s, thread $CODEX_THREAD_ID, and state directory %s. The watcher notification is discovery, not ticket authority.`, r.Store.Epic, strings.Join(keys, ", "), r.BinPath, r.Store.Epic, r.Store.Dir)
}

func (r Runner) newPrompt(keys []string) string {
	return fmt.Sprintf(`Read and follow %s. Start a fresh video-iterative-orchestration session for Jira epic %s and discovered Bugs %s. Read the existing epic ledger and immutable task receipts and reconcile Jira, Git worktrees, branches, PRs, and any pre-existing optional coordination before dispatch. Recover recorded owner authority, runtime ownership and per-Bug plan approval gates; this notification grants no new implementation or external-action authority. Jira MCP is authoritative for Bug contents and membership; this watcher only discovered keys. After recording each Bug's accepted or excluded disposition in the ledger, acknowledge it using the %s executable with epic %s, thread $CODEX_THREAD_ID, and state directory %s. Keep existing runtime ownership and do not duplicate active ticket work.`, r.SkillFile, r.Store.Epic, strings.Join(keys, ", "), r.BinPath, r.Store.Epic, r.Store.Dir)
}
