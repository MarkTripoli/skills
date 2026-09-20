//go:build windows

package daemon

import (
	"fmt"
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
			return int(entry.ParentProcessID), windows.UTF16ToString(entry.ExeFile[:]), nil
		}
	}
	if err != windows.ERROR_NO_MORE_FILES {
		return 0, "", err
	}
	return 0, "", fmt.Errorf("process %d not found", pid)
}
