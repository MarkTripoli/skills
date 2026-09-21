//go:build windows

package daemon

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

func processEnvironment(pid int) ([]byte, error) {
	p, err := windows.OpenProcess(windows.PROCESS_QUERY_INFORMATION|windows.PROCESS_VM_READ, false, uint32(pid))
	if err != nil {
		return nil, err
	}
	defer windows.CloseHandle(p)
	var basic windows.PROCESS_BASIC_INFORMATION
	var n uint32
	if err = windows.NtQueryInformationProcess(p, windows.ProcessBasicInformation, unsafe.Pointer(&basic), uint32(unsafe.Sizeof(basic)), &n); err != nil {
		return nil, err
	}
	var peb windows.PEB
	if err = readRemote(p, uintptr(unsafe.Pointer(basic.PebBaseAddress)), unsafe.Pointer(&peb), unsafe.Sizeof(peb)); err != nil {
		return nil, err
	}
	var params windows.RTL_USER_PROCESS_PARAMETERS
	if err = readRemote(p, uintptr(unsafe.Pointer(peb.ProcessParameters)), unsafe.Pointer(&params), unsafe.Sizeof(params)); err != nil {
		return nil, err
	}
	if params.Environment == nil || params.EnvironmentSize == 0 || params.EnvironmentSize > 16<<20 {
		return nil, fmt.Errorf("invalid process environment")
	}
	buf := make([]byte, params.EnvironmentSize)
	if err = readRemote(p, uintptr(params.Environment), unsafe.Pointer(&buf[0]), uintptr(len(buf))); err != nil {
		return nil, err
	}
	return buf, nil
}

func readRemote(process windows.Handle, address uintptr, target unsafe.Pointer, size uintptr) error {
	var read uintptr
	return windows.ReadProcessMemory(process, address, (*byte)(target), size, &read)
}
