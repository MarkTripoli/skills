package cli

import (
	"os"
	"testing"
)

func TestNestedMutationIsRejected(t *testing.T) {
	t.Setenv("SD_PARENT_RUN_ID", "run-1")
	if err := nestedMutation(); err == nil {
		t.Fatal("expected nested mutation refusal")
	}
	os.Unsetenv("SD_PARENT_RUN_ID")
	if err := nestedMutation(); err != nil {
		t.Fatal(err)
	}
}
