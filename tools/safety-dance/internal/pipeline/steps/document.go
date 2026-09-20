package steps

import "context"

func Document(ctx context.Context) error { return Validate(ctx, "document") }
