package steps

import "context"

func PR(ctx context.Context) error { return Validate(ctx, "pull-request") }
