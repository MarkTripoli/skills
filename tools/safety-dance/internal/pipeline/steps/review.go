package steps

import (
	"context"
	"fmt"
)

func Review(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return fmt.Errorf("review validation implementation is not configured")
	}
}
