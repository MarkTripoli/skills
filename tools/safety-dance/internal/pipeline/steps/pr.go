package steps

import (
	"context"
	"fmt"
)

func PR(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return fmt.Errorf("pr validation implementation is not configured")
	}
}
