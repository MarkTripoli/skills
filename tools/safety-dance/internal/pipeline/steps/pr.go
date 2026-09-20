package steps

import "context"

// PR is owned by the typed SCM/provider boundary, never a pushed shell command.
func PR(ctx context.Context) error { return Typed(ctx, "pull-request") }
