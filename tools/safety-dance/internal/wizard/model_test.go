package wizard

import "testing"

func TestModelDefaultsAreExplicit(t *testing.T) {
	m := Model{}
	if m.Upstream != "" || m.Gate != "" || m.ConfirmService {
		t.Fatal("unexpected wizard defaults")
	}
}
