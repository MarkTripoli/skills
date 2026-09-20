package daemon

import (
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

type recordingExecutor struct{ names []string }

func (e *recordingExecutor) Run(name string, args ...string) error {
	e.names = append(e.names, name)
	return nil
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
