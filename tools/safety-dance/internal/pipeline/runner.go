package pipeline

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
)

type StepName string

const (
	StepIntent      StepName = "intent"
	StepRebase      StepName = "rebase"
	StepReview      StepName = "review"
	StepTest        StepName = "test"
	StepDocument    StepName = "document"
	StepLint        StepName = "lint"
	StepPush        StepName = "push"
	StepPullRequest StepName = "pull-request"
	StepCI          StepName = "ci"
)

var CoreSteps = []StepName{StepIntent, StepRebase, StepReview, StepTest, StepDocument, StepLint, StepPush, StepPullRequest, StepCI}

type StepResult struct {
	Name   StepName
	Passed bool
	Err    error
}
type Step func(context.Context) error

// StepInputs are the trusted values that determine whether a completed result
// remains valid after restart. Empty values are intentional and are still
// included in the digest, so legacy rows never qualify for reuse.
type StepInputs struct {
	CandidateHead        string `json:"candidate_head"`
	Policy               string `json:"policy"`
	Command              string `json:"command"`
	Owner                string `json:"owner"`
	ValidationGeneration string `json:"validation_generation"`
}

func Fingerprint(name StepName, in StepInputs) string {
	v, _ := json.Marshal(struct {
		Name   StepName   `json:"step"`
		Inputs StepInputs `json:"inputs"`
	}{name, in})
	h := sha256.Sum256(v)
	return hex.EncodeToString(h[:])
}

type Runner struct {
	mu              sync.Mutex
	steps           map[StepName]Step
	inputs          map[StepName]StepInputs
	inputFuncs      map[StepName]func() StepInputs
	checkpointFuncs map[StepName]func() (string, error)
	Results         []StepResult
	Database        *db.DB
	RunID           string
	Order           []StepName
	Interactive     bool
}

func (r *Runner) SetInteractive(enabled bool) { r.Interactive = enabled }
func responseAllowed(step StepName, action types.ApprovalAction) bool {
	return types.ResponseAllowed(types.StepName(step), action)
}

func New() *Runner {
	return &Runner{steps: map[StepName]Step{}, inputs: map[StepName]StepInputs{}, inputFuncs: map[StepName]func() StepInputs{}, checkpointFuncs: map[StepName]func() (string, error){}, Order: append([]StepName(nil), CoreSteps...)}
}
func NewDurable(database *db.DB, runID string) *Runner {
	r := New()
	r.Database, r.RunID = database, runID
	return r
}
func (r *Runner) SetOrder(order []StepName)   { r.Order = append([]StepName(nil), order...) }
func (r *Runner) Register(n StepName, s Step) { r.RegisterWithInputs(n, StepInputs{}, s) }
func (r *Runner) RegisterWithInputs(n StepName, in StepInputs, s Step) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.steps[n] = s
	r.inputs[n] = in
	delete(r.inputFuncs, n)
}
func (r *Runner) RegisterWithInputsAndCheckpoint(n StepName, in StepInputs, s Step, checkpoint func() (string, error)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.steps[n] = s
	r.inputs[n] = in
	delete(r.inputFuncs, n)
	if checkpoint == nil {
		delete(r.checkpointFuncs, n)
	} else {
		r.checkpointFuncs[n] = checkpoint
	}
}
func (r *Runner) RegisterWithCheckpoint(n StepName, checkpoint func() (string, error)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.checkpointFuncs[n] = checkpoint
}
func (r *Runner) RegisterWithInputFunc(n StepName, in func() StepInputs, s Step) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.steps[n] = s
	r.inputFuncs[n] = in
	delete(r.inputs, n)
}

