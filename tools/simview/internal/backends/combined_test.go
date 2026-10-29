package backends

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/simview/internal/config"
	"github.com/MarkTripoli/skills/tools/simview/internal/device"
)

type deadRemote struct{}

func (deadRemote) Name() string { return "gone" }
func (deadRemote) List(context.Context) ([]device.Info, error) {
	return nil, errors.New("no route")
}
func (deadRemote) Connect(context.Context, string) (device.Session, error) {
	return nil, errors.New("no route")
}

func TestDeadRemoteIsADisabledRowNotAnError(t *testing.T) {
	cfg := config.Default()
	cfg.CDPPorts = []int{1}
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_RUNTIME_DIR", t.TempDir())
	devs, err := New(cfg, deadRemote{}).List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range devs {
		if d.ID == "gone" {
			if !d.Disabled || !strings.HasPrefix(d.Name, "gone: unreachable (") {
				t.Fatalf("%+v", d)
			}
			return
		}
	}
	t.Fatal("no remote row")
}

func TestConnectRoutesToRemotePrefix(t *testing.T) {
	_, err := New(config.Default(), deadRemote{}).Connect(context.Background(), "gone/UDID")
	if err == nil || err.Error() != "no route" {
		t.Fatalf("%v", err)
	}
}
