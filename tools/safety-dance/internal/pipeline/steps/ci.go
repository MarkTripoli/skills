package steps

import "context"

// CI performs the configured CI gate when one is configured.
func CI(ctx context.Context) error { return Validate(ctx, "ci") }
