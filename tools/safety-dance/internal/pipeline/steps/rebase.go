package steps

import "context"

// Rebase performs the repository's configured rebase gate. The daemon binds
// the owned worktree and trusted policy to the context before invoking it.
func Rebase(ctx context.Context) error { return Validate(ctx, "rebase") }
