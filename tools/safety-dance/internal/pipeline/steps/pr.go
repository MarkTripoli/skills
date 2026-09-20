package steps

import "context"

// PR performs the configured pull-request gate when one is configured.
func PR(ctx context.Context) error { return Validate(ctx, "pr") }
