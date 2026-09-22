package main

import (
	"os"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/cli"
)

func main() { os.Exit(cli.Execute()) }
