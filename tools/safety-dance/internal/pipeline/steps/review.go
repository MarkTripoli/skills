package steps

import (
	"context"
	"fmt"
)

func Review(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return fmt.Errorf("review gate is unavailable: configured agent owner is not connected")
}
