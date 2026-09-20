package steps

import (
	"context"
	"fmt"
)

func Test(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return fmt.Errorf("test validation implementation is not configured")
	}
}
