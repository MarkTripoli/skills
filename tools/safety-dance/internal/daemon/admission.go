package daemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
)

// PushNotification is the accepted ref update delivered after Git has changed
// the gate. Admission is deliberately separate: a notification can never
// authorize a ref update.
type PushNotification struct {
	Gate, Ref, Old, New string
	Options             []string
}

// Admission owns the receive-hook trust boundary. Tokens are issued by the
// daemon and consumed exactly once by an authenticated IPC peer. A consumed
// token becomes a receipt that binds the later post-receive notification.
type Admission struct {
	auth     *ipc.Authenticator
	notify   func(context.Context, PushNotification) error
	mu       sync.Mutex
	receipts map[string]ipc.AdmitPushParams
}

func NewAdmission(server *ipc.Server, notify func(context.Context, PushNotification) error) *Admission {
	a := &Admission{auth: ipc.NewAuthenticator(), notify: notify, receipts: make(map[string]ipc.AdmitPushParams)}
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
	a.mu.Unlock()
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
	if ok {
		delete(a.receipts, token)
	}
	a.mu.Unlock()
	if !ok || receipt.Gate != p.Gate || receipt.Ref != p.Ref || receipt.Old != p.Old || receipt.New != p.New {
		return nil, errors.New("notification does not match admitted update")
	}
	if a.notify != nil {
		if err := a.notify(ctx, PushNotification{Gate: p.Gate, Ref: p.Ref, Old: p.Old, New: p.New, Options: append([]string(nil), p.PushOptions...)}); err != nil {
			return nil, err
		}
	}
	return map[string]bool{"ok": true}, nil
}
