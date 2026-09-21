package procreap

import (
	"errors"
	"testing"
)

func TestSweepRunWorktreeStrictBlocksOnSignalFailure(t *testing.T) {
	oldList, oldCWD, oldStrict, oldSignal, oldGroup, oldAlive := listProcessesFunc, processCWDsFunc, processCWDsStrictFunc, signalProcessFunc, signalGroupFunc, processAliveFunc
	t.Cleanup(func() {
		listProcessesFunc, processCWDsFunc, processCWDsStrictFunc, signalProcessFunc, signalGroupFunc, processAliveFunc = oldList, oldCWD, oldStrict, oldSignal, oldGroup, oldAlive
	})
	listProcessesFunc = func() ([]Process, error) {
		return []Process{{PID: 42, PPID: 999, PGID: 42, Command: "validator"}}, nil
	}
	processCWDsFunc = func([]int) map[int]string { return map[int]string{42: "/runs/repo/run"} }
	processCWDsStrictFunc = func([]int) (map[int]string, error) { return map[int]string{42: "/runs/repo/run"}, nil }
	signalProcessFunc = func(int, procSignal) error { return errors.New("permission denied") }
	signalGroupFunc = func(int, procSignal) error { return errors.New("permission denied") }
	processAliveFunc = func(int) bool { return true }
	if err := SweepRunWorktreeStrict("/runs", "repo", "run", "/runs/repo/run", "recovery"); err == nil {
		t.Fatal("recovery proceeded without proving the worktree was exclusive")
	}
}
