package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/git"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
)

func (a *Admission) loadReceipts() error {
	raw, err := os.ReadFile(a.receiptFile)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, &a.receipts)
}
func (a *Admission) saveReceipts() error {
	if a.receiptFile == "" {
		return nil
	}
	raw, err := json.Marshal(a.receipts)
	if err != nil {
		return err
	}
	tmp := a.receiptFile + ".tmp"
	if err = os.WriteFile(tmp, raw, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, a.receiptFile)
}

// PushNotification is the accepted ref update delivered after Git has changed
// the gate. Admission is deliberately separate: a notification can never
// authorize a ref update.
type PushNotification struct {
	Gate, Ref, Old, New, Token string
	Options                    []string
}

// Admission owns the receive-hook trust boundary. Tokens are issued by the
// managed hook and receipts survive daemon restarts.
type Admission struct {
	auth        *ipc.Authenticator
	notify      func(context.Context, PushNotification) error
	mu          sync.Mutex
	receipts    map[string]ipc.AdmitPushParams
	receiptFile string
	loadErr     error
}

func NewAdmission(server *ipc.Server, notify func(context.Context, PushNotification) error) *Admission {
	return newAdmission(server, notify, "")
}

// NewAdmissionWithStore retains admitted updates across daemon restarts. The
// receipt is removed only after a matching notification is accepted.
func NewAdmissionWithStore(server *ipc.Server, notify func(context.Context, PushNotification) error, file string) *Admission {
	return newAdmission(server, notify, file)
}

func newAdmission(server *ipc.Server, notify func(context.Context, PushNotification) error, file string) *Admission {
	a := &Admission{auth: ipc.NewAuthenticator(), notify: notify, receipts: make(map[string]ipc.AdmitPushParams), receiptFile: file}
	if file != "" {
		a.loadErr = a.loadReceipts()
	}
	server.Handle(ipc.MethodAdmitPush, a.admit)
	server.Handle(ipc.MethodNotifyPush, a.notifyPush)
	server.Handle(ipc.MethodIssuePushToken, a.issue)
	return a
}

// InitError reports unreadable persisted receipts before the daemon announces readiness.
func (a *Admission) InitError() error { return a.loadErr }

// ReconcileOnce retries receipts only while the gate still contains the exact admitted ref.
func (a *Admission) ReconcileOnce(ctx context.Context) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	for token, receipt := range a.receipts {
		current, err := git.RunBare(ctx, receipt.Gate, "rev-parse", receipt.Ref)
		if err != nil || strings.TrimSpace(current) != receipt.New {
			delete(a.receipts, token)
			if err := a.saveReceipts(); err != nil {
				return fmt.Errorf("discard stale admission receipt: %w", err)
			}
			continue
		}
		if a.notify == nil {
			continue
		}
		if err := a.notify(ctx, PushNotification{Gate: receipt.Gate, Ref: receipt.Ref, Old: receipt.Old, New: receipt.New, Token: token}); err != nil {
			return err
		}
		delete(a.receipts, token)
		if err := a.saveReceipts(); err != nil {
			return fmt.Errorf("remove admission receipt: %w", err)
		}
	}
	return nil
}
func (a *Admission) Issue(gate, ref string) (string, error) {
	if a == nil || a.auth == nil {
		return "", errors.New("admission is not initialized")
	}
	return a.auth.Issue(gate, ref)
}

// managedHookPeer proves that a token request came through a managed receive
// hook, rather than merely from another process owned by the same user.
func managedHookPeer(pid int, gate string) bool {
	if pid <= 0 {
		return false
	}
	gate = cleanPath(gate)
	var managedHook bool
	expected := map[string]bool{cleanPath(filepath.Join(gate, "hooks", "pre-receive")): true, cleanPath(filepath.Join(gate, "hooks", "post-receive")): true}
	for depth := 0; pid > 1 && depth < 64; depth++ {
		ppid, command, err := processInfo(pid)
		if err != nil {
			return false
		}
		env, envErr := processEnvironment(pid)
		if envErr != nil || strings.Contains(string(env), "SD_PARENT_RUN_ID=") {
			return false
		}
		fields := strings.Fields(command)
		if len(fields) > 0 {
			executable := cleanPath(fields[0])
			for hook := range expected {
				if executable == hook || strings.Contains(string(env), "SD_MANAGED_HOOK="+hook) {
					managedHook = true
				}
			}
		}
		pid = ppid
	}
	return managedHook
}

func processInfo(pid int) (int, string, error) {
	out, err := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "ppid=,command=").Output()
	if err != nil {
		return 0, "", err
	}
	fields := strings.Fields(string(out))
	if len(fields) < 2 {
		return 0, "", errors.New("process information is incomplete")
	}
	parent, err := strconv.Atoi(fields[0])
	if err != nil {
		return 0, "", err
	}
	return parent, strings.Join(fields[1:], " "), nil
}

