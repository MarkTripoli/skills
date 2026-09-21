package daemon

import (
	"fmt"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
)

func TestServiceDefinitionBindsRuntimeHome(t *testing.T) {
	home := paths.WithRoot(t.TempDir())
	definition, err := (Service{Home: home, Binary: "/opt/safety-dance"}).Definition()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(definition, home.Root()) || !strings.Contains(definition, "safety-dance") {
		t.Fatalf("definition does not bind Safety Dance home: %s", definition)
	}
	if err := (Service{Home: home, Binary: "/opt/safety-dance"}).Validate(); err != nil {
		t.Fatal(err)
	}
}

type recordingExecutor struct {
	names []string
	args  [][]string
}

func (e *recordingExecutor) Run(name string, args ...string) error {
	e.names = append(e.names, name)
	e.args = append(e.args, append([]string(nil), args...))
	return nil
}

func TestServiceIdentityDistinguishesNormalizedRoots(t *testing.T) {
	a := serviceIdentity("/a-b/c")
	b := serviceIdentity("/a/b-c")
	if a == b {
		t.Fatalf("service identities collide: %q", a)
	}
}

func TestRestartCommandsUsePlatformRestartSequences(t *testing.T) {
	label := "service-label"
	for _, tc := range []struct {
		platform string
		want     [][]string
	}{
		{"darwin", [][]string{{"launchctl", "kickstart", "-k", "gui/42/" + label}}},
		{"linux", [][]string{{"systemctl", "--user", "restart", "unit.service"}}},
		{"windows", [][]string{{"schtasks", "/End", "/TN", label}, {"schtasks", "/Run", "/TN", label}}},
	} {
		got := restartCommands(tc.platform, label, "/tmp/unit.service", 42)
		if fmt.Sprint(got) != fmt.Sprint(tc.want) {
			t.Errorf("%s restart commands = %#v, want %#v", tc.platform, got, tc.want)
		}
	}
}

func TestServiceLifecycleUsesInjectedExecutor(t *testing.T) {
	executor := &recordingExecutor{}
	service := Service{Home: paths.WithRoot(t.TempDir()), Binary: "/opt/safety-dance", Executor: executor}
	if err := service.Install(); err != nil {
		t.Fatal(err)
	}
	if err := service.Stop(); err != nil {
		t.Fatal(err)
	}
	if len(executor.names) != 2 || executor.names[0] == "" || executor.names[1] == "" {
		t.Fatalf("service commands = %#v", executor.names)
	}
}
