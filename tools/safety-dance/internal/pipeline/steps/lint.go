package steps

import "context"

func Lint(ctx context.Context) error { return Validate(ctx, "lint") }
