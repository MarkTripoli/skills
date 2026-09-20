package git

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var runGit = RunBare

const gateConfigStampFile = "safety-dance-gate-config"
const preservedPreReceiveHook = "pre-receive.safety-dance-user"

// PreReceiveHookScript returns the fail-closed admission hook that runs before
// Git mutates any managed gate ref. The daemon authenticates the hook process's
// ancestry, so a validation-step descendant cannot bypass CLI guards with a
// direct push.
func PreReceiveHookScript() string {
	exe, err := os.Executable()
	if err != nil {
		exe = "safety-dance"
	}
	return preReceiveHookScript(exe)
}

// PreReceiveHookScriptForExecutable renders the managed hook with an explicit
// // executable for private integration tests.
func PreReceiveHookScriptForExecutable(executable string) string {
	return preReceiveHookScript(executable)
}

func preReceiveHookScript(command string) string {
	return `#!/bin/sh
# safety-dance pre-receive hook
SD_BIN=` + shellSingleQuote(command) + `
if [ ! -f "$SD_BIN" ]; then SD_BIN="$(command -v safety-dance 2>/dev/null || echo safety-dance)"; fi
GATE_DIR=$(git rev-parse --absolute-git-dir 2>/dev/null || :)
case "$GATE_DIR" in /*) ;; *) HOOK_DIR=${0%/*}; GATE_DIR=$(cd "$HOOK_DIR/.." 2>/dev/null && pwd -P || :);; esac
INPUT=$(mktemp "$GATE_DIR/.safety-dance-receive.XXXXXX") || exit 1
ACCEPTED=$(mktemp "$GATE_DIR/.safety-dance-accepted.XXXXXX") || { rm -f "$INPUT"; exit 1; }
RECEIPTS="$GATE_DIR/.safety-dance-receipts"
LOCK="$GATE_DIR/.safety-dance-receipts.lock"
LOCK_OWNED=0
cleanup() { rm -f "$INPUT" "$ACCEPTED"; if [ "$LOCK_OWNED" -eq 1 ]; then rm -f "$LOCK"; fi; }
trap cleanup EXIT INT TERM HUP
lock_receipts() {
  i=0
  while :; do
    if (set -C; printf '%s\n' "$$" > "$LOCK") 2>/dev/null; then LOCK_OWNED=1; return 0; fi
    i=$((i + 1)); [ "$i" -ge 300 ] && return 1
    owner=$(cat "$LOCK" 2>/dev/null || :)
    case "$owner" in ''|*[!0-9]*) stale=0;; *) kill -0 "$owner" 2>/dev/null && stale=0 || stale=1;; esac
    if [ "$stale" -eq 1 ]; then rm -f "$LOCK"; fi
    sleep 0.1
  done
}
unlock_receipts() { if [ "$LOCK_OWNED" -eq 1 ]; then rm -f "$LOCK"; LOCK_OWNED=0; fi; }
remove_receipt() {
  old=$1; new=$2; ref=$3; tok=$4
  lock_receipts || return 1
  status=0
  if [ -f "$RECEIPTS" ]; then
    out=$(mktemp "$GATE_DIR/.safety-dance-receipts.XXXXXX") || status=1
    if [ "$status" -eq 0 ] && ! awk -v o="$old" -v n="$new" -v r="$ref" -v t="$tok" '$1!=o || $2!=n || $3!=r || $4!=t' "$RECEIPTS" > "$out"; then status=1; fi
    if [ "$status" -eq 0 ] && ! mv "$out" "$RECEIPTS"; then status=1; fi
    [ "$status" -eq 0 ] || rm -f "$out"
  fi
  unlock_receipts
  return "$status"
}
revoke_one() {
  old=$1; new=$2; ref=$3; token=$4
  "$SD_BIN" daemon revoke-push-receipt --gate "$GATE_DIR" --ref "$ref" --old "$old" --new "$new" --token "$token" >/dev/null 2>&1
}
revoke_accepted() {
  failed=0
  while read receipt_line; do
    set -- $receipt_line; oldrev=$1; newrev=$2; refname=$3; token=$4
    [ -n "$token" ] || continue
    if revoke_one "$oldrev" "$newrev" "$refname" "$token" && remove_receipt "$oldrev" "$newrev" "$refname" "$token"; then :; else failed=1; fi
  done < "$ACCEPTED"
  cleanup
  return "$failed"
}
if ! cat > "$INPUT"; then revoke_accepted; exit 1; fi
while read line; do
  set -- $line; oldrev=$1; newrev=$2; refname=$3
  token=""; token_option_present=0
  if [ "${GIT_PUSH_OPTION_COUNT:-0}" -gt 0 ]; then
    i=0
    while [ "$i" -lt "${GIT_PUSH_OPTION_COUNT:-0}" ]; do
      opt=$(printenv "GIT_PUSH_OPTION_$i" 2>/dev/null || :)
      case "$opt" in safety-dance-token=*) token=${opt#*=}; token_option_present=1;; esac
      i=$((i + 1))
    done
  fi
  if [ "$token_option_present" -eq 1 ] && [ -z "$token" ]; then revoke_accepted; printf 'safety-dance: empty admission token\n' >&2; exit 1; fi
  if [ -z "$token" ]; then
    token=$("$SD_BIN" daemon issue-push-token --gate "$GATE_DIR" --ref "$refname" 2>/dev/null) || { revoke_accepted; printf 'safety-dance: could not obtain admission token\n' >&2; exit 1; }
  fi
  out=$(printf '%s\n' "$line" | "$SD_BIN" daemon admit-push --gate "$GATE_DIR" --ref "$refname" --old "$oldrev" --new "$newrev" --token "$token" 2>&1)
  status=$?
  if [ $status -ne 0 ]; then revoke_accepted; printf 'safety-dance: gate push refused before ref mutation:\n%s\n' "$out" >&2; exit $status; fi
  if ! printf '%s\t%s\t%s\t%s\n' "$oldrev" "$newrev" "$refname" "$token" >> "$ACCEPTED"; then revoke_one "$oldrev" "$newrev" "$refname" "$token"; revoke_accepted; exit 1; fi
  lock_receipts || { revoke_accepted; printf '%s\n' 'safety-dance: receipt lock unavailable' >&2; exit 1; }
  if ! printf '%s\t%s\t%s\t%s\n' "$oldrev" "$newrev" "$refname" "$token" >> "$RECEIPTS"; then unlock_receipts; revoke_accepted; printf '%s\n' 'safety-dance: could not persist admission receipt' >&2; exit 1; fi
  unlock_receipts
done < "$INPUT"
USER_HOOK="$GATE_DIR/hooks/pre-receive.safety-dance-user"
if [ -x "$USER_HOOK" ]; then
  "$USER_HOOK" < "$INPUT"; status=$?
  if [ $status -ne 0 ]; then revoke_accepted; exit $status; fi
fi
cleanup
exit 0
`
}

