package safety

import "testing"

func p(s string) *string { return &s }

func TestUnsetAllowsAll(t *testing.T) {
	if !AllowedBy(nil, "emulator-5720") || !AllowedBy(nil, "cdp:9222:x") {
		t.Fatal("unset must allow all")
	}
}

func TestExactIDAllowsOnlyThatID(t *testing.T) {
	a := p("emulator-5790")
	if !AllowedBy(a, "emulator-5790") || AllowedBy(a, "emulator-5720") || AllowedBy(a, "emulator-57900") {
		t.Fatal("exact match broken")
	}
}

func TestCDPWildcardMatchesPortOnly(t *testing.T) {
	a := p("emulator-5790,cdp:9333:*")
	if !AllowedBy(a, "cdp:9333:ABC") || AllowedBy(a, "cdp:9222:x") || !AllowedBy(a, "emulator-5790") {
		t.Fatal("glob broken")
	}
}

func TestGuardRunsBeforeConnect(t *testing.T) {
	connected := false
	_, err := Guarded(p("emulator-5790"), "emulator-5999", func() int { connected = true; return 1 })
	if err == nil || err.Error() != "input to emulator-5999 not allowed by SIMVIEW_INPUT_ALLOW" {
		t.Fatalf("%v", err)
	}
	if connected {
		t.Fatal("connect must not run for a refused device")
	}
	if _, err := Guarded(p("emulator-5790"), "emulator-5790", func() int { connected = true; return 1 }); err != nil || !connected {
		t.Fatal("allowed device must connect")
	}
}

func TestEmptyListAllowsNothing(t *testing.T) {
	if AllowedBy(p(""), "emulator-5790") {
		t.Fatal("empty list allowed")
	}
}

func TestInputAllowedReadsEnv(t *testing.T) {
	t.Setenv(Env, "a,b*")
	if !InputAllowed("a") || !InputAllowed("bz") || InputAllowed("c") {
		t.Fatal("env list not honoured")
	}
}
