package steps

import "context"

// CI is owned by the typed SCM/provider boundary, never a pushed shell command.
func CI(ctx context.Context) error { return Typed(ctx, "ci") }
