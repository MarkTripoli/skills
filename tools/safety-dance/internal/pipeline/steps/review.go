package steps

import "context"

// Review performs the configured review gate in the run-owned worktree.
func Review(ctx context.Context) error { return Validate(ctx, "review") }
