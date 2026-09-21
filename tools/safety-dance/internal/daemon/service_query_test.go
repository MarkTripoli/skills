package daemon

import (
	"errors"
	"testing"
)

func TestIsTaskNotFoundUsesCommandOutput(t *testing.T) {
	if !isTaskNotFound([]byte("ERROR: The system cannot find the file specified."), errors.New("exit status 1")) {
		t.Fatal("missing scheduled task diagnostic was not classified")
	}
	if isTaskNotFound([]byte("Access is denied."), errors.New("exit status 1")) {
		t.Fatal("access denied was classified as missing")
	}
}
