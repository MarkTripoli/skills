package daemon

import (
	"encoding/binary"
	"strings"
	"unicode/utf16"
)

func environmentHas(raw []byte, marker string) bool {
	if strings.Contains(string(raw), marker) {
		return true
	}
	if len(raw)%2 != 0 {
		return false
	}
	words := make([]uint16, len(raw)/2)
	for i := range words {
		words[i] = binary.LittleEndian.Uint16(raw[i*2:])
	}
	return strings.Contains(string(utf16.Decode(words)), marker)
}

func managedHookEnvironment(raw []byte) string {
	text := string(raw)
	for _, part := range strings.Split(text, "\x00") {
		if strings.HasPrefix(part, "SD_MANAGED_HOOK=") {
			return strings.TrimPrefix(part, "SD_MANAGED_HOOK=")
		}
	}
	if len(raw)%2 == 0 {
		words := make([]uint16, len(raw)/2)
		for i := range words {
			words[i] = binary.LittleEndian.Uint16(raw[i*2:])
		}
		for _, part := range strings.Split(string(utf16.Decode(words)), "\x00") {
			if strings.HasPrefix(part, "SD_MANAGED_HOOK=") {
				return strings.TrimPrefix(part, "SD_MANAGED_HOOK=")
			}
		}
	}
	return ""
}
