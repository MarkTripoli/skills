package github

import "testing"

func TestBranchNameConvertsGitHeadRefs(t *testing.T) {
	got, err := branchName("refs/heads/main")
	if err != nil || got != "main" {
		t.Fatalf("branchName() = %q, %v", got, err)
	}
	for _, ref := range []string{"main", "refs/tags/v1", "refs/remotes/origin/main", "refs/heads/"} {
		if _, err := branchName(ref); err == nil {
			t.Fatalf("branchName(%q) accepted invalid ref", ref)
		}
	}
}
