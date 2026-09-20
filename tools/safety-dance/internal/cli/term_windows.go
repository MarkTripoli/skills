//go:build windows

package cli

import "os"

func terminationSignal() os.Signal { return os.Interrupt }
