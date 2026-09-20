package daemon

import (
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
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

func (s Service) Install() error {
	if s.Executor == nil {
		return fmt.Errorf("service executor is required")
	}
	if err := s.Validate(); err != nil {
		return err
	}
	if err := s.Validate(); err != nil {
		return err
	}
	switch runtime.GOOS {
	case "darwin":
		return s.Executor.Run("launchctl", "load", "-w", filepath.Join(s.Home.Root(), "safety-dance.plist"))
	case "linux":
		return s.Executor.Run("systemctl", "--user", "enable", "--now", "safety-dance-"+strings.ReplaceAll(s.Home.Root(), "/", "-")+".service")
	default:
		return s.Executor.Run("schtasks", "/Create", "/TN", s.Label(), "/TR", s.Binary+" daemon serve", "/F")
	}
}
func (s Service) Stop() error {
	if s.Executor == nil {
		return fmt.Errorf("service executor is required")
	}
	switch runtime.GOOS {
	case "darwin":
		return s.Executor.Run("launchctl", "unload", "-w", filepath.Join(s.Home.Root(), "safety-dance.plist"))
	case "linux":
		return s.Executor.Run("systemctl", "--user", "disable", "--now", "safety-dance-"+strings.ReplaceAll(s.Home.Root(), "/", "-")+".service")
	default:
		return s.Executor.Run("schtasks", "/End", "/TN", s.Label())
	}
}
