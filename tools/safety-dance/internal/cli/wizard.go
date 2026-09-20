package cli

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/config"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/daemon"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/gate"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/git"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/policy"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/wizard"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

type commandExecutor struct{}

func (commandExecutor) Run(name string, args ...string) error {
	return exec.Command(name, args...).Run()
}

func (commandExecutor) Output(name string, args ...string) ([]byte, error) {
	return exec.Command(name, args...).CombinedOutput()
}

func newWizard() *cobra.Command {
	return &cobra.Command{Use: "wizard", Short: "configure Safety Dance", RunE: runWizard}
}

func runWizard(cmd *cobra.Command, args []string) error {
	if err := nestedMutation(); err != nil {
		return err
	}
	p, database, err := openRuntime()
	if err != nil {
		return err
	}
	defer database.Close()
	root, err := gitRoot()
	if err != nil {
		return err
	}
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	executable, err = filepath.Abs(executable)
	if err != nil {
		return err
	}
	if info, statErr := os.Stat(executable); statErr != nil || info.IsDir() {
		return fmt.Errorf("safety-dance executable is not a file: %s", executable)
	}
	service := daemon.Service{Home: p, Binary: executable, Executor: commandExecutor{}}
	createdService := false
	originalOrigin, originErr := git.GetRemoteURL(context.Background(), root, "origin")
	hadOrigin := originErr == nil
	if originErr != nil && !strings.Contains(originErr.Error(), "No such remote") {
		return originErr
	}
	var gateRollback gate.Rollback
	configPath := filepath.Join(root, ".safety-dance.yaml")
	bootstrapPath := ""
	var originalBootstrap []byte
	var originalBootstrapMode os.FileMode
	bootstrapExisted := false
	configExisted := false
	var originalConfig []byte
	var originalConfigMode os.FileMode
	if info, statErr := os.Stat(configPath); statErr == nil {
		configExisted = true
		originalConfig, err = os.ReadFile(configPath)
		if err != nil {
			return err
		}
		originalConfigMode = info.Mode().Perm()
	}
	setup := wizard.Setup{
		In: cmd.InOrStdin(), Out: cmd.OutOrStdout(),
		Write: func(model wizard.Model) error {
			if model.Upstream != "" {
				if err := git.EnsureRemote(context.Background(), root, "origin", model.Upstream); err != nil {
					return err
				}
			}
			provider := strings.ToLower(strings.TrimSpace(model.Provider))
			if provider != "github" {
				return fmt.Errorf("unsupported provider %q", model.Provider)
			}
			gateChoice := strings.TrimSpace(model.Gate)
			if gateChoice == "" || gateChoice == "default" {
				gateChoice = p.ReposDir()
			} else if !filepath.IsAbs(gateChoice) {
				return errors.New("gate must be default or an absolute directory")
			}
			if len(model.ValidationCommands) != 8 {
				return errors.New("eight validation commands are required")
			}
			commands := config.Commands{Prepare: model.ValidationCommands[0], Rebase: model.ValidationCommands[1], Review: model.ValidationCommands[2], Test: model.ValidationCommands[3], Format: model.ValidationCommands[4], Lint: model.ValidationCommands[5], PullRequest: model.ValidationCommands[6], CI: model.ValidationCommands[7]}
			for _, command := range model.ValidationCommands {
				if strings.TrimSpace(command) == "" {
					return errors.New("validation commands cannot be empty")
				}
			}
			content, marshalErr := yaml.Marshal(struct {
				Commands          config.Commands `yaml:"commands"`
				AllowRepoCommands bool            `yaml:"allow_repo_commands"`
				Provider          string          `yaml:"provider"`
				Gate              string          `yaml:"gate"`
			}{Commands: commands, AllowRepoCommands: true, Provider: provider, Gate: gateChoice})
			if marshalErr != nil {
				return marshalErr
			}
			if _, parseErr := config.LoadRepoFromBytes(content); parseErr != nil {
				return fmt.Errorf("validate generated configuration: %w", parseErr)
			}
			if err := os.WriteFile(configPath, content, 0600); err != nil {
				return err
			}
			if configExisted {
				_ = os.Chmod(configPath, originalConfigMode)
			}
			_, _, rollback, err := gate.InitWithRollback(context.Background(), database, p, root)
			gateRollback = rollback
			if err != nil {
				return err
			}
			repo, repoErr := database.GetRepoByPath(root)
			if repoErr != nil || repo == nil {
				if repoErr != nil {
					return repoErr
				}
				return errors.New("wizard repository was not registered")
			}
			bootstrapPath = p.BootstrapConfigFile(repo.ID)
			if info, statErr := os.Stat(bootstrapPath); statErr == nil {
				bootstrapExisted = true
				originalBootstrap, err = os.ReadFile(bootstrapPath)
				if err != nil {
					return err
				}
				originalBootstrapMode = info.Mode().Perm()
			} else if !os.IsNotExist(statErr) {
				return statErr
			}
			if _, fetchErr := git.Run(context.Background(), root, "fetch", "--no-tags", "origin", "refs/heads/"+repo.DefaultBranch); fetchErr != nil {
				return fmt.Errorf("fetch trusted default branch: %w", fetchErr)
			}
			initialRevision, revErr := git.Run(context.Background(), root, "rev-parse", "FETCH_HEAD")
			if revErr != nil {
				return revErr
			}
			parsed, parseErr := config.LoadRepoFromBytes(content)
			if parseErr != nil {
				return parseErr
			}
			if gateChoice != p.ReposDir() {
				defaultGate := p.RepoDir(repo.ID)
				customGate := filepath.Join(gateChoice, repo.ID+".git")
				if err := os.MkdirAll(filepath.Dir(customGate), 0700); err != nil {
					return err
				}
				if _, statErr := os.Stat(customGate); statErr == nil {
					target, linkErr := os.Readlink(defaultGate)
					if linkErr != nil || filepath.Clean(target) != filepath.Clean(customGate) {
						return fmt.Errorf("custom gate already exists: %s", customGate)
					}
					return policy.Store(p, repo.ID, strings.TrimSpace(initialRevision), parsed)
				} else if !os.IsNotExist(statErr) {
					return statErr
				}
				if info, err := os.Lstat(defaultGate); err == nil && info.Mode()&os.ModeSymlink != 0 {
					if err := os.Remove(defaultGate); err != nil {
						return err
					}
				}
				if err := os.Rename(defaultGate, customGate); err != nil {
					return fmt.Errorf("move gate to selected location: %w", err)
				}
				if err := os.Symlink(customGate, defaultGate); err != nil {
					_ = os.Rename(customGate, defaultGate)
					return fmt.Errorf("link selected gate location: %w", err)
				}
			}
			return policy.Store(p, repo.ID, strings.TrimSpace(initialRevision), parsed)
		},
		Compensate: func(model wizard.Model) error {
			var first error
			if gateRollback != nil {
				if err := gateRollback(); err != nil {
					first = err
				}
			}
			if configExisted {
				if err := os.WriteFile(configPath, originalConfig, originalConfigMode); err != nil {
					return err
				}
			} else {
				_ = os.Remove(configPath)
			}
			if bootstrapPath != "" {
				if bootstrapExisted {
					if err := os.WriteFile(bootstrapPath, originalBootstrap, originalBootstrapMode); err != nil && first == nil {
						first = err
					}
				} else if err := os.Remove(bootstrapPath); err != nil && !os.IsNotExist(err) && first == nil {
					first = err
				}
			}
			var restore error
			if hadOrigin {
				restore = git.EnsureRemote(context.Background(), root, "origin", originalOrigin)
			} else {
				restore = git.RemoveRemote(context.Background(), root, "origin")
			}
			if first != nil {
				return errors.Join(first, restore)
			}
			return restore
		},
		InstallService: func() error { createdService = !service.DefinitionExists(); return service.Install() },
		StopService:    func() error { return service.Stop() }, ServiceCreated: func() bool { return createdService },
		AskService: true, PromptLabels: []string{"upstream", "gate", "provider", "commands"},
	}
	if err := setup.Run(context.Background()); err != nil {
		return err
	}
	fmt.Fprintln(cmd.OutOrStdout(), "Safety Dance is configured")
	return nil
}
