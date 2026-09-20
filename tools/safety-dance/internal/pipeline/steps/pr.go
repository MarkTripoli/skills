package steps

import (
	"context"
	"fmt"
)

func PR(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return fmt.Errorf("pull-request gate is unavailable: configured provider owner is not connected")
}
