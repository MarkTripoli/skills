package watch

import (
	"context"
	"crypto/rand"
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
	var deliveryErr error
	err := r.Store.withCheckpoint(func(s *State, checkpoint func() error) error {
		if d := s.DeliveryIntent; d != nil {
			return fmt.Errorf("delivery intent %s has unresolved %s outcome; inspect status and reconcile using attach, detach or owner ack", d.ID, d.Phase)
		}
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
		var turnID string
		if s.ThreadID != "" {
			var err error
			turnID, err = r.Codex.ActiveTurn(ctx, s.ThreadID)
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
				keys = unsent
				if len(keys) == 0 {
					return nil
				}
			}
		}
		var nonce [16]byte
		if _, err := rand.Read(nonce[:]); err != nil {
			return err
		}
		d := &DeliveryIntent{
			ID: fmt.Sprintf("bug-coordinator-%x", nonce), Keys: keys,
			Phase: "thread-start", CreatedAt: now,
		}
		previousThread := s.ThreadID
		previous := make([]Event, len(keys))
		for i, key := range keys {
			previous[i] = s.Pending[key]
		}
		if turnID != "" {
			d.Phase = "steer"
			d.ThreadID = s.ThreadID
		}
		s.DeliveryIntent = d
		r.markNotified(s, keys, d.ThreadID, now)
		if err := checkpoint(); err != nil {
			return err
		}
		message := fmt.Sprintf("Bug coordinator notification intent %s.\n", d.ID)
		var err error
		if turnID != "" {
			err = r.Codex.Steer(ctx, d.ThreadID, turnID, message+r.activePrompt(keys))
		} else {
			var threadID string
			threadID, err = r.Codex.StartThread(ctx, r.Workspace)
			if err == nil && threadID == "" {
				err = fmt.Errorf("Codex returned no thread ID")
			}
			if err == nil {
				s.ThreadID = threadID
				d.ThreadID = threadID
				d.Phase = "turn-start"
				for _, key := range keys {
					e := s.Pending[key]
					e.NotifiedThread = threadID
					s.Pending[key] = e
				}
				// The identity, nonce, attempts and timestamp reach durable storage
				// before an external owner can run or acknowledge these keys.
				if err := checkpoint(); err != nil {
					return err
				}
				err = r.Codex.StartTurn(ctx, threadID, d.ID, message+r.newPrompt(keys))
			}
		}
		if err != nil {
			deliveryErr = err
			if hasNoEffect(err) {
				for i, key := range keys {
					s.Pending[key] = previous[i]
				}
				s.ThreadID = previousThread
				s.DeliveryIntent = nil
			} else {
				d.LastError = err.Error()
			}
			// Save the outcome instead of returning an error that discards it.
			return nil
		}
		s.DeliveryIntent = nil
		result = "started"
		if turnID != "" {
			result = "steered"
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	return result, deliveryErr
}

func (r Runner) activePrompt(keys []string) string {
	return fmt.Sprintf(`Bug coordinator found eligible Bugs under %s: %s. At the next safe orchestration point, use Jira MCP to confirm each Bug, reconcile its dependencies and existing work, and add it to the epic ledger. Do not change a worker's current assignment or take its runtime lease. After recording each disposition in the ledger, acknowledge the key using the %s executable with epic %s, thread $CODEX_THREAD_ID, and state directory %s. The watcher notification is discovery, not ticket authority.`, r.Store.Epic, strings.Join(keys, ", "), r.BinPath, r.Store.Epic, r.Store.Dir)
}

func (r Runner) newPrompt(keys []string) string {
	return fmt.Sprintf(`Read and follow %s. Start a fresh video-iterative-orchestration session for Jira epic %s and discovered Bugs %s. Read the existing epic ledger and immutable task receipts and reconcile Jira, Git worktrees, branches, PRs, and any pre-existing optional coordination before dispatch. Recover recorded owner authority, runtime ownership and per-Bug plan approval gates; this notification grants no new implementation or external-action authority. Jira MCP is authoritative for Bug contents and membership; this watcher only discovered keys. After recording each Bug's accepted or excluded disposition in the ledger, acknowledge it using the %s executable with epic %s, thread $CODEX_THREAD_ID, and state directory %s. Keep existing runtime ownership and do not duplicate active ticket work.`, r.SkillFile, r.Store.Epic, strings.Join(keys, ", "), r.BinPath, r.Store.Epic, r.Store.Dir)
}
