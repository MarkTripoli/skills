package policy

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/config"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"gopkg.in/yaml.v3"
)

type Bootstrap struct {
	Repository string            `yaml:"repository"`
	Revision   string            `yaml:"revision"`
	Policy     config.RepoConfig `yaml:"policy"`
}

func Store(p *paths.Paths, repository, revision string, policy *config.RepoConfig) error {
	if repository == "" || revision == "" || policy == nil {
		return errors.New("bootstrap policy requires repository, revision, and policy")
	}
	raw, err := yaml.Marshal(Bootstrap{Repository: repository, Revision: revision, Policy: *policy})
	if err != nil {
		return err
	}
	target := p.BootstrapConfigFile(repository)
	if err = os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(target), ".bootstrap-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err = tmp.Chmod(0600); err == nil {
		_, err = tmp.Write(raw)
	}
	if err == nil {
		err = tmp.Sync()
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(tmpName, target)
}
func Resolve(p *paths.Paths, repository, trustedRevision string, committed *config.RepoConfig) (*config.RepoConfig, error) {
	if strings.TrimSpace(repository) == "" || strings.TrimSpace(trustedRevision) == "" {
		return nil, errors.New("bootstrap policy requires repository and trusted revision")
	}
	if committed != nil {
		if err := os.MkdirAll(filepath.Dir(p.BootstrapRetiredFile(repository)), 0700); err != nil {
			return nil, fmt.Errorf("prepare bootstrap retirement: %w", err)
		}
		if err := os.WriteFile(p.BootstrapRetiredFile(repository), []byte(trustedRevision+"\n"), 0600); err != nil {
			return nil, fmt.Errorf("retire bootstrap policy: %w", err)
		}
		_ = os.Remove(p.BootstrapConfigFile(repository))
		return committed, nil
	}
	if _, err := os.Stat(p.BootstrapRetiredFile(repository)); err == nil {
		return nil, errors.New("bootstrap policy is permanently retired; commit .safety-dance.yaml on the default branch")
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	raw, err := os.ReadFile(p.BootstrapConfigFile(repository))
	if err != nil {
		return nil, fmt.Errorf("trusted repository configuration is not committed on the default branch: %w", err)
	}
	var b Bootstrap
	if err = yaml.Unmarshal(raw, &b); err != nil {
		return nil, fmt.Errorf("load wizard bootstrap configuration: %w", err)
	}
	if b.Repository != repository {
		return nil, errors.New("bootstrap policy belongs to another repository")
	}
	if b.Revision == "" || b.Revision != trustedRevision {
		return nil, errors.New("bootstrap policy is stale for the default branch revision")
	}
	return &b.Policy, nil
}