func postReceiveHookScript(command string) string {
	return `#!/bin/sh
# safety-dance post-receive hook
SD_BIN=` + shellSingleQuote(command) + `
if [ ! -f "$SD_BIN" ]; then SD_BIN="$(command -v safety-dance 2>/dev/null || echo safety-dance)"; fi
GATE_DIR=$(git rev-parse --absolute-git-dir 2>/dev/null || :)
case "$GATE_DIR" in /*) ;; *) HOOK_DIR=${0%/*}; GATE_DIR=$(cd "$HOOK_DIR/.." 2>/dev/null && pwd -P || :);; esac
LOG="$GATE_DIR/notify-push.log"
cat >&2 <<'BANNER'
 _____         __      ____ance
 / ___/____ ___ / /__   / __/ /_  ____ _____ ____
\__ \/ __ '__ \/ / _ \/ /_/ __ \/ __ '/ __ '/ _ \\
___/ / / / / / / /  __/ /_/ / / / /_/ / /_/ /  __/
/____/_/ /_/ /_/_/\___/\____/_/ /_/\__,_/\__, /\___/
                                       /____/

  * Pipeline started
  Run safety-dance to review.
BANNER
INPUT=$(mktemp "$GATE_DIR/.safety-dance-post.XXXXXX") || {
  printf '[%s] post-receive input capture failed; notifying directly\n' "$(date '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || echo unknown)" >> "$LOG"
  while read oldrev newrev refname; do
    [ -n "$refname" ] || continue
    if [ -f "$GATE_DIR/.safety-dance-receipts" ]; then token=$(awk -v o="$oldrev" -v n="$newrev" -v r="$refname" '$1==o && $2==n && $3==r {last=$4} END {print last}' "$GATE_DIR/.safety-dance-receipts"); fi
    set -- daemon notify-push --gate "$GATE_DIR" --ref "$refname" --old "$oldrev" --new "$newrev"
    [ -n "$token" ] && set -- "$@" --push-option "safety-dance-token=$token"
    i=0
    while [ "$i" -lt "${GIT_PUSH_OPTION_COUNT:-0}" ]; do opt=$(printenv "GIT_PUSH_OPTION_$i" 2>/dev/null || :); set -- "$@" --push-option "$opt"; i=$((i + 1)); done
    "$SD_BIN" "$@" >> "$LOG" 2>&1 || :
  done
  exit 0
}
RECEIPTS="$GATE_DIR/.safety-dance-receipts"
LOCK="$GATE_DIR/.safety-dance-receipts.lock"
LOCK_OWNED=0
cleanup_post() { rm -f "$INPUT"; if [ "$LOCK_OWNED" -eq 1 ]; then rm -f "$LOCK"; fi; }
trap cleanup_post EXIT INT TERM HUP
lock_age_stale() { return 1; }
lock_receipts() {
  i=0
  while :; do
    if (set -C; printf '%s\n' "$$" > "$LOCK") 2>/dev/null; then LOCK_OWNED=1; return 0; fi
    i=$((i + 1)); [ "$i" -ge 300 ] && return 1
    owner=$(cat "$LOCK" 2>/dev/null || :)
    case "$owner" in ''|*[!0-9]*) stale=0;; *) kill -0 "$owner" 2>/dev/null && stale=0 || stale=1;; esac
    if [ "$stale" -eq 1 ]; then rm -f "$LOCK"; fi
    sleep 0.1
  done
}
unlock_receipts() { if [ "$LOCK_OWNED" -eq 1 ]; then rm -f "$LOCK"; LOCK_OWNED=0; fi; }
if ! cat > "$INPUT"; then
  printf '[%s] post-receive input capture failed after opening file; retrying from receipts\n' "$(date '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || echo unknown)" >> "$LOG"
  while read oldrev newrev refname; do
    token=""; [ -f "$RECEIPTS" ] && token=$(awk -v o="$oldrev" -v n="$newrev" -v r="$refname" '$1==o && $2==n && $3==r {last=$4} END {print last}' "$RECEIPTS")
    [ -n "$token" ] && "$SD_BIN" daemon notify-push --gate "$GATE_DIR" --ref "$refname" --old "$oldrev" --new "$newrev" --push-option "safety-dance-token=$token" >> "$LOG" 2>&1 || :
  done
  exit 0
fi
while read oldrev newrev refname; do
  set -- --gate "$GATE_DIR" --ref "$refname" --old "$oldrev" --new "$newrev"
  i=0
  token=""
  while [ "$i" -lt "${GIT_PUSH_OPTION_COUNT:-0}" ]; do opt=$(printenv "GIT_PUSH_OPTION_$i" 2>/dev/null || :); case "$opt" in safety-dance-token=*) token=${opt#*=};; esac; set -- "$@" --push-option "$opt"; i=$((i + 1)); done
  (
  if [ -z "${token:-}" ] && [ -f "$RECEIPTS" ]; then
    lock_receipts || exit 0
    # Keep the newest matching receipt: a failed cleanup may leave an older
    # revoked token, while the accepted update is the last append.
    token=$(awk -v o="$oldrev" -v n="$newrev" -v r="$refname" '$1==o && $2==n && $3==r {last=$4} END {print last}' "$RECEIPTS")
    unlock_receipts
    if [ -n "${token:-}" ]; then set -- "$@" --push-option "safety-dance-token=$token"; fi
  fi
  out=$("$SD_BIN" daemon notify-push "$@" 2>&1); status=$?
  if [ $status -eq 0 ] && [ -n "${token:-}" ]; then
    lock_receipts || status=1
    if [ $status -eq 0 ]; then
      receipts_tmp=$(mktemp "$GATE_DIR/.safety-dance-receipts.XXXXXX") || status=1
      if [ $status -eq 0 ]; then awk -v o="$oldrev" -v n="$newrev" -v r="$refname" -v t="$token" '$1!=o || $2!=n || $3!=r || $4!=t' "$RECEIPTS" > "$receipts_tmp" && mv "$receipts_tmp" "$RECEIPTS" || { rm -f "$receipts_tmp"; status=1; }; fi
      unlock_receipts
    fi
  fi
  if [ $status -ne 0 ]; then printf '[%s] notify-push failed for %s (exit %d)\n%s\n\n' "$(date '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || echo unknown)" "$refname" "$status" "$out" >> "$LOG"; printf 'safety-dance: notify-push failed for %s (exit %d); see %s\n%s\n' "$refname" "$status" "$LOG" "$out" >&2; fi
  )
done < "$INPUT"
USER_HOOK="$GATE_DIR/hooks/post-receive.safety-dance-user"
if [ -x "$USER_HOOK" ]; then "$USER_HOOK" < "$INPUT" || true; fi
exit 0
`
}

