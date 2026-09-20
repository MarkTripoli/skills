package steps

import (
	"context"
	"fmt"
)

func CI(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return fmt.Errorf("ci gate is unavailable: configured CI owner is not connected")
}
