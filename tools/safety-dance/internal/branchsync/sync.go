package branchsync

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

type Ref struct {
	Name string
	Head string
}
type Syncer struct {
	Remote string
	Ref    string
}

func (s Syncer) LiveHead(ctx context.Context) (string, error) {
	if s.Remote == "" || s.Ref == "" {
		return "", fmt.Errorf("remote and ref required")
	}
	out, err := exec.CommandContext(ctx, "git", "ls-remote", s.Remote, s.Ref).Output()
	if err != nil {
		return "", err
	}
	f := strings.Fields(string(out))
	if len(f) < 1 {
		return "", nil
	}
	return f[0], nil
}
func (s Syncer) Verify(ctx context.Context, expected string) error {
	head, err := s.LiveHead(ctx)
	if err != nil {
		return err
	}
	if head != expected {
		return fmt.Errorf("stale upstream head: expected %s, got %s", expected, head)
	}
	return nil
}
