package daemon

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
)

type recordingExecutor struct {
	names []string
	args  [][]string
	err   error
}

func (e *recordingExecutor) Run(name string, args ...string) error {
	e.names = append(e.names, name)
	e.args = append(e.args, append([]string(nil), args...))
	return e.err
}

func (e *recordingExecutor) commands() string {
	var b strings.Builder
	for i, name := range e.names {
		fmt.Fprintf(&b, "%s %s\n", name, strings.Join(e.args[i], " "))
	}
	return b.String()
}

func TestServiceDefinitionBindsHomeBinaryAndServeVerb(t *testing.T) {
	home := paths.WithRoot(filepath.Join(t.TempDir(), "sc home"))
	for goos, want := range map[string][]string{
		"darwin": {"<string>com.marktripoli.slack-coordinator</string>", "<string>/opt/slack coordinator</string>", "<string>daemon</string>", "<string>serve</string>",
			"<key>SLACK_COORDINATOR_HOME</key>", "<string>" + home.Root() + "</string>", "<string>" + home.DaemonLog() + "</string>", "<key>RunAtLoad</key>", "<key>KeepAlive</key>"},
		"linux": {`ExecStart="/opt/slack coordinator" daemon serve`, `Environment="SLACK_COORDINATOR_HOME=` + home.Root() + `"`, "append:" + home.DaemonLog(), "Restart=on-failure", "WantedBy=default.target"},
	} {
		definition, err := (Service{Home: home, Binary: "/opt/slack coordinator", GOOS: goos}).Definition()
		if err != nil {
			t.Fatalf("%s: %v", goos, err)
		}
		if !strings.Contains(definition, serviceMarker) {
			t.Errorf("%s definition lacks the %s marker:\n%s", goos, serviceMarker, definition)
		}
		for _, fragment := range want {
			if !strings.Contains(definition, fragment) {
				t.Errorf("%s definition lacks %q:\n%s", goos, fragment, definition)
			}
		}
	}
}

func TestServiceRejectsUnsupportedPlatform(t *testing.T) {
	service := Service{Home: paths.WithRoot(t.TempDir()), Binary: "/opt/slack-coordinator", Executor: &recordingExecutor{}, GOOS: "windows"}
	if _, err := service.Definition(); !errors.Is(err, ErrUnsupportedPlatform) {
		t.Fatalf("Definition on windows: %v, want ErrUnsupportedPlatform", err)
	}
	if _, err := service.DefinitionPath(); !errors.Is(err, ErrUnsupportedPlatform) {
		t.Fatalf("DefinitionPath on windows: %v, want ErrUnsupportedPlatform", err)
	}
	if err := service.Install(); !errors.Is(err, ErrUnsupportedPlatform) {
		t.Fatalf("Install on windows: %v, want ErrUnsupportedPlatform", err)
	}
	if service.Installed() {
		t.Fatal("Installed reports true on windows")
	}
}

func TestServiceInstallAndUninstallDriveThePlatformManager(t *testing.T) {
	for _, tc := range []struct {
		goos      string
		path      func(home *paths.Paths, userHome string) string
		install   string // {path} is the definition path
		uninstall string
	}{
		{
			goos:      "darwin",
			path:      func(home *paths.Paths, _ string) string { return filepath.Join(home.Root(), "slack-coordinator.plist") },
			install:   "launchctl load -w {path}\n",
			uninstall: "launchctl unload {path}\n",
		},
		{
			goos: "linux",
			path: func(_ *paths.Paths, userHome string) string {
				return filepath.Join(userHome, ".config", "systemd", "user", "com.marktripoli.slack-coordinator.service")
			},
			install:   "systemctl --user daemon-reload\nsystemctl --user enable --now com.marktripoli.slack-coordinator.service\n",
			uninstall: "systemctl --user disable --now com.marktripoli.slack-coordinator.service\n",
		},
	} {
		t.Run(tc.goos, func(t *testing.T) {
			userHome := t.TempDir()
			t.Setenv("HOME", userHome)
			home := paths.WithRoot(t.TempDir())
			executor := &recordingExecutor{}
			service := Service{Home: home, Binary: "/opt/slack-coordinator", Executor: executor, GOOS: tc.goos}
			wantPath := tc.path(home, userHome)

			if service.Installed() {
				t.Fatal("Installed before install")
			}
			path, err := service.DefinitionPath()
			if err != nil || path != wantPath {
				t.Fatalf("DefinitionPath = %q, %v; want %q", path, err, wantPath)
			}
			if err := service.Install(); err != nil {
				t.Fatal(err)
			}
			info, err := os.Stat(path)
			if err != nil {
				t.Fatal(err)
			}
			if info.Mode().Perm() != 0o600 {
				t.Errorf("definition mode %o, want 0600", info.Mode().Perm())
			}
			if got, want := executor.commands(), strings.ReplaceAll(tc.install, "{path}", path); got != want {
				t.Errorf("install commands:\n%swant:\n%s", got, want)
			}
			if !service.Installed() {
				t.Fatal("Installed false after install")
			}

			// Reinstall over our own file is allowed and rewrites it.
			if err := service.Install(); err != nil {
				t.Fatalf("reinstall over owned definition: %v", err)
			}

			executor.names, executor.args = nil, nil
			if err := service.Uninstall(); err != nil {
				t.Fatal(err)
			}
			if got, want := executor.commands(), strings.ReplaceAll(tc.uninstall, "{path}", path); got != want {
				t.Errorf("uninstall commands:\n%swant:\n%s", got, want)
			}
			if _, err := os.Stat(path); !os.IsNotExist(err) {
				t.Errorf("definition still present after uninstall: %v", err)
			}
			if service.Installed() {
				t.Error("Installed true after uninstall")
			}
			// A second uninstall has nothing to do and runs no command.
			executor.names, executor.args = nil, nil
			if err := service.Uninstall(); err != nil || len(executor.names) != 0 {
				t.Errorf("uninstall when absent: err %v, commands %q", err, executor.commands())
			}
		})
	}
}

func TestServiceRefusesForeignDefinition(t *testing.T) {
	home := paths.WithRoot(t.TempDir())
	executor := &recordingExecutor{}
	service := Service{Home: home, Binary: "/opt/slack-coordinator", Executor: executor, GOOS: "darwin"}
	path, err := service.DefinitionPath()
	if err != nil {
		t.Fatal(err)
	}
	foreign := "<plist><dict><key>Label</key><string>someone.else</string></dict></plist>"
	if err := os.WriteFile(path, []byte(foreign), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := service.Install(); err == nil {
		t.Fatal("Install replaced a foreign definition")
	}
	if err := service.Uninstall(); err == nil {
		t.Fatal("Uninstall removed a foreign definition")
	}
	if service.Installed() {
		t.Error("Installed true for a foreign definition")
	}
	raw, err := os.ReadFile(path)
	if err != nil || string(raw) != foreign {
		t.Fatalf("foreign definition changed: %q, %v", raw, err)
	}
	if len(executor.names) != 0 {
		t.Fatalf("commands ran against a foreign definition: %q", executor.commands())
	}
}

func TestServiceInstallRemovesItsFileWhenActivationFails(t *testing.T) {
	home := paths.WithRoot(t.TempDir())
	service := Service{Home: home, Binary: "/opt/slack-coordinator", Executor: &recordingExecutor{err: errors.New("launchctl: boom")}, GOOS: "darwin"}
	err := service.Install()
	if err == nil || !strings.Contains(err.Error(), "launchctl: boom") {
		t.Fatalf("Install with failing activation: %v", err)
	}
	if service.Installed() {
		t.Fatal("definition left behind after failed activation")
	}
}
