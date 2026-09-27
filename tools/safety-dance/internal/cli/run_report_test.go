package cli

import (
	"bytes"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
)

func TestRunReportCLIRequiresExactExistingRunAndPrintsProvenance(t *testing.T) {
	root := t.TempDir()
	t.Setenv("SD_HOME", root)
	p := paths.WithRoot(root)
	if err := p.EnsureDirs(); err != nil { t.Fatal(err) }
	d, err := db.Open(p.DB())
	if err != nil { t.Fatal(err) }
	if _, err := d.InsertRepoWithID("repo", t.TempDir(), "upstream", "main"); err != nil { t.Fatal(err) }
	run, err := d.InsertRun("repo", "main", "head", "base")
	if err != nil { t.Fatal(err) }
	if _, err := d.SQLForTests().Exec(`UPDATE runs SET safety_dance_version = 'v-test' WHERE id = ?`, run.ID); err != nil { t.Fatal(err) }
	if err := d.Close(); err != nil { t.Fatal(err) }

	cmd := NewRoot()
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetArgs([]string{"run-report", run.ID})
	if err := cmd.Execute(); err != nil { t.Fatal(err) }
	for _, want := range []string{`"id": "`+run.ID+`"`, `"status":`, `"safety_dance_version": "v-test"`, `"input_reported_invocations": 0`} {
		if !strings.Contains(out.String(), want) { t.Fatalf("report missing %q: %s", want, out.String()) }
	}
	cmd = NewRoot()
	cmd.SetArgs([]string{"run-report", "wrong-run-id"})
	if err := cmd.Execute(); err == nil || !strings.Contains(err.Error(), "not found") { t.Fatalf("mismatched ID error=%v", err) }
}
