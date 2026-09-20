package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"

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
	Gate, Ref, Old, New string
	Options             []string
}

// Admission owns the receive-hook trust boundary. Tokens are issued by the
type Admission struct {
	auth        *ipc.Authenticator
	notify      func(context.Context, PushNotification) error
	mu          sync.Mutex
	receipts    map[string]ipc.AdmitPushParams
	receiptFile string
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
		_ = a.loadReceipts()
	}
	server.Handle(ipc.MethodAdmitPush, a.admit)
	server.Handle(ipc.MethodNotifyPush, a.notifyPush)
	server.Handle(ipc.MethodIssuePushToken, a.issue)
	return a
}

func (a *Admission) Issue(gate, ref string) (string, error) {
	if a == nil || a.auth == nil {
		return "", errors.New("admission is not initialized")
	}
	return a.auth.Issue(gate, ref)
}
func (a *Admission) issue(ctx context.Context, raw json.RawMessage) (interface{}, error) {
	if ipc.PeerPID(ctx) <= 0 {
		return nil, errors.New("unauthenticated IPC peer")
	}
	// The IPC transport authenticates the peer PID. Hook ancestry is checked
	// separately by the managed receive path; daemon startup must not depend on
	// an environment variable inherited by the long-lived server.
	if strings.TrimSpace(os.Getenv("SD_PARENT_RUN_ID")) != "" {
		return nil, errors.New("push-token issuance is restricted to the managed git hook")
	}
	var p ipc.IssuePushTokenParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, err
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
	defer a.mu.Unlock()
	receipt, ok := a.receipts[token]
	if !ok || receipt.Gate != p.Gate || receipt.Ref != p.Ref || receipt.Old != p.Old || receipt.New != p.New {
		return nil, errors.New("notification does not match admitted update")
	}
	if a.notify != nil {
		if err := a.notify(ctx, PushNotification{Gate: p.Gate, Ref: p.Ref, Old: p.Old, New: p.New, Options: append([]string(nil), p.PushOptions...)}); err != nil {
			return nil, err
		}
	}
	delete(a.receipts, token)
	if err := a.saveReceipts(); err != nil {
		return nil, fmt.Errorf("remove admission receipt: %w", err)
	}
	return map[string]bool{"ok": true}, nil
}
