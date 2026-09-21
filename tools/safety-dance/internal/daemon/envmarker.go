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