func cleanPath(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	cleaned, err := filepath.Abs(value)
	if err != nil {
		return filepath.Clean(value)
	}
	return filepath.Clean(cleaned)
}

// AuthorizeMutationPeer permits only the Safety Dance CLI and rejects any
// validation descendant carrying the parent-run marker.
func AuthorizeMutationPeer(pid int) error {
	if runtime.GOOS == "windows" || pid <= 0 {
		return errors.New("unsupported or unauthenticated IPC peer")
	}
	var cliPeer bool
	for depth := 0; pid > 1 && depth < 64; depth++ {
		parent, command, err := processInfo(pid)
		if err != nil {
			return err
		}
		env, envErr := processEnvironment(pid)
		if envErr != nil {
			return fmt.Errorf("cannot verify IPC peer environment: %w", envErr)
		}
		if strings.Contains(string(env), "SD_PARENT_RUN_ID=") {
			return errors.New("nested validation process cannot mutate daemon state")
		}
		fields := strings.Fields(command)
		if len(fields) > 0 {
			name := filepath.Base(fields[0])
			if name == "safety-dance" || name == "safety-dance.exe" {
				cliPeer = true
			}
		}
		pid = parent
	}
	if cliPeer {
		return nil
	}
	return errors.New("mutation requires a Safety Dance CLI peer")
}
func (a *Admission) issue(ctx context.Context, raw json.RawMessage) (interface{}, error) {
	peer := ipc.PeerPID(ctx)
	if peer <= 0 {
		return nil, errors.New("unauthenticated IPC peer")
	}
	var p ipc.IssuePushTokenParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, err
	}
	if !managedHookPeer(peer, p.Gate) {
		return nil, errors.New("push-token issuance requires a managed git hook")
	}
	token, err := a.Issue(p.Gate, p.Ref)
	if err != nil {
		return nil, err
	}
	return ipc.IssuePushTokenResult{Token: token}, nil
}

func (a *Admission) admit(ctx context.Context, raw json.RawMessage) (interface{}, error) {
	var p ipc.AdmitPushParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, fmt.Errorf("decode admission: %w", err)
	}
	if strings.TrimSpace(p.Old) == "" || strings.TrimSpace(p.New) == "" {
		return nil, errors.New("old and new revisions are required")
	}
	if err := ipc.AuthenticateAdmission(ctx, a.auth, p.Gate, p.Ref, p.Token); err != nil {
		return nil, err
	}
	a.mu.Lock()
	a.receipts[p.Token] = p
	saveErr := a.saveReceipts()
	if saveErr != nil {
		delete(a.receipts, p.Token)
	}
	a.mu.Unlock()
	if saveErr != nil {
		return nil, fmt.Errorf("persist admission receipt: %w", saveErr)
	}
	return ipc.AdmitPushResult{}, nil
}

func (a *Admission) notifyPush(ctx context.Context, raw json.RawMessage) (interface{}, error) {
	if ipc.PeerPID(ctx) <= 0 {
		return nil, errors.New("unauthenticated IPC peer")
	}
	var p ipc.NotifyPushParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, fmt.Errorf("decode notification: %w", err)
	}
	if strings.TrimSpace(p.Gate) == "" || strings.TrimSpace(p.Ref) == "" || strings.TrimSpace(p.New) == "" {
		return nil, errors.New("gate, ref, and new revision are required")
	}
	var receipt ipc.AdmitPushParams
	var token string
	for _, option := range p.PushOptions {
		if strings.HasPrefix(option, "safety-dance-token=") {
			token = strings.TrimPrefix(option, "safety-dance-token=")
			break
		}
	}
	if token == "" {
		return nil, errors.New("admission receipt is required")
	}
	a.mu.Lock()
	receipt, ok := a.receipts[token]
	if !ok || receipt.Gate != p.Gate || receipt.Ref != p.Ref || receipt.Old != p.Old || receipt.New != p.New {
		a.mu.Unlock()
		return nil, errors.New("notification does not match admitted update")
	}
	a.mu.Unlock()
	if a.notify != nil {
		if err := a.notify(ctx, PushNotification{Gate: p.Gate, Ref: p.Ref, Old: p.Old, New: p.New, Token: token, Options: append([]string(nil), p.PushOptions...)}); err != nil {
			return nil, err
		}
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if current, exists := a.receipts[token]; !exists || current.Gate != receipt.Gate || current.Ref != receipt.Ref || current.New != receipt.New {
		return nil, errors.New("admission receipt changed while processing notification")
	}
	delete(a.receipts, token)
	if err := a.saveReceipts(); err != nil {
		return nil, fmt.Errorf("remove admission receipt: %w", err)
	}
	return map[string]bool{"ok": true}, nil
}
