//go:build windows

package daemon

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

func processInfo(pid int) (int, string, error) {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return 0, "", err
	}
	defer windows.CloseHandle(snapshot)
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	for err = windows.Process32First(snapshot, &entry); err == nil; err = windows.Process32Next(snapshot, &entry) {
		if entry.ProcessID == uint32(pid) {
			command := windows.UTF16ToString(entry.ExeFile[:])
			// Toolhelp exposes only the executable name. Git for Windows launches
			// shell hooks through sh.exe, so include the OS command line when it is
			// available to prove which installed hook script started the peer.
			if line := windowsProcessCommandLine(pid); line != "" {
				command += " " + line
			}
			return int(entry.ParentProcessID), command, nil
		}
	}
	if err != windows.ERROR_NO_MORE_FILES {
		return 0, "", err
	}
	return 0, "", fmt.Errorf("process %d not found", pid)
}

func windowsProcessCommandLine(pid int) string {
	query := fmt.Sprintf("(Get-CimInstance Win32_Process -Filter 'ProcessId = %s').CommandLine", strconv.Itoa(pid))
	out, err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", query).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
