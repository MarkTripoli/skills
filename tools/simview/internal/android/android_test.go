package android

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

const ini = "port.serial=5790\nport.adb=5791\navd.name=simview_test\navd.dir=/x\ngrpc.port=8790\ngrpc.token=abc123\n"

func TestParseINI(t *testing.T) {
	e, ok := ParseINI(42, ini)
	if !ok || e.ID() != "emulator-5790" || e.AVDName != "simview_test" || e.GRPCPort != 8790 || e.GRPCToken != "abc123" {
		t.Fatalf("%+v %v", e, ok)
	}
	e, ok = ParseINI(1, "port.serial=5554\navd.name=a\ngrpc.port=8554\n")
	if !ok || e.GRPCToken != "" {
		t.Fatalf("%+v", e)
	}
	if _, ok := ParseINI(1, "avd.name=a\n"); ok {
		t.Fatal("missing keys accepted")
	}
}

func TestScanDirSkipsDeadPIDs(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "pid_"+itoa(os.Getpid())+".ini"), []byte(ini), 0o644)
	os.WriteFile(filepath.Join(dir, "pid_999999999.ini"), []byte(ini), 0o644)
	os.WriteFile(filepath.Join(dir, "other.ini"), []byte(ini), 0o644)
	got := ScanDir(dir)
	if len(got) != 1 || got[0].PID != os.Getpid() {
		t.Fatalf("%+v", got)
	}
	if !pidAlive(os.Getpid()) || pidAlive(0) {
		t.Fatal("pidAlive")
	}
}

func itoa(n int) string { return strconv.Itoa(n) }
func TestWheelDownSwipesUp(t *testing.T) {
	down := WheelPath(0.5, 0.5, 1)
	if len(down) != 7 || down[len(down)-1][1] >= down[0][1] {
		t.Fatalf("%v", down)
	}
	up := WheelPath(0.5, 0.5, -1)
	if up[len(up)-1][1] <= up[0][1] {
		t.Fatalf("%v", up)
	}
}

func TestTouchEventMapsToDevicePixels(t *testing.T) {
	e := TouchEvent(0.5, 1.0, [2]int{1080, 2400}, true)
	tc := e.Touches[0]
	if len(e.Touches) != 1 || tc.X != 540 || tc.Y != 2399 || tc.Identifier != 0 || tc.Pressure != 1 {
		t.Fatalf("%v", e)
	}
	up := TouchEvent(0, 0, [2]int{1080, 2400}, false).Touches[0]
	if up.X != 0 || up.Y != 0 || up.Pressure != 0 {
		t.Fatal(up)
	}
	c := TouchEvent(2, -1, [2]int{100, 100}, true).Touches[0]
	if c.X != 99 || c.Y != 0 {
		t.Fatal(c)
	}
}

func TestTargetFitsWithoutUpscaling(t *testing.T) {
	if w, h := TargetSize([2]int{1080, 2400}, [2]int{540, 600}); w != 270 || h != 600 {
		t.Fatal(w, h)
	}
	if w, h := TargetSize([2]int{1080, 2400}, [2]int{5000, 5000}); w != 1080 || h != 2400 {
		t.Fatal(w, h)
	}
}
