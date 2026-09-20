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
	dir := filepath.Dir(a.receiptFile)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".admission-receipts-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(raw); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, a.receiptFile); err != nil {
		return err
	}
	d, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer d.Close()
	return d.Sync()
}

// ImportGateReceipts adopts authenticated pre-receive receipts left in a gate
// when Git accepted the ref but the daemon was unavailable for post-receive.
func (a *Admission) ImportGateReceipts(ctx context.Context, gates []string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, gate := range gates {
		raw, err := os.ReadFile(filepath.Join(gate, ".safety-dance-receipts"))
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		for _, line := range strings.Split(string(raw), "\n") {
			fields := strings.Fields(line)
			if len(fields) != 4 {
				continue
			}
			current, err := git.RunBare(ctx, gate, "rev-parse", fields[2])
			if err != nil || strings.TrimSpace(current) != fields[1] {
				continue
			}
			if existing, exists := a.receipts[fields[3]]; exists {
				if existing.Gate != gate || existing.Ref != fields[2] || existing.Old != fields[0] || existing.New != fields[1] {
					return fmt.Errorf("gate receipt %s conflicts with persisted admission", fields[3])
				}
				// Keep notification metadata already persisted by the daemon, but
				// promote the matching pre-receive receipt to accepted custody.
				if !existing.Accepted {
					existing.Accepted = true
					a.receipts[fields[3]] = existing
				}
				continue
			}
			a.receipts[fields[3]] = ipc.AdmitPushParams{Gate: gate, Ref: fields[2], Old: fields[0], New: fields[1], Token: fields[3], Accepted: true}
		}
	}
	return a.saveReceipts()
}

// PushNotification is the accepted ref update delivered after Git has changed
// the gate. Admission is deliberately separate: a notification can never
// authorize a ref update.
type PushNotification struct {
	Gate, Ref, Old, New, Token string
	Options                    []string
	ValidationGeneration       string
}

// Admission owns the receive-hook trust boundary. Tokens are issued by the
// managed hook and receipts survive daemon restarts.
type Admission struct {
	auth        *ipc.Authenticator
	notify      func(context.Context, PushNotification) error
	deferred    bool
	mu          sync.Mutex
	receipts    map[string]ipc.AdmitPushParams
	claimed     map[string]bool
	receiptFile string
	loadErr     error
}

// DeferNotifications keeps an accepted receipt durably queued so the
// reconciliation worker, not post-receive, performs run construction.
func (a *Admission) DeferNotifications() { a.deferred = true }

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

// ReconcileOnce retries only receipts durably marked accepted by post-receive.
func (a *Admission) ReconcileOnce(ctx context.Context) error {
	// Take a fixed snapshot before doing any external work. In particular, do
	// not select the next receipt by repeatedly scanning the live map: a failed
	// receipt must remain pending for the next ticker tick, not spin forever.
	type pendingReceipt struct {
		token   string
		receipt ipc.AdmitPushParams
	}
	var pending []pendingReceipt
	a.mu.Lock()
	for token, receipt := range a.receipts {
		if receipt.Accepted && !a.claimed[token] {
			a.claimed[token] = true
			pending = append(pending, pendingReceipt{token: token, receipt: receipt})
		}
	}
	a.mu.Unlock()

	var errs []error
	for _, item := range pending {
		token, receipt := item.token, item.receipt
		current, err := git.RunBare(ctx, receipt.Gate, "rev-parse", receipt.Ref)
		if err != nil {
			a.releaseClaim(token)
			errs = append(errs, fmt.Errorf("reconcile receipt %s: resolve ref: %w", token, err))
			continue
		}
		if strings.TrimSpace(current) != receipt.New {
			a.releaseClaim(token)
			errs = append(errs, fmt.Errorf("reconcile receipt %s: ref %s is %s, want %s", token, receipt.Ref, strings.TrimSpace(current), receipt.New))
			continue
		}
		if a.notify == nil {
			a.releaseClaim(token)
			errs = append(errs, fmt.Errorf("reconcile receipt %s: notification callback is nil", token))
			continue
		}
		if err := a.notify(ctx, PushNotification{Gate: receipt.Gate, Ref: receipt.Ref, Old: receipt.Old, New: receipt.New, Token: token, Options: append([]string(nil), receipt.PushOptions...), ValidationGeneration: receipt.ValidationGeneration}); err != nil {
			a.releaseClaim(token)
			errs = append(errs, fmt.Errorf("reconcile receipt %s: notify: %w", token, err))
			continue
		}

		a.mu.Lock()
		currentReceipt, ok := a.receipts[token]
		matches := ok && currentReceipt.Gate == receipt.Gate && currentReceipt.Ref == receipt.Ref && currentReceipt.New == receipt.New
		if !matches {
			delete(a.claimed, token)
			a.mu.Unlock()
			errs = append(errs, fmt.Errorf("reconcile receipt %s: receipt changed while processing", token))
			continue
		}
		delete(a.receipts, token)
		delete(a.claimed, token)
		if err := a.saveReceipts(); err != nil {
			// Restore custody in memory before returning. The receipt remains
			// eligible for a later reconciliation attempt.
			a.receipts[token] = currentReceipt
			errs = append(errs, fmt.Errorf("reconcile receipt %s: remove admission receipt: %w", token, err))
		}
		a.mu.Unlock()
	}
	return errors.Join(errs...)
}

