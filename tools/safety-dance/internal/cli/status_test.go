package cli

import (
	"bytes"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"github.com/spf13/cobra"
)

func TestStatusIncludesTerminalBranchesAlongsideActiveRuns(t *testing.T) {
	root := t.TempDir()
	t.Setenv("SD_HOME", root)
	p := paths.WithRoot(root)
	if err := p.EnsureDirs(); err != nil {
		t.Fatal(err)
	}
	d, err := db.Open(p.DB())
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	repo, err := d.InsertRepoWithID("repo", t.TempDir(), "upstream", "main")
	if err != nil {
		t.Fatal(err)
	}
	active, err := d.InsertRun(repo.ID, "active", "head-a", "base")
	if err != nil {
		t.Fatal(err)
	}
	if err := d.UpdateRunStatus(active.ID, types.RunRunning); err != nil {
		t.Fatal(err)
	}
	terminal, err := d.InsertRun(repo.ID, "terminal", "head-t", "base")
	if err != nil {
		t.Fatal(err)
	}
	if err := d.UpdateRunErrorStatus(terminal.ID, "failed", types.RunFailed); err != nil {
		t.Fatal(err)
	}

	cmd := &cobra.Command{}
	var out bytes.Buffer
	cmd.SetOut(&out)
	if err := statusCommand(cmd, nil); err != nil {
		t.Fatal(err)
	}
	text := out.String()
	for _, want := range []string{"branch=active status=running", "branch=terminal status=failed"} {
		if !strings.Contains(text, want) {
			t.Fatalf("status output missing %q: %s", want, text)
		}
	}
}
