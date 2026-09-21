package agent

import (
	"os"
	"strings"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/git"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/runenv"
)

// GateRoleEnvVar is exported into every spawned gate agent's environment as an
// coarse diagnostic marker that the process is a safety-dance gate agent (a
// review/fix/document/test/lint/rebase/pr/ci invocation), NOT a fleet operator.
// It is defense in depth only: it can be removed, forged, or inherited, so
// runtime authorization uses canonical managed Git identity plus authenticated
// daemon peer process ancestry. Its purpose is containment: when the target repository is itself an
// agent-orchestration harness (for example firstmate), the target's project
// agent-instruction file can otherwise convince the gate agent it is the fleet
// captain and drive it to spawn a crew and reset the shared branch it is
// validating (see the ambient-authority incident). A cooperating harness reads
// this marker and its fleet-lifecycle entrypoints fail closed. It is deliberately
// coarse (`=1`): presence is the whole signal.
const GateRoleEnvVar = "SAFETY_DANCE_GATE"

// CompactAdviserDisableEnvVar is stamped onto every spawned gate-agent
// subprocess, including managed agent servers that can load host plugins, so
// compact-adviser stays inert during unattended pipeline work. The daemon
// process itself is unchanged; only agent children receive the flag. Truthy
// values recognized by compact-adviser are 1/true/yes/on; the product stamp
// is always "1". Appended last so forge/profile overlays and ambient values
// cannot drop or weaken it.
const CompactAdviserDisableEnvVar = "COMPACT_ADVISER_DISABLE"

// subprocessContext centralizes environment policy shared by every agent
// adapter, including persistent server-backed adapters.
type subprocessContext struct {
	environment runenv.Overlay
}

func newSubprocessContext(environment runenv.Overlay) subprocessContext {
	return subprocessContext{environment: environment.Clone()}
}

func (c subprocessContext) gitSafeEnv(dir string, extra ...[]string) []string {
	return gitSafeEnvWithOverlay(dir, c.environment, extra...)
}

func (c subprocessContext) overlay() runenv.Overlay {
	return c.environment.Clone()
}

// gitSafeEnv returns the environment for a spawned agent subprocess with git
// forced into non-interactive mode. Agents shell out to git directly (for
// example `git rebase --continue` during conflict resolution), which would
// otherwise open $EDITOR and hang in the headless subprocess until the agent
// times out.
//
// It also stamps GateRoleEnvVar so a cooperating orchestration harness in the
// target repo can recognize the gate agent and refuse to let it act as a fleet
// operator, and CompactAdviserDisableEnvVar so compact-adviser stays inert.
// Both are appended last so they win over any ambient or overlay value.
//
// dir must be the value assigned to cmd.Dir so PWD stays coupled to the working
// directory; see git.NonInteractiveEnv for why this matters.
func gitSafeEnv(dir string, extra ...[]string) []string {
	return gitSafeEnvWithOverlay(dir, runenv.Overlay{}, extra...)
}
func gitSafeEnvWithOverlay(dir string, overlay runenv.Overlay, extra ...[]string) []string {
	base := safeAmbientEnvironment()
	base = overlay.Apply(base)
	env := git.NonInteractiveEnvFrom(base, dir)
	if len(extra) > 0 {
		env = append(env, extra[0]...)
	}
	return append(env, GateRoleEnvVar+"=1", CompactAdviserDisableEnvVar+"=1")
}

// SafeEnvironment returns the environment policy used for configured commands.
func SafeEnvironment(dir string, overlay runenv.Overlay, extra ...[]string) []string {
	return gitSafeEnvWithOverlay(dir, overlay, extra...)
}
func safeAmbientEnvironment() []string {
	var safe []string
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		upper := strings.ToUpper(key)
		if equalAnyFold(key, "PATH", "HOME", "USERPROFILE", "TEMP", "TMP", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PSMODULEPATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG") || strings.HasPrefix(upper, "LC_") {
			safe = append(safe, entry)
		}
	}
	return safe
}

func equalAnyFold(value string, choices ...string) bool {
	for _, choice := range choices {
		if strings.EqualFold(value, choice) {
			return true
		}
	}
	return false
}
