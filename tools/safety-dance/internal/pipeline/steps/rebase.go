package steps

import "context"

func Rebase(ctx context.Context) error { return Validate(ctx, "rebase") }
