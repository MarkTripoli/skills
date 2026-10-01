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
	// Path is the PATH exported to the daemon. Launchd and systemd do not
	// use a login shell's PATH, so an empty value leaves pi, claude, and
	// codex invisible. Install snapshots the installing shell.
	Path string
	// GOOS selects the definition format; empty means runtime.GOOS. Tests set
	// it so both platforms are covered on one host.
	GOOS string
}

// AgentPath merges path with the bin directories a login shell usually has
// and a per-user supervisor does not. Later duplicates are dropped.
func AgentPath(path string) string {
	extras := []string{"/opt/homebrew/bin", "/usr/local/bin"}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		extras = append(extras, filepath.Join(home, ".local", "bin"))
	}
	seen := map[string]bool{}
	var parts []string
	add := func(dir string) {
		if dir == "" || seen[dir] {
			return
		}
		seen[dir] = true
		parts = append(parts, dir)
	}
	for _, dir := range strings.Split(path, string(os.PathListSeparator)) {
		add(dir)
	}
	for _, dir := range extras {
		add(dir)
	}
	return strings.Join(parts, string(os.PathListSeparator))
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
		env := fmt.Sprintf("\t\t<key>%s</key>\n\t\t<string>%s</string>\n", paths.EnvHome, esc(s.Home.Root()))
		if s.Path != "" {
			env += fmt.Sprintf("\t\t<key>PATH</key>\n\t\t<string>%s</string>\n", esc(s.Path))
		}
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
%s	</dict>
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
`, serviceMarker, esc(s.Label()), esc(s.Binary), env, esc(s.Home.DaemonLog()), esc(s.Home.DaemonLog())), nil
	case "linux":
		env := "Environment=" + strconv.Quote(paths.EnvHome+"="+s.Home.Root())
		if s.Path != "" {
			env += "\nEnvironment=" + strconv.Quote("PATH="+s.Path)
		}
		return fmt.Sprintf(`# %s
[Unit]
Description=slack-coordinator daemon

[Service]
ExecStart=%s daemon serve
%s
StandardOutput=append:%s
StandardError=append:%s
Restart=on-failure

[Install]
WantedBy=default.target
`, serviceMarker, strconv.Quote(s.Binary), env, s.Home.DaemonLog(), s.Home.DaemonLog()), nil
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

// InstalledPath returns this installation's owned service definition.
func (s Service) InstalledPath() string {
	path, err := s.DefinitionPath()
	if err != nil {
		return ""
	}
	_, owned, err := s.ownedDefinition(path)
	if err != nil || !owned {
		return ""
	}
	return path
}

func (s Service) Installed() bool { return s.InstalledPath() != "" }

// Install writes and activates the owned service. A failed update restores
// its previous definition and restarts it; runtime configuration and data stay put.
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
	var previous []byte
	if existed {
		previous, err = os.ReadFile(path)
		if err != nil {
			return err
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	// A loaded agent rejects a second load. Unload first when this definition
	// is already ours. Unload of a definition that is not currently loaded
	// fails, and the load below still applies the new file.
	if existed && owned {
		_ = s.deactivate(path, serviceLabel)
	}
	rollback := func(cause error, attemptedActivation bool) error {
		var restore error
		if attemptedActivation {
			restore = s.deactivate(path, serviceLabel)
		}
		if existed {
			restore = errors.Join(restore, os.WriteFile(path, previous, 0o600))
		} else {
			err := os.Remove(path)
			if !os.IsNotExist(err) {
				restore = errors.Join(restore, err)
			}
		}
		if existed {
			restore = errors.Join(restore, s.activate(path, serviceLabel))
		}
		return errors.Join(cause, restore)
	}
	if err := os.WriteFile(path, []byte(definition), 0o600); err != nil {
		return rollback(fmt.Errorf("write service definition: %w", err), false)
	}
	if err := s.activate(path, serviceLabel); err != nil {
		return rollback(fmt.Errorf("activate service: %w", err), true)
	}
	return nil
}

func (s Service) deactivate(path, label string) error {
	if s.goos() == "darwin" {
		return s.Executor.Run("launchctl", "unload", path)
	}
	return s.Executor.Run("systemctl", "--user", "disable", "--now", label+".service")
}

func (s Service) activate(path, label string) error {
	if s.goos() == "darwin" {
		return s.Executor.Run("launchctl", "load", "-w", path)
	}
	if err := s.Executor.Run("systemctl", "--user", "daemon-reload"); err != nil {
		return err
	}
	return s.Executor.Run("systemctl", "--user", "enable", "--now", label+".service")
}

// Uninstall deactivates and removes only this installation's owned definition.
func (s Service) Uninstall() error {
	if s.Executor == nil {
		return errors.New("service executor is required")
	}
	path, err := s.DefinitionPath()
	if err != nil {
		return err
	}
	exists, owned, err := s.ownedDefinition(path)
	if err != nil || !exists {
		return err
	}
	if !owned {
		return fmt.Errorf("refusing to remove foreign service definition at %s (missing %s marker)", path, serviceMarker)
	}
	if err := s.deactivate(path, serviceLabel); err != nil {
		return fmt.Errorf("deactivate service: %w", err)
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
