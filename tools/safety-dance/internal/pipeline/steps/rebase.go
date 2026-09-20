package steps

import "context"

// Rebase is owned by the typed integration agent, never a pushed shell command.
func Rebase(ctx context.Context) error { return Typed(ctx, "rebase") }
