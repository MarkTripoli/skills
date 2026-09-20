package steps

import "context"

func Test(ctx context.Context) error { return Validate(ctx, "test") }