func (r *Runner) Run(ctx context.Context) ([]StepResult, error) {
	for _, n := range r.Order {
		select {
		case <-ctx.Done():
			return r.Results, ctx.Err()
		default:
		}
		r.mu.Lock()
		s := r.steps[n]
		in := r.inputs[n]
		inputFunc := r.inputFuncs[n]
		checkpointFunc := r.checkpointFuncs[n]
		r.mu.Unlock()
		if inputFunc != nil {
			in = inputFunc()
		}
		if s == nil {
			continue
		}
		var persisted *db.StepResult
		responseCompleted := false
		var err error
		if r.Database != nil && r.RunID != "" {
			rows, queryErr := r.Database.GetStepsByRun(r.RunID)
			if queryErr != nil {
				return r.Results, queryErr
			}
			for _, row := range rows {
				if row.StepName == types.StepName(n) {
					persisted = row
					break
				}
			}
			if persisted == nil {
				persisted, err = r.Database.InsertStepResult(r.RunID, types.StepName(n))
				if err != nil {
					return r.Results, err
				}
			}
			fingerprint := Fingerprint(n, in)
			if persisted.Status == types.StepStatusCompleted || persisted.Status == types.StepStatusSkipped {
				if persisted.InputFingerprint != nil && *persisted.InputFingerprint == fingerprint {
					continue
				}
				if err := r.Database.ResetStepsFrom(r.RunID, persisted.StepOrder); err != nil {
					return r.Results, err
				}
				persisted, err = r.Database.GetStepResult(persisted.ID)
				if err != nil {
					return r.Results, err
				}
			}
			if err := r.Database.SetStepInputFingerprint(persisted.ID, fingerprint); err != nil {
				return r.Results, err
			}
			if persisted.Status == types.StepStatusAwaitingApproval || persisted.Status == types.StepStatusFixReview {
				for {
					checkpoint := ""
					if checkpointFunc != nil {
						checkpoint, err = checkpointFunc()
						if err != nil {
							return r.Results, fmt.Errorf("checkpoint parked step %s: %w", n, err)
						}
					}
					response, responseErr := r.Database.ApplyResponse(r.RunID, string(n), persisted.ID, checkpoint, n == StepReview)
					if responseErr != nil {
						return r.Results, responseErr
					}
					if response != nil {
						action := types.ApprovalAction(response.Action)
						if !responseAllowed(n, action) {
							return r.Results, fmt.Errorf("response %s is not allowed for step %s", response.Action, n)
						}
						if action == types.ActionAbort {
							return r.Results, fmt.Errorf("step %s aborted by operator", n)
						}
						if action == types.ActionFix {
							persisted.Status = types.StepStatusFixing
							break
						}
						break
					}
					select {
					case <-ctx.Done():
						return r.Results, ctx.Err()
					case <-time.After(100 * time.Millisecond):
					}
				}
				if persisted.Status != types.StepStatusFixing {
					continue
				}
			}
			if err := r.Database.StartStep(persisted.ID); err != nil {
				return r.Results, err
			}
		}
		var sink *db.TypedEvidenceSink
		for {
			sink = db.NewTypedEvidenceSink()
			err = s(db.WithTypedEvidenceSink(ctx, sink))
			if persisted == nil || err == nil || !r.Interactive {
				break
			}
			findings := ""
			activity := "step failed: " + err.Error()
			if sink.Value != nil {
				findings = sink.Value.FindingsJSON
				if len(sink.Value.Evidence) > 0 {
					rawActivity, marshalErr := json.Marshal(struct {
						Kind  string   `json:"kind"`
						Items []string `json:"items"`
					}{Kind: "typed-evidence", Items: sink.Value.Evidence})
					if marshalErr != nil {
						return r.Results, fmt.Errorf("encode step evidence: %w", marshalErr)
					}
					activity = string(rawActivity)
				}
			}
			if parkErr := r.Database.ParkStepForApprovalWithActivity(r.RunID, persisted.ID, types.StepStatusAwaitingApproval, 1, 0, &findings, activity); parkErr != nil {
				return r.Results, parkErr
			}
			if awaitErr := r.Database.SetRunAwaitingAgent(r.RunID); awaitErr != nil {
				return r.Results, awaitErr
			}
			rerun := false
			for {
				checkpoint := ""
				if checkpointFunc != nil {
					checkpoint, err = checkpointFunc()
					if err != nil {
						return r.Results, fmt.Errorf("checkpoint response step %s: %w", n, err)
					}
				}
				response, responseErr := r.Database.ApplyResponse(r.RunID, string(n), persisted.ID, checkpoint, n == StepReview)
				if responseErr != nil {
					return r.Results, responseErr
				}
				if response == nil {
					select {
					case <-ctx.Done():
						return r.Results, ctx.Err()
					case <-time.After(100 * time.Millisecond):
					}
					continue
				}
				action := types.ApprovalAction(response.Action)
				if !responseAllowed(n, action) {
					return r.Results, fmt.Errorf("response %s is not allowed for step %s", response.Action, n)
				}
				_ = r.Database.ClearRunAwaitingAgent(r.RunID)
				if action == types.ActionAbort {
					return r.Results, fmt.Errorf("step %s aborted by operator", n)
				}
				if action == types.ActionFix {
					if startErr := r.Database.StartStepFixRound(persisted.ID, 0); startErr != nil {
						return r.Results, startErr
					}
					rerun = true
					break
				}
				responseCompleted = true
				err = nil
				break
			}
			if !rerun {
				break
			}
		}
		result := StepResult{n, err == nil, err}
		r.mu.Lock()
		r.Results = append(r.Results, result)
		r.mu.Unlock()
		if persisted != nil {
			checkpoint := ""
			if err == nil && checkpointFunc != nil && !responseCompleted {
				checkpoint, err = checkpointFunc()
				if err != nil {
					err = fmt.Errorf("checkpoint step %s: %w", n, err)
				}
			}
			findings := ""
			activity := "status: completed"
			if sink != nil && sink.Value != nil {
				findings = sink.Value.FindingsJSON
				if len(sink.Value.Evidence) > 0 {
					rawActivity, marshalErr := json.Marshal(struct {
						Kind  string   `json:"kind"`
						Items []string `json:"items"`
					}{Kind: "typed-evidence", Items: sink.Value.Evidence})
					if marshalErr != nil {
						return r.Results, fmt.Errorf("encode step evidence: %w", marshalErr)
					}
					activity = string(rawActivity)
				}
			}
			if err == nil && !responseCompleted {
				if persistErr := r.Database.CompleteStepWithRunHeadAndActivity(persisted.ID, r.RunID, checkpoint, findings, activity, n == StepReview); persistErr != nil {
					return r.Results, fmt.Errorf("persist step %s: %w", n, persistErr)
				}
			} else if err != nil {
				if persistErr := r.Database.FailStepWithActivity(persisted.ID, err.Error(), 0, activity); persistErr != nil {
					return r.Results, fmt.Errorf("persist step %s: %w", n, persistErr)
				}
			}
		}
		if err != nil {
			return r.Results, fmt.Errorf("step %s failed: %w", n, err)
		}
	}
	return r.Results, nil
}