func isManagedPreReceiveHook(content []byte) bool {
	text := string(content)
	return strings.Contains(text, "# safety-dance pre-receive hook") && strings.Contains(text, "daemon admit-push")
}

// RefreshManagedPreReceiveHook installs or refreshes admission while preserving
// an existing user hook behind the managed wrapper.
func RefreshManagedPreReceiveHook(bareDir string) (bool, error) {
	hooksDir := filepath.Join(bareDir, "hooks")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		return false, err
	}
	hookPath := filepath.Join(hooksDir, "pre-receive")
	companion := filepath.Join(hooksDir, preservedPreReceiveHook)
	desired := []byte(PreReceiveHookScript())
	existing, err := os.ReadFile(hookPath)
	if err == nil {
		if string(existing) == string(desired) {
			return false, nil
		}
		if !isManagedPreReceiveHook(existing) {
			if _, companionErr := os.Stat(companion); companionErr == nil {
				return false, fmt.Errorf("preserve pre-receive hook: companion already exists")
			} else if !os.IsNotExist(companionErr) {
				return false, companionErr
			}
			if err := os.Rename(hookPath, companion); err != nil {
				return false, fmt.Errorf("preserve pre-receive hook: %w", err)
			}
			if err := writeGateFileAtomic(hookPath, desired, 0o755, ".pre-receive-*"); err != nil {
				_ = os.Rename(companion, hookPath)
				return false, err
			}
			return true, nil
		}
	} else if !os.IsNotExist(err) {
		return false, err
	}
	if err := writeGateFileAtomic(hookPath, desired, 0o755, ".pre-receive-*"); err != nil {
		return false, err
	}
	return true, nil
}

