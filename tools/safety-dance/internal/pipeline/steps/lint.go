package steps

import (
	"context"
	"fmt"
)

func Lint(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return fmt.Errorf("lint validation implementation is not configured")
	}
}
