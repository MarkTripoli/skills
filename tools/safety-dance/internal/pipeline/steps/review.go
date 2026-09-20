package steps

import "context"

func Review(ctx context.Context) error { return Validate(ctx, "review") }
