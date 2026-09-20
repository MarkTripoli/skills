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
