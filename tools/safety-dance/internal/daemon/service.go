package daemon

import (
	"encoding/json"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
)

type serviceOutputExecutor interface {
	Output(name string, args ...string) ([]byte, error)
}
type ServiceExecutor interface {
	Run(name string, args ...string) error
}
type Service struct {
	Home     *paths.Paths
	Binary   string
	Executor ServiceExecutor
}

func systemdQuote(value string) string {
	return strconv.Quote(value)
}

type serviceRecovery struct {
	Existed  bool   `json:"existed"`
	Previous []byte `json:"previous"`
}

const serviceMarker = "SAFETY_DANCE_MANAGED"

func (s Service) Label() string {
	return "com-safety-dance-daemon-" + strings.NewReplacer("/", "-", "\\", "-", ".", "-", ":", "-").Replace(s.Home.Root())
}

func windowsCmdValue(value string) string {
	value = strings.ReplaceAll(value, "^", "^^")
	value = strings.ReplaceAll(value, "&", "^&")
	value = strings.ReplaceAll(value, "|", "^|")
	value = strings.ReplaceAll(value, "<", "^<")
	value = strings.ReplaceAll(value, ">", "^>")
	value = strings.ReplaceAll(value, "(", "^(")
	value = strings.ReplaceAll(value, ")", "^)")
	value = strings.ReplaceAll(value, "!", "^!")
	value = strings.ReplaceAll(value, "%", "%%")
	value = strings.ReplaceAll(value, `"`, `^"`)
	return value
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
		root := html.EscapeString(s.Home.Root())
		binary := html.EscapeString(s.Binary)
		label := html.EscapeString(s.Label())
		return fmt.Sprintf("<!-- %s home=%s --><plist><dict><key>Label</key><string>%s</string><key>ProgramArguments</key><array><string>%s</string><string>daemon</string><string>serve</string></array><key>EnvironmentVariables</key><dict><key>SD_HOME</key><string>%s</string></dict><key>KeepAlive</key><true/></dict></plist>", serviceMarker, root, label, binary, root), nil
	case "linux":
		return fmt.Sprintf("# %s home=%s\n[Unit]\nDescription=Safety Dance daemon\n[Service]\nExecStart=%s daemon serve\nEnvironment=SD_HOME=%s\nRestart=on-failure\n", serviceMarker, systemdQuote(s.Home.Root()), systemdQuote(s.Binary), systemdQuote(s.Home.Root())), nil
	default:
		return fmt.Sprintf("%s home=%s\nSafety Dance Task\nName=%s\nBinary=%s daemon serve\nSD_HOME=%s\n", serviceMarker, s.Home.Root(), s.Label(), filepath.Clean(s.Binary), s.Home.Root()), nil
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
		return filepath.Join(s.Home.Root(), "safety-dance-task.definition"), nil
	}
}
func (s Service) ownedDefinition() (bool, error) {
	path, err := s.definitionPath()
	if err != nil || path == "" {
		return false, err
	}
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	text := string(raw)
	return strings.Contains(text, serviceMarker) && (strings.Contains(text, "home="+s.Home.Root()) || strings.Contains(text, "home=\""+s.Home.Root()+"\"") || strings.Contains(text, html.EscapeString(s.Home.Root()))), nil
}

