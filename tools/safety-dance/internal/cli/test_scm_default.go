//go:build !safety_dance_e2e

package cli

import "github.com/MarkTripoli/skills/tools/safety-dance/internal/scm"

func newTestSCMHost() scm.Host { return nil }