// RefreshManagedGateHooks owns the complete receive boundary.
func RefreshManagedGateHooks(bareDir string) error {
	if _, err := RefreshManagedPreReceiveHook(bareDir); err != nil {
		return err
	}
	if _, err := RefreshManagedPostReceiveHook(bareDir); err != nil {
		return err
	}
	return nil
}

// PostReceiveHookScript returns the shell script for the post-receive hook.
// The hook notifies the daemon via the CLI so it works across platforms.
// It resolves the gate to an absolute bare-repo path before notifying.
// It never blocks the push - notification failures are surfaced to stderr and
// appended to notify-push.log inside the bare repo.
func PostReceiveHookScript() string {
	exe, err := os.Executable()
	if err != nil {
		exe = "safety-dance"
	}
	return postReceiveHookScript(exe)
}

// PostReceiveHookScriptForExecutable renders the managed hook with an explicit
// // executable for private integration tests.
func PostReceiveHookScriptForExecutable(executable string) string {
	return postReceiveHookScript(executable)
}

func shellSingleQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func isManagedPostReceiveHook(content []byte) bool {
	text := string(content)
	return strings.Contains(text, "# safety-dance post-receive hook") && strings.Contains(text, "daemon notify-push")
}

// InstallPostReceiveHook writes the post-receive hook script into
// the hooks directory of a bare repo at bareDir.
func InstallPostReceiveHook(bareDir string) error {
	hooksDir := filepath.Join(bareDir, "hooks")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		return err
	}
	hookPath := filepath.Join(hooksDir, "post-receive")
	return writeHookFileAtomic(hookPath, []byte(PostReceiveHookScript()))
}

