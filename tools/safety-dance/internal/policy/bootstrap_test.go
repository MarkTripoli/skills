package policy

import (
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/config"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"testing"
)

func TestBootstrapIsRepositoryAndRevisionBoundAndRetires(t *testing.T) {
	p := paths.WithRoot(t.TempDir())
	a := &config.RepoConfig{AllowRepoCommands: true}
	b := &config.RepoConfig{AllowRepoCommands: false}
	if err := Store(p, "repo-a", "rev-a", a); err != nil {
		t.Fatal(err)
	}
	if err := Store(p, "repo-b", "rev-b", b); err != nil {
		t.Fatal(err)
	}
	got, err := Resolve(p, "repo-a", "rev-a", nil)
	if err != nil || got.AllowRepoCommands != true {
		t.Fatalf("resolve a: %v", err)
	}
	if _, err = Resolve(p, "repo-b", "rev-a", nil); err == nil {
		t.Fatal("accepted wrong revision")
	}
	if _, err = Resolve(p, "repo-a", "rev-a", &config.RepoConfig{}); err != nil {
		t.Fatal(err)
	}
	if _, err = Resolve(p, "repo-a", "rev-a", nil); err == nil {
		t.Fatal("resurrected retired bootstrap")
	}
	if _, err = Resolve(p, "repo-b", "rev-b", nil); err != nil {
		t.Fatalf("repo b affected by a: %v", err)
	}
}
