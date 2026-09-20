package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
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
	claimed     map[string]bool
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
	a := &Admission{auth: ipc.NewAuthenticator(), notify: notify, receipts: make(map[string]ipc.AdmitPushParams), claimed: make(map[string]bool), receiptFile: file}
	if file != "" {
		a.loadErr = a.loadReceipts()
	}
	server.Handle(ipc.MethodAdmitPush, a.admit)
	server.Handle(ipc.MethodNotifyPush, a.notifyPush)
	server.Handle(ipc.MethodRevokePushReceipt, a.revoke)
	server.Handle(ipc.MethodIssuePushToken, a.issue)
	return a
}

// InitError reports unreadable persisted receipts before the daemon announces readiness.
func (a *Admission) InitError() error { return a.loadErr }

// ReconcileOnce retries receipts without treating a transient pre-receive state as stale.
func (a *Admission) ReconcileOnce(ctx context.Context) error {
	a.mu.Lock()
	tokens := make([]string, 0, len(a.receipts))
	for token := range a.receipts {
		if !a.claimed[token] {
			a.claimed[token] = true
			tokens = append(tokens, token)
		}
	}
	a.mu.Unlock()
	for _, token := range tokens {
		a.mu.Lock()
		receipt, exists := a.receipts[token]
		a.mu.Unlock()
		if !exists {
			continue
		}
		current, err := git.RunBare(ctx, receipt.Gate, "rev-parse", receipt.Ref)
		if err != nil || strings.TrimSpace(current) != receipt.New {
			a.mu.Lock()
			delete(a.claimed, token)
			a.mu.Unlock()
			continue
		}
		if a.notify == nil {
			a.mu.Lock()
			delete(a.claimed, token)
			a.mu.Unlock()
			continue
		}
		if err := a.notify(ctx, PushNotification{Gate: receipt.Gate, Ref: receipt.Ref, Old: receipt.Old, New: receipt.New, Token: token}); err != nil {
			a.mu.Lock()
			delete(a.claimed, token)
			a.mu.Unlock()
			return err
		}
		a.mu.Lock()
		if currentReceipt, ok := a.receipts[token]; ok && currentReceipt.Gate == receipt.Gate && currentReceipt.Ref == receipt.Ref && currentReceipt.New == receipt.New {
			delete(a.receipts, token)
			delete(a.claimed, token)
			if err := a.saveReceipts(); err != nil {
				a.mu.Unlock()
				return fmt.Errorf("remove admission receipt: %w", err)
			}
		} else {
			delete(a.claimed, token)
		}
		a.mu.Unlock()
	}
	return nil
}

func (a *Admission) Issue(gate, ref string) (string, error) {
	if a == nil || a.auth == nil {
		return "", errors.New("admission is not initialized")
	}
	return a.auth.Issue(gate, ref)
}

// managedHookPeer proves that a token request came through a managed receive hook.
func managedHookPeer(pid int, gate string) bool {
	if pid <= 0 {
		return false
	}
	gate = cleanPath(gate)
	expected := map[string]bool{cleanPath(filepath.Join(gate, "hooks", "pre-receive")): true, cleanPath(filepath.Join(gate, "hooks", "post-receive")): true}
	managedHook, gitReceive := false, false
	for depth := 0; pid > 1 && depth < 64; depth++ {
		ppid, command, err := processInfoFunc(pid)
		if err != nil {
			return false
		}
		if strings.Contains(command, "SD_PARENT_RUN_ID=") {
			return false
		}
		if env, envErr := processEnvironmentFunc(pid); envErr == nil && (environmentHas(env, "SD_PARENT_RUN_ID=") || environmentHas(env, "SD_MANAGED_HOOK=")) {
			return false
		}
		if commandHasExecutable(command, expected) {
			managedHook = true
		}
		if isGitReceiveCommand(command) {
			gitReceive = true
		}
		pid = ppid
	}
	return managedHook && gitReceive
}

// processInfoFunc is a test seam for deterministic ancestry cases. Production
// authorization always uses the platform process table implementation.
var processInfoFunc = processInfo
var processEnvironmentFunc = processEnvironment