func (s Service) DefinitionExists() bool {
	owned, err := s.ownedDefinition()
	return err == nil && owned
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

func (s Service) taskOwned() (bool, error) {
	executor, ok := s.Executor.(serviceOutputExecutor)
	if !ok {
		return false, nil
	}
	out, err := executor.Output("schtasks", "/Query", "/TN", s.Label(), "/FO", "LIST")
	if err != nil {
		return false, nil
	}
	raw := string(out)
	return strings.Contains(raw, serviceMarker) && strings.Contains(raw, s.Home.Root()), nil
}

func (s Service) Install() error {
	if s.Executor == nil {
		return fmt.Errorf("service executor is required")
	}
	if err := s.Validate(); err != nil {
		return err
	}
	path, err := s.definitionPath()
	if path != "" {
		exists, readErr := os.Stat(path)
		if readErr == nil {
			owned, ownerErr := s.ownedDefinition()
			if ownerErr != nil {
				return ownerErr
			}
			if !owned {
				return fmt.Errorf("service definition collision at %s", path)
			}
		} else if !os.IsNotExist(readErr) {
			return readErr
		}
		_ = exists
	}
	if err != nil {
		return err
	}
	previous, readErr := os.ReadFile(path)
	if readErr != nil && !os.IsNotExist(readErr) {
		return readErr
	}
	recovery := serviceRecovery{Existed: readErr == nil, Previous: previous}
	if err := s.writeDefinition(); err != nil {
		return fmt.Errorf("write service definition: %w", err)
	}
	var activationErr error
	if runtime.GOOS == "windows" {
		if executor, ok := s.Executor.(serviceOutputExecutor); ok {
			if out, queryErr := executor.Output("schtasks", "/Query", "/TN", s.Label(), "/FO", "LIST"); queryErr == nil && (!strings.Contains(string(out), serviceMarker) || !strings.Contains(string(out), s.Home.Root())) {
				return fmt.Errorf("foreign scheduled task collision: %s", s.Label())
			}
		}
	}
	switch runtime.GOOS {
	case "darwin":
		activationErr = s.Executor.Run("launchctl", "load", "-w", path)
	case "linux":
		activationErr = s.Executor.Run("systemctl", "--user", "enable", "--now", filepath.Base(path))
	default:
		action := fmt.Sprintf(`cmd /D /S /C "set "SD_HOME=%s"&&set %s=1&&"%s" daemon serve"`, windowsCmdValue(s.Home.Root()), serviceMarker, s.Binary)
		activationErr = s.Executor.Run("schtasks", "/Create", "/TN", s.Label(), "/TR", action, "/SC", "ONLOGON", "/RL", "LIMITED", "/F")
	}
	if activationErr == nil {
		return nil
	}
	data, marshalErr := json.Marshal(recovery)
	if marshalErr == nil {
		_ = os.WriteFile(path+".recovery", data, 0600)
	}
	// Keep the owned definition in place until compensation can disable a
	// service whose activation command may have partially succeeded.
	return activationErr
}

func restoreServiceAfterStop(path string) error {
	raw, err := os.ReadFile(path + ".recovery")
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var recovery serviceRecovery
	if err := json.Unmarshal(raw, &recovery); err != nil {
		return err
	}
	if recovery.Existed {
		if err := os.WriteFile(path, recovery.Previous, 0600); err != nil {
			return err
		}
	} else {
		_ = os.Remove(path)
	}
	return os.Remove(path + ".recovery")
}
func (s Service) Stop() error {
	if s.Executor == nil {
		return fmt.Errorf("service executor is required")
	}
	if path, pathErr := s.definitionPath(); pathErr == nil && path != "" {
		owned, ownerErr := s.ownedDefinition()
		if ownerErr != nil {
			return ownerErr
		}
		if !owned {
			return fmt.Errorf("refusing to stop foreign service definition %s", path)
		}
	}
	switch runtime.GOOS {
	case "darwin":
		path, _ := s.definitionPath()
		err := s.Executor.Run("launchctl", "unload", "-w", path)
		if err == nil {
			_ = os.Remove(path)
			if restoreErr := restoreServiceAfterStop(path); restoreErr != nil {
				return restoreErr
			}
		}
		return err
	case "linux":
		path, _ := s.definitionPath()
		err := s.Executor.Run("systemctl", "--user", "disable", "--now", filepath.Base(path))
		if err == nil {
			_ = os.Remove(path)
			if restoreErr := restoreServiceAfterStop(path); restoreErr != nil {
				return restoreErr
			}
		}
		return err
	default:
		owned, err := s.taskOwned()
		if err != nil || !owned {
			return fmt.Errorf("refusing to stop foreign scheduled task %s", s.Label())
		}
		if err := s.Executor.Run("schtasks", "/Delete", "/TN", s.Label(), "/F"); err != nil {
			return err
		}
		path, _ := s.definitionPath()
		return restoreServiceAfterStop(path)
	}
}
