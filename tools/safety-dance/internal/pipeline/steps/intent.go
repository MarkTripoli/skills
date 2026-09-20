package steps

import (
	"context"
	"fmt"
)

func Intent(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return fmt.Errorf("intent validation implementation is not configured")
	}
}
