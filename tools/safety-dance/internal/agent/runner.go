package agent

import (
	"context"
	"fmt"
	"os/exec"
)

type Request struct {
	Command     []string
	WorkDir     string
	ParentRunID string
}
type Runner struct{ MaxAttempts int }

func (r Runner) Run(ctx context.Context, req Request) (Result, error) {
	if len(req.Command) == 0 {
		return Result{}, fmt.Errorf("empty agent command")
	}
	max := r.MaxAttempts
	if max < 1 {
		max = 1
	}
	for i := 1; i <= max; i++ {
		cmd := exec.CommandContext(ctx, req.Command[0], req.Command[1:]...)
		cmd.Dir = req.WorkDir
		out, err := cmd.CombinedOutput()
		res := Result{Text: string(out)}
		if err == nil {
			return res, nil
		}
		if i == max {
			return res, err
		}
	}
	return Result{}, ctx.Err()
}
