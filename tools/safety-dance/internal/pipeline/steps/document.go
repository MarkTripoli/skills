package steps

import (
	"context"
	"fmt"
)

func Document(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return fmt.Errorf("document validation implementation is not configured")
	}
}
