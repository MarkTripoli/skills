package steps

import (
	"context"
	"fmt"
)

func Rebase(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return fmt.Errorf("rebase validation implementation is not configured")
	}
}
