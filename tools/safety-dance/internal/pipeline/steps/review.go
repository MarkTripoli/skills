package steps

import "context"

// Review is owned by the typed review agent, never a pushed shell command.
func Review(ctx context.Context) error { return Typed(ctx, "review") }
