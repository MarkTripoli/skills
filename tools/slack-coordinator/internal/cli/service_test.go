package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
)

type recordingExecutor struct {
	commands []string
}

func (e *recordingExecutor) Run(name string, args ...string) error {
	e.commands = append(e.commands, name+" "+strings.Join(args, " "))
	return nil
}

// injectService makes every command build its Service with a recording
// executor and the given GOOS instead of launchctl or systemctl.
func injectService(t *testing.T, goos string) *recordingExecutor {
	t.Helper()
	executor := &recordingExecutor{}
	previous := serviceFor
	serviceFor = func(p *paths.Paths) (daemon.Service, error) {
		return daemon.Service{Home: p, Binary: "/opt/slack-coordinator", Executor: executor, GOOS: goos}, nil
	}
	t.Cleanup(func() { serviceFor = previous })
	return executor
}

func TestServiceInstallStatusUninstall(t *testing.T) {
	home := t.TempDir()
	t.Setenv(paths.EnvHome, home)
	executor := injectService(t, "darwin")
	plist := filepath.Join(home, "slack-coordinator.plist")

	if out, code := runCLI(t, "service", "status"); code != ExitOK || out != "service not installed\n" {
		t.Fatalf("status before install: exit %d, output %q", code, out)
	}
	if out, code := runCLI(t, "service", "install"); code != ExitOK || out != "service installed at "+plist+"\n" {
		t.Fatalf("install: exit %d, output %q", code, out)
	}
	if got := strings.Join(executor.commands, ";"); got != "launchctl load -w "+plist {
		t.Fatalf("install ran %q", got)
	}
	if raw, err := os.ReadFile(plist); err != nil || !strings.Contains(string(raw), "<string>/opt/slack-coordinator</string>") {
		t.Fatalf("plist %q, %v; want the injected binary", raw, err)
	}
	if out, code := runCLI(t, "service", "status"); code != ExitOK || out != "service installed at "+plist+"\n" {
		t.Fatalf("status after install: exit %d, output %q", code, out)
	}

	// daemon stop with no daemon still reports the supervisor.
	out, code := runCLI(t, "daemon", "stop")
	if code != ExitOK || out != supervisionNotice+"\ndaemon not running\n" {
		t.Fatalf("daemon stop with a service installed: exit %d, output %q", code, out)
	}

	executor.commands = nil
	if out, code := runCLI(t, "service", "uninstall"); code != ExitOK || out != "service removed from "+plist+"\n" {
		t.Fatalf("uninstall: exit %d, output %q", code, out)
	}
	if got := strings.Join(executor.commands, ";"); got != "launchctl unload "+plist {
		t.Fatalf("uninstall ran %q", got)
	}
	if _, err := os.Stat(plist); !os.IsNotExist(err) {
		t.Fatalf("plist still present after uninstall: %v", err)
	}
	if out, code := runCLI(t, "service", "uninstall"); code != ExitOK || out != "service not installed\n" {
		t.Fatalf("second uninstall: exit %d, output %q", code, out)
	}
	if out, code := runCLI(t, "daemon", "stop"); code != ExitOK || out != "daemon not running\n" {
		t.Fatalf("daemon stop without a service: exit %d, output %q", code, out)
	}
}

func TestDaemonStopUnderSupervisionStillShutsDown(t *testing.T) {
	_, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	startTestDaemon(t, cfg)
	injectService(t, "darwin")
	if _, code := runCLI(t, "service", "install"); code != ExitOK {
		t.Fatalf("install exit %d", code)
	}
	out, code := runCLI(t, "daemon", "stop")
	if code != ExitOK || out != supervisionNotice+"\ndaemon stopped\n" {
		t.Fatalf("daemon stop: exit %d, output %q", code, out)
	}
	if health() == nil {
		t.Fatal("daemon still answers after stop")
	}
}

func TestServiceCommandsRejectUnsupportedPlatform(t *testing.T) {
	t.Setenv(paths.EnvHome, t.TempDir())
	executor := injectService(t, "windows")
	for _, verb := range []string{"install", "uninstall", "status"} {
		if out, code := runCLI(t, "service", verb); code != ExitUsage {
			t.Errorf("service %s on windows: exit %d, output %q; want %d", verb, code, out, ExitUsage)
		}
	}
	if len(executor.commands) != 0 {
		t.Fatalf("commands ran on an unsupported platform: %q", executor.commands)
	}
}

func TestSetupInstallServiceFailsBeforeSlackOnUnsupportedPlatform(t *testing.T) {
	home := t.TempDir()
	t.Setenv(paths.EnvHome, home)
	t.Setenv("SLACK_BOT_TOKEN", "xoxb-1")
	t.Setenv("SLACK_APP_TOKEN", "xapp-1")
	injectService(t, "windows")
	if _, code := runCLI(t, "setup", "--owner", "U1", "--install-service"); code != ExitUsage {
		t.Fatalf("setup --install-service on windows: exit %d, want %d", code, ExitUsage)
	}
	if _, err := os.Stat(filepath.Join(home, "config.yaml")); !os.IsNotExist(err) {
		t.Fatalf("config.yaml written despite the refused install: %v", err)
	}
}
