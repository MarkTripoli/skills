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
	createdGate := false
	configPath := filepath.Join(root, ".safety-dance.yaml")
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
				Commands config.Commands `yaml:"commands"`
			}{Commands: commands})
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
			_, created, err := gate.Init(context.Background(), database, p, root)
			createdGate = created
			return err
		},
		Compensate: func(model wizard.Model) error {
			var first error
			if createdGate {
				if _, err := gate.Eject(context.Background(), database, p, root); err != nil {
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
		AskService: true, PromptLabels: []string{"upstream", "commands"},
	}
	if err := setup.Run(context.Background()); err != nil {
		return err
	}
	fmt.Fprintln(cmd.OutOrStdout(), "Safety Dance is configured")
	return nil
}
