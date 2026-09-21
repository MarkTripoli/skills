//go:build !safety_dance_e2e

package cli

func skipRunCleanup() bool { return false }