func commandHasExecutable(command string, expected map[string]bool) bool {
	for _, field := range commandLineFields(command) {
		field = strings.Trim(field, "\"'(),")
		if expected[cleanPath(field)] {
			return true
		}
	}
	return false
}

// commandLineFields keeps quoted Windows paths intact. strings.Fields splits a
// hook path such as C:\\Users\\A User\\... and makes ancestry authorization fail.
func commandLineFields(command string) []string {
	var fields []string
	var b strings.Builder
	var quote rune
	flush := func() {
		if b.Len() > 0 {
			fields = append(fields, b.String())
			b.Reset()
		}
	}
	for _, r := range command {
		switch {
		case quote != 0:
			if r == quote {
				quote = 0
			} else {
				b.WriteRune(r)
			}
		case r == '\'' || r == '"':
			quote = r
		case r == ' ' || r == '\t' || r == '\r' || r == '\n':
			flush()
		default:
			b.WriteRune(r)
		}
	}
	flush()
	return fields
}

func isGitReceiveCommand(command string) bool {
	for _, field := range strings.Fields(command) {
		field = strings.Trim(field, "\"'(),")
		name := filepath.Base(field)
		if name == "git-receive-pack" || name == "git-receive-pack.exe" {
			return true
		}
	}
	return false
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
	if pid <= 0 {
		return errors.New("unsupported or unauthenticated IPC peer")
	}
	var cliPeer bool
	for depth := 0; pid > 1 && depth < 64; depth++ {
		parent, command, err := processInfoFunc(pid)
		if err != nil {
			return err
		}
		env, envErr := processEnvironment(pid)
		if envErr != nil {
			return fmt.Errorf("cannot verify IPC peer environment: %w", envErr)
		}
		if environmentHas(env, "SD_PARENT_RUN_ID=") {
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
	if strings.Trim(p.New, "0") == "" {
		return nil, errors.New("branch deletion is not supported")
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

func (a *Admission) revoke(ctx context.Context, raw json.RawMessage) (interface{}, error) {
	if ipc.PeerPID(ctx) <= 0 {
		return nil, errors.New("unauthenticated IPC peer")
	}
	var p ipc.RevokePushReceiptParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, fmt.Errorf("decode receipt revocation: %w", err)
	}
	if p.Gate == "" || p.Ref == "" || p.Token == "" {
		return nil, errors.New("gate, ref, and token are required")
	}
	a.mu.Lock()
	receipt, ok := a.receipts[p.Token]
	if !ok || receipt.Gate != p.Gate || receipt.Ref != p.Ref || receipt.Old != p.Old || receipt.New != p.New {
		a.mu.Unlock()
		return nil, errors.New("receipt does not match admitted update")
	}
	wasClaimed := a.claimed[p.Token]
	delete(a.receipts, p.Token)
	delete(a.claimed, p.Token)
	if err := a.saveReceipts(); err != nil {
		a.receipts[p.Token] = receipt
		if wasClaimed {
			a.claimed[p.Token] = true
		}
		a.mu.Unlock()
		return nil, fmt.Errorf("persist receipt revocation: %w", err)
	}
	a.mu.Unlock()
	return map[string]bool{"ok": true}, nil
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
	if a.claimed[token] {
		a.mu.Unlock()
		return nil, errors.New("notification is already being processed")
	}
	// Claim before invoking the run-start callback. A second post-receive
	// delivery must not cancel or replace the run started by the first one.
	a.claimed[token] = true
	a.mu.Unlock()
	if a.notify != nil {
		if err := a.notify(ctx, PushNotification{Gate: p.Gate, Ref: p.Ref, Old: p.Old, New: p.New, Token: token, Options: append([]string(nil), p.PushOptions...)}); err != nil {
			a.mu.Lock()
			delete(a.claimed, token)
			a.mu.Unlock()
			return nil, err
		}
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if current, exists := a.receipts[token]; !exists || current.Gate != receipt.Gate || current.Ref != receipt.Ref || current.New != receipt.New {
		delete(a.claimed, token)
		return nil, errors.New("admission receipt changed while processing notification")
	}
	delete(a.receipts, token)
	delete(a.claimed, token)
	if err := a.saveReceipts(); err != nil {
		return nil, fmt.Errorf("remove admission receipt: %w", err)
	}
	return map[string]bool{"ok": true}, nil
}
