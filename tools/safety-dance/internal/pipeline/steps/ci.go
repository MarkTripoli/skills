package steps

import (
	"context"
	"fmt"
)

func CI(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return fmt.Errorf("ci validation implementation is not configured")
	}
}
