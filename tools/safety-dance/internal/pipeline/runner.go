package pipeline

import (
	"context"
	"fmt"
	"sync"
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
type Runner struct {
	mu      sync.Mutex
	steps   map[StepName]Step
	Results []StepResult
}

func New() *Runner                            { return &Runner{steps: map[StepName]Step{}} }
func (r *Runner) Register(n StepName, s Step) { r.mu.Lock(); defer r.mu.Unlock(); r.steps[n] = s }
func (r *Runner) Run(ctx context.Context) ([]StepResult, error) {
	for _, n := range CoreSteps {
		select {
		case <-ctx.Done():
			return r.Results, ctx.Err()
		default:
		}
		r.mu.Lock()
		s := r.steps[n]
		r.mu.Unlock()
		if s == nil {
			continue
		}
		e := s(ctx)
		r.Results = append(r.Results, StepResult{n, e == nil, e})
		if e != nil {
			return r.Results, fmt.Errorf("step %s failed: %w", n, e)
		}
	}
	return r.Results, nil
}
