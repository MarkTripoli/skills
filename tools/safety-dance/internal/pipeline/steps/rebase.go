package steps

import (
	"context"
	"fmt"
)

func Rebase(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return fmt.Errorf("rebase gate is unavailable: configured rebase owner is not connected")
}
