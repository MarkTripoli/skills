// Package android is the Android emulator backend over the emulator's gRPC controller.
package android

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
)

// Emulator is one running emulator found from its pid_*.ini file.
type Emulator struct {
	PID        int
	AVDName    string
	SerialPort int
	GRPCPort   int
	GRPCToken  string
}

// ID is the adb serial, e.g. emulator-5790.
func (e Emulator) ID() string { return fmt.Sprintf("emulator-%d", e.SerialPort) }

// ParseINI parses the text of one pid_*.ini. ok is false when required keys are missing.
func ParseINI(pid int, text string) (Emulator, bool) {
	e := Emulator{PID: pid}
	var haveName, haveSerial, haveGRPC bool
	for _, line := range strings.Split(text, "\n") {
		k, v, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		v = strings.TrimSpace(v)
		switch strings.TrimSpace(k) {
		case "avd.name":
			e.AVDName, haveName = v, true
		case "port.serial":
			if n, err := strconv.ParseUint(v, 10, 16); err == nil {
				e.SerialPort, haveSerial = int(n), true
			}
		case "grpc.port":
			if n, err := strconv.ParseUint(v, 10, 16); err == nil {
				e.GRPCPort, haveGRPC = int(n), true
			}
		case "grpc.token":
			if v != "" {
				e.GRPCToken = v
			}
		}
	}
	return e, haveName && haveSerial && haveGRPC
}

func pidAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}

// SearchDirs are the directories the emulator writes its running files into.
func SearchDirs() []string {
	var dirs []string
	if x := os.Getenv("XDG_RUNTIME_DIR"); x != "" {
		dirs = append(dirs, filepath.Join(x, "avd", "running"))
	}
	dirs = append(dirs, fmt.Sprintf("/run/user/%d/avd/running", os.Getuid()))
	if home, err := os.UserHomeDir(); err == nil {
		dirs = append(dirs,
			filepath.Join(home, ".android", "avd", "running"),
			filepath.Join(home, "Library", "Caches", "TemporaryItems", "avd", "running"))
	}
	return dirs
}

// ScanDir lists live emulators in one directory.
func ScanDir(dir string) []Emulator {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var out []Emulator
	for _, en := range entries {
		name, ok := strings.CutPrefix(en.Name(), "pid_")
		if !ok {
			continue
		}
		name, ok = strings.CutSuffix(name, ".ini")
		if !ok {
			continue
		}
		pid, err := strconv.Atoi(name)
		if err != nil || !pidAlive(pid) {
			continue
		}
		text, err := os.ReadFile(filepath.Join(dir, en.Name()))
		if err != nil {
			continue
		}
		if e, ok := ParseINI(pid, string(text)); ok {
			out = append(out, e)
		}
	}
	return out
}

// RunningEmulators lists live emulators across all search directories, by serial port.
func RunningEmulators() []Emulator {
	var all []Emulator
	for _, d := range SearchDirs() {
		for _, e := range ScanDir(d) {
			dup := false
			for _, x := range all {
				if x.SerialPort == e.SerialPort {
					dup = true
				}
			}
			if !dup {
				all = append(all, e)
			}
		}
	}
	sort.Slice(all, func(i, j int) bool { return all[i].SerialPort < all[j].SerialPort })
	return all
}
