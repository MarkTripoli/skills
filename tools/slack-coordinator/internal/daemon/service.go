package daemon

import (
	"errors"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
)

// serviceMarker tags every definition this package writes. Install and
// Uninstall refuse a file at the definition path that lacks it.
const serviceMarker = "SLACK_COORDINATOR_MANAGED"

// serviceLabel is the launchd label and the systemd unit's base name.
const serviceLabel = "com.marktripoli.slack-coordinator"

// ErrUnsupportedPlatform is returned for any GOOS other than darwin or linux.
var ErrUnsupportedPlatform = errors.New("unsupported platform: service supervision needs launchd (darwin) or systemd (linux)")

// ServiceExecutor runs a service-manager command (launchctl, systemctl).
type ServiceExecutor interface {
	Run(name string, args ...string) error
}

// Service is the per-user supervisor entry for one daemon: a launchd agent on
// darwin or a systemd user unit on linux. The supervisor starts
// `<Binary> daemon serve` at login and restarts it after exit.
type Service struct {
	Home     *paths.Paths
	Binary   string
	Executor ServiceExecutor
	// GOOS selects the definition format; empty means runtime.GOOS. Tests set
	// it so both platforms are covered on one host.
	GOOS string
}

func (s Service) goos() string {
	if s.GOOS != "" {
		return s.GOOS
	}
	return runtime.GOOS
}

// Label is the launchd label; the systemd unit is Label()+".service".
func (s Service) Label() string { return serviceLabel }

func (s Service) unitName() string { return s.Label() + ".service" }

// Definition renders the supervisor file for GOOS.
func (s Service) Definition() (string, error) {
	if s.Home == nil {
		return "", errors.New("runtime home is required")
	}
	if s.Binary == "" {
		return "", errors.New("daemon binary is required")
	}
	switch s.goos() {
	case "darwin":
		esc := html.EscapeString
		return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- %s -->
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>%s</string>
	<key>ProgramArguments</key>
	<array>
		<string>%s</string>
		<string>daemon</string>
		<string>serve</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>%s</key>
		<string>%s</string>
	</dict>
	<key>StandardOutPath</key>
	<string>%s</string>
	<key>StandardErrorPath</key>
	<string>%s</string>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
</dict>
</plist>
`, serviceMarker, esc(s.Label()), esc(s.Binary), paths.EnvHome, esc(s.Home.Root()), esc(s.Home.DaemonLog()), esc(s.Home.DaemonLog())), nil
	case "linux":
		return fmt.Sprintf(`# %s
[Unit]
Description=slack-coordinator daemon

[Service]
ExecStart=%s daemon serve
Environment=%s
StandardOutput=append:%s
StandardError=append:%s
Restart=on-failure

[Install]
WantedBy=default.target
`, serviceMarker, strconv.Quote(s.Binary), strconv.Quote(paths.EnvHome+"="+s.Home.Root()), s.Home.DaemonLog(), s.Home.DaemonLog()), nil
	default:
		return "", ErrUnsupportedPlatform
	}
}

// DefinitionPath is where Install writes the definition: the runtime home on
// darwin, the systemd user unit directory on linux.
func (s Service) DefinitionPath() (string, error) {
	if s.Home == nil {
		return "", errors.New("runtime home is required")
	}
	switch s.goos() {
	case "darwin":
		return filepath.Join(s.Home.Root(), "slack-coordinator.plist"), nil
	case "linux":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, ".config", "systemd", "user", s.unitName()), nil
	default:
		return "", ErrUnsupportedPlatform
	}
}

// ownedDefinition reports whether a definition this package wrote exists at
// path. A file without the marker is foreign and is never touched.
func (s Service) ownedDefinition(path string) (exists, owned bool, err error) {
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return false, false, nil
	}
	if err != nil {
		return false, false, err
	}
	return true, strings.Contains(string(raw), serviceMarker), nil
}

// Installed reports whether an owned definition exists at DefinitionPath.
func (s Service) Installed() bool {
	path, err := s.DefinitionPath()
	if err != nil {
		return false
	}
	_, owned, err := s.ownedDefinition(path)
	return err == nil && owned
}

// Install writes the definition with mode 0600 and activates it. A foreign
// file at the definition path fails the install before anything is written;
// a failed activation removes a definition this call created.
func (s Service) Install() error {
	if s.Executor == nil {
		return errors.New("service executor is required")
	}
	definition, err := s.Definition()
	if err != nil {
		return err
	}
	path, err := s.DefinitionPath()
	if err != nil {
		return err
	}
	existed, owned, err := s.ownedDefinition(path)
	if err != nil {
		return err
	}
	if existed && !owned {
		return fmt.Errorf("refusing to replace foreign service definition at %s (missing %s marker)", path, serviceMarker)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(path, []byte(definition), 0o600); err != nil {
		return fmt.Errorf("write service definition: %w", err)
	}
	var activate error
	switch s.goos() {
	case "darwin":
		activate = s.Executor.Run("launchctl", "load", "-w", path)
	case "linux":
		activate = s.Executor.Run("systemctl", "--user", "daemon-reload")
		if activate == nil {
			activate = s.Executor.Run("systemctl", "--user", "enable", "--now", s.unitName())
		}
	}
	if activate == nil {
		return nil
	}
	if !existed {
		_ = os.Remove(path)
	}
	return fmt.Errorf("activate service: %w", activate)
}

// Uninstall deactivates the service and removes the owned definition. A
// missing definition is not an error; a foreign file is refused.
func (s Service) Uninstall() error {
	if s.Executor == nil {
		return errors.New("service executor is required")
	}
	path, err := s.DefinitionPath()
	if err != nil {
		return err
	}
	existed, owned, err := s.ownedDefinition(path)
	if err != nil {
		return err
	}
	if !existed {
		return nil
	}
	if !owned {
		return fmt.Errorf("refusing to remove foreign service definition at %s (missing %s marker)", path, serviceMarker)
	}
	var deactivate error
	switch s.goos() {
	case "darwin":
		deactivate = s.Executor.Run("launchctl", "unload", path)
	case "linux":
		deactivate = s.Executor.Run("systemctl", "--user", "disable", "--now", s.unitName())
	}
	if deactivate != nil {
		return fmt.Errorf("deactivate service: %w", deactivate)
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
