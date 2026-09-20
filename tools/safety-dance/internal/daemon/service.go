package daemon

import (
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type ServiceExecutor interface {
	Run(name string, args ...string) error
}
type Service struct {
	Home     *paths.Paths
	Binary   string
	Executor ServiceExecutor
}

func (s Service) Label() string {
	return "com.safety-dance.daemon." + strings.NewReplacer("/", "-", "\\", "-", ".", "-").Replace(s.Home.Root())
}
func (s Service) Definition() (string, error) {
	if s.Home == nil {
		return "", fmt.Errorf("runtime home is required")
	}
	if s.Binary == "" {
		return "", fmt.Errorf("daemon binary is required")
	}
	switch runtime.GOOS {
	case "darwin":
		return fmt.Sprintf("<?xml version=\"1.0\"?><plist><dict><key>Label</key><string>%s</string><key>ProgramArguments</key><array><string>%s</string><string>daemon</string><string>serve</string></array><key>EnvironmentVariables</key><dict><key>SD_HOME</key><string>%s</string></dict><key>KeepAlive</key><true/></dict></plist>", s.Label(), s.Binary, s.Home.Root()), nil
	case "linux":
		return fmt.Sprintf("[Unit]\nDescription=Safety Dance daemon\n[Service]\nExecStart=%s daemon serve\nEnvironment=SD_HOME=%s\nRestart=on-failure\n", s.Binary, s.Home.Root()), nil
	default:
		return fmt.Sprintf("Safety Dance Task\nName=%s\nBinary=%s daemon serve\nSD_HOME=%s\n", s.Label(), filepath.Clean(s.Binary), s.Home.Root()), nil
	}
}
func (s Service) Validate() error {
	d, e := s.Definition()
	if e != nil {
		return e
	}
	if strings.TrimSpace(d) == "" {
		return fmt.Errorf("empty service definition")
	}
	return nil
}
func (s Service) definitionPath() (string, error) {
	if s.Home == nil {
		return "", fmt.Errorf("runtime home is required")
	}
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(s.Home.Root(), "safety-dance.plist"), nil
	case "linux":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, ".config", "systemd", "user", "safety-dance-"+strings.ReplaceAll(s.Home.Root(), "/", "-")+".service"), nil
	default:
		return "", nil
	}
}

// DefinitionExists reports whether this runtime home's managed definition was
// present before an install attempt.
func (s Service) DefinitionExists() bool {
	path, err := s.definitionPath()
	if err != nil || path == "" {
		return false
	}
	_, err = os.Stat(path)
	return err == nil
}

func (s Service) writeDefinition() error {
	path, err := s.definitionPath()
	if err != nil || path == "" {
		return err
	}
	definition, err := s.Definition()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".safety-dance-service-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.WriteString(definition); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func (s Service) Install() error {
	if s.Executor == nil {
		return fmt.Errorf("service executor is required")
	}
	if err := s.Validate(); err != nil {
		return err
	}
	path, err := s.definitionPath()
	if err != nil {
		return err
	}
	previous, readErr := os.ReadFile(path)
	existed := readErr == nil
	if readErr != nil && !os.IsNotExist(readErr) {
		return readErr
	}
	if err := s.writeDefinition(); err != nil {
		return fmt.Errorf("write service definition: %w", err)
	}
	var activationErr error
	switch runtime.GOOS {
	case "darwin":
		activationErr = s.Executor.Run("launchctl", "load", "-w", path)
	case "linux":
		activationErr = s.Executor.Run("systemctl", "--user", "enable", "--now", filepath.Base(path))
	default:
		action := fmt.Sprintf(`cmd /C "set SD_HOME=%s&& \"%s\" daemon serve"`, s.Home.Root(), s.Binary)
		activationErr = s.Executor.Run("schtasks", "/Create", "/TN", s.Label(), "/TR", action, "/F")
	}
	if activationErr == nil {
		return nil
	}
	if existed {
		_ = os.WriteFile(path, previous, 0o600)
	} else {
		_ = os.Remove(path)
	}
	return activationErr
}
func (s Service) Stop() error {
	if s.Executor == nil {
		return fmt.Errorf("service executor is required")
	}
	switch runtime.GOOS {
	case "darwin":
		path, _ := s.definitionPath()
		err := s.Executor.Run("launchctl", "unload", "-w", path)
		if err == nil {
			_ = os.Remove(path)
		}
		return err
	case "linux":
		path, _ := s.definitionPath()
		err := s.Executor.Run("systemctl", "--user", "disable", "--now", filepath.Base(path))
		if err == nil {
			_ = os.Remove(path)
		}
		return err
	default:
		return s.Executor.Run("schtasks", "/Delete", "/TN", s.Label(), "/F")
	}
}