// RefreshManagedPostReceiveHook updates an existing safety-dance-owned hook.
// Custom hooks are left untouched; missing hooks are installed for gate repos.
func RefreshManagedPostReceiveHook(bareDir string) (bool, error) {
	hooksDir := filepath.Join(bareDir, "hooks")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		return false, err
	}
	hookPath := filepath.Join(hooksDir, "post-receive")
	companion := filepath.Join(hooksDir, "post-receive.safety-dance-user")
	desired := []byte(PostReceiveHookScript())
	existing, err := os.ReadFile(hookPath)
	if err == nil && string(existing) == string(desired) {
		return false, nil
	}
	if err == nil && !isManagedPostReceiveHook(existing) {
		if _, statErr := os.Stat(companion); statErr == nil {
			return false, fmt.Errorf("preserve post-receive hook: companion already exists")
		}
		if err := os.Rename(hookPath, companion); err != nil {
			return false, err
		}
	} else if err != nil && !os.IsNotExist(err) {
		return false, err
	}
	if err := writeHookFileAtomic(hookPath, desired); err != nil {
		if _, statErr := os.Stat(companion); statErr == nil {
			_ = os.Rename(companion, hookPath)
		}
		return false, err
	}
	return true, nil
}

func writeHookFileAtomic(path string, content []byte) error {
	return writeGateFileAtomic(path, content, 0o755, ".post-receive-*")
}

func writeGateFileAtomic(path string, content []byte, mode os.FileMode, pattern string) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, pattern)
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.Write(content); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(mode); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

// GateConfigCurrent is a subprocess-free restart check for a gate that has
// completed the current hook and config migration. The stamp includes the
// rendered managed hook and a version marker for the non-hook config contract.
// Bump the marker when receive or worktree config requirements change.
func GateConfigCurrent(bareDir string) bool {
	content, err := os.ReadFile(filepath.Join(bareDir, gateConfigStampFile))
	if err != nil || string(content) != gateConfigStampContent() {
		return false
	}
	// Admission is a security boundary, not merely notification. Verify the
	// managed pre-receive bytes on every startup so a stale stamp cannot hide a
	// removed or replaced guard. This remains filesystem-only for current gates.
	preReceive, err := os.ReadFile(filepath.Join(bareDir, "hooks", "pre-receive"))
	return err == nil && string(preReceive) == PreReceiveHookScript()
}

// MarkGateConfigCurrent atomically records a fully completed gate migration.
// Callers must validate the gate and finish every mutation before marking it.
func MarkGateConfigCurrent(bareDir string) error {
	return writeGateFileAtomic(
		filepath.Join(bareDir, gateConfigStampFile),
		[]byte(gateConfigStampContent()),
		0o644,
		".safety-dance-gate-config-*",
	)
}

func gateConfigStampContent() string {
	sum := sha256.Sum256([]byte("gate-config-v2\x00" + PreReceiveHookScript() + "\x00" + PostReceiveHookScript()))
	return fmt.Sprintf("v2:%x\n", sum)
}

