package steps

import "context"

func CI(ctx context.Context) error { return Validate(ctx, "ci") }
