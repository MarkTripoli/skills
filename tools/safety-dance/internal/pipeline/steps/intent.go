package steps

import "context"

func Intent(ctx context.Context) error { return Validate(ctx, "intent") }