func (a *Admission) releaseClaim(token string) {
	a.mu.Lock()
	delete(a.claimed, token)
	a.mu.Unlock()
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
	expected := map[string]bool{cleanPath(filepath.Join(gate, "hooks", "pre-receive")): true, cleanPath(filepath.Join(gate, "hooks", "post-receive")): true, "hooks/pre-receive": true, "hooks/post-receive": true}
	managedHook, gitReceive := false, false
	for depth := 0; pid > 1 && depth < 64; depth++ {
		ppid, command, err := processInfoFunc(pid)
		if err != nil {
			return false
		}
		if strings.Contains(command, "SD_PARENT_RUN_ID=") || strings.Contains(command, "SD_MANAGED_HOOK=") {
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
		if expected[field] || expected[cleanPath(field)] {
			return true
		}
		base := filepath.Base(field)
		if base == "pre-receive" || base == "post-receive" {
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
	if !managedHookPeer(ipc.PeerPID(ctx), p.Gate) {
		return nil, errors.New("push admission requires a managed git hook")
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
	var p ipc.RevokePushReceiptParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, fmt.Errorf("decode receipt revocation: %w", err)
	}
	if !managedHookPeer(ipc.PeerPID(ctx), p.Gate) {
		return nil, errors.New("receipt revocation requires a managed git hook")
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
	var p ipc.NotifyPushParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, fmt.Errorf("decode notification: %w", err)
	}
	if !managedHookPeer(ipc.PeerPID(ctx), p.Gate) {
		return nil, errors.New("notification requires a managed git hook")
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
	if p.ValidationGeneration == "" {
		for _, option := range p.PushOptions {
			if strings.HasPrefix(option, "safety-dance-validation-generation=") {
				p.ValidationGeneration = strings.TrimPrefix(option, "safety-dance-validation-generation=")
				break
			}
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
	receipt.PushOptions = append([]string(nil), p.PushOptions...)
	receipt.ValidationGeneration = p.ValidationGeneration
	receipt.Accepted = true
	a.receipts[token] = receipt
	if err := a.saveReceipts(); err != nil {
		a.mu.Unlock()
		return nil, fmt.Errorf("persist accepted receipt: %w", err)
	}
	a.claimed[token] = true
	a.mu.Unlock()
	if a.deferred {
		a.mu.Lock()
		delete(a.claimed, token)
		_ = a.saveReceipts()
		a.mu.Unlock()
		return map[string]bool{"ok": true}, nil
	}
	if a.notify != nil {
		if err := a.notify(ctx, PushNotification{Gate: p.Gate, Ref: p.Ref, Old: p.Old, New: p.New, Token: token, Options: append([]string(nil), p.PushOptions...), ValidationGeneration: p.ValidationGeneration}); err != nil {
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
		a.receipts[token] = receipt
		return nil, fmt.Errorf("remove admission receipt: %w", err)
	}
	return map[string]bool{"ok": true}, nil
}