// IsolateHooksPath protects the gate's post-receive hook from being
// disabled when a pipeline subprocess (e.g. husky during `pnpm install`)
// runs `git config core.hookspath` from inside a linked worktree.
//
// Linked worktrees share the bare's local config, so an unscoped
// `git config` write lands in <bareDir>/config and silently overrides
// the gate's hooks lookup. To defend against this, we enable
// extensions.worktreeConfig on the bare and pin core.hookspath in the
// bare's per-worktree config (<bareDir>/config.worktree). Per-worktree
// scope wins over local, so the bare's main worktree always resolves
// hooks to its own absolute hooks dir, regardless of what tools write
// to the shared config.
//
// Enabling extensions.worktreeConfig also forces us to relocate
// core.bare: once the extension is on, Git requires core.bare and
// core.worktree to live in per-worktree scope only. If we leave
// core.bare=true in shared config, it leaks into linked worktrees and
// causes commands like `git rebase` to fail with "this operation must
// be run in a work tree". It also prevents provider CLIs such as gh from
// resolving the repo from a CI step worktree cwd.
//
// Best-effort only: if the installed Git does not support
// `git config --worktree`, this returns nil without changing config.
//
// Idempotent: safe to call on an already-configured bare repo to
// migrate older installs when per-worktree config is available.
func IsolateHooksPath(ctx context.Context, bareDir string) error {
	_, err := EnsureHooksPathIsolation(ctx, bareDir)
	return err
}

func EnsureHooksPathIsolation(ctx context.Context, bareDir string) (bool, error) {
	if _, err := runGit(ctx, bareDir, "config", "--worktree", "--get", "core.hookspath"); err != nil {
		if isWorktreeConfigUnsupported(err) {
			return false, nil
		}
	}
	if _, err := runGit(ctx, bareDir, "config", "extensions.worktreeConfig", "true"); err != nil {
		return false, fmt.Errorf("enable worktree config: %w", err)
	}
	hooksDir, err := filepath.Abs(filepath.Join(bareDir, "hooks"))
	if err != nil {
		return false, fmt.Errorf("resolve hooks dir: %w", err)
	}
	if _, err := runGit(ctx, bareDir, "config", "--worktree", "core.hookspath", hooksDir); err != nil {
		if isWorktreeConfigUnsupported(err) {
			return false, nil
		}
		return false, fmt.Errorf("pin core.hookspath per-worktree: %w", err)
	}
	if err := relocateCoreBareToWorktreeScope(ctx, bareDir); err != nil {
		return false, err
	}
	return true, nil
}

// relocateCoreBareToWorktreeScope moves core.bare out of shared local config
// into the bare's per-worktree config. Required after enabling
// extensions.worktreeConfig: Git otherwise leaks core.bare=true from shared
// scope into linked worktrees, breaking rebase/merge/etc. and provider CLI
// repo resolution from worktree cwd.
func relocateCoreBareToWorktreeScope(ctx context.Context, bareDir string) error {
	if _, err := runGit(ctx, bareDir, "config", "--worktree", "core.bare", "true"); err != nil {
		if isWorktreeConfigUnsupported(err) {
			return nil
		}
		return fmt.Errorf("pin core.bare per-worktree: %w", err)
	}
	if _, err := runGit(ctx, bareDir, "config", "--local", "--unset", "core.bare"); err != nil {
		if isConfigKeyMissing(err) {
			return nil
		}
		return fmt.Errorf("unset shared core.bare: %w", err)
	}
	return nil
}

// isConfigKeyMissing reports whether a `git config --unset` failure is the
// benign "key not set" case (exit 5), which makes the unset idempotent.
func isConfigKeyMissing(err error) bool {
	var exitErr *exec.ExitError
	return errors.As(err, &exitErr) && exitErr.ExitCode() == 5
}

func isWorktreeConfigUnsupported(err error) bool {
	if errors.Is(err, exec.ErrNotFound) {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "unknown option") && strings.Contains(msg, "worktree")
}
