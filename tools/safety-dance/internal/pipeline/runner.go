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
	mu         sync.Mutex
	steps      map[StepName]Step
	inputs     map[StepName]StepInputs
	inputFuncs map[StepName]func() StepInputs
	Results    []StepResult
	Database   *db.DB
	RunID      string
}

func New() *Runner {
	return &Runner{steps: map[StepName]Step{}, inputs: map[StepName]StepInputs{}, inputFuncs: map[StepName]func() StepInputs{}}
}
func NewDurable(database *db.DB, runID string) *Runner {
	r := New()
	r.Database, r.RunID = database, runID
	return r
}
func (r *Runner) Register(n StepName, s Step) { r.RegisterWithInputs(n, StepInputs{}, s) }
func (r *Runner) RegisterWithInputs(n StepName, in StepInputs, s Step) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.steps[n] = s
	r.inputs[n] = in
	delete(r.inputFuncs, n)
}
func (r *Runner) RegisterWithInputFunc(n StepName, in func() StepInputs, s Step) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.steps[n] = s
	r.inputFuncs[n] = in
	delete(r.inputs, n)
}
func (r *Runner) Run(ctx context.Context) ([]StepResult, error) {
	for _, n := range CoreSteps {
		select {
		case <-ctx.Done():
			return r.Results, ctx.Err()
		default:
		}
		r.mu.Lock()
		s := r.steps[n]
		in := r.inputs[n]
		inputFunc := r.inputFuncs[n]
		r.mu.Unlock()
		if inputFunc != nil {
			in = inputFunc()
		}
		if s == nil {
			continue
		}
		var persisted *db.StepResult
		if r.Database != nil && r.RunID != "" {
			rows, err := r.Database.GetStepsByRun(r.RunID)
			if err != nil {
				return r.Results, err
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
					response, responseErr := r.Database.ConsumeResponse(r.RunID, string(n))
					if responseErr != nil {
						return r.Results, responseErr
					}
					if response != nil {
						if response.Action == string(types.ActionAbort) {
							return r.Results, fmt.Errorf("step %s aborted by operator", n)
						}
						if response.Action == string(types.ActionSkip) {
							if err := r.Database.CompleteSkippedStep(persisted.ID, 0, 0, "", "operator skip"); err != nil {
								return r.Results, err
							}
							break
						}
						if err := r.Database.CompleteStep(persisted.ID, 0, 0, ""); err != nil {
							return r.Results, err
						}
						break
					}
					select {
					case <-ctx.Done():
						return r.Results, ctx.Err()
					case <-time.After(100 * time.Millisecond):
					}
				}
				continue
			}
			if err := r.Database.StartStep(persisted.ID); err != nil {
				return r.Results, err
			}
		}
		err := s(ctx)
		result := StepResult{n, err == nil, err}
		r.mu.Lock()
		r.Results = append(r.Results, result)
		r.mu.Unlock()
		if persisted != nil {
			var persistErr error
			if err != nil {
				persistErr = r.Database.FailStep(persisted.ID, err.Error(), 0)
			} else {
				persistErr = r.Database.CompleteStep(persisted.ID, 0, 0, "")
			}
			if persistErr != nil {
				return r.Results, fmt.Errorf("persist step %s: %w", n, persistErr)
			}
		}
		if err != nil {
			return r.Results, fmt.Errorf("step %s failed: %w", n, err)
		}
	}
	return r.Results, nil
}
