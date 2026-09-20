package ipc

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
)

// Admission authenticates one receive-hook request. Tokens are single-use and
// bound to the gate and ref, so a valid request cannot be replayed elsewhere.
type Admission struct {
	Gate  string
	Ref   string
	Token string
}

// Authenticator issues and consumes short-lived, single-use admission tokens.
// The daemon owns one authenticator for its runtime home.
type Authenticator struct {
	mu    sync.Mutex
	bound map[string]Admission
}

func NewAuthenticator() *Authenticator {
	return &Authenticator{bound: make(map[string]Admission)}
}

func (a *Authenticator) Issue(gate, ref string) (string, error) {
	if gate == "" || ref == "" {
		return "", errors.New("gate and ref are required")
	}
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("generate admission token: %w", err)
	}
	token := hex.EncodeToString(raw[:])
	a.mu.Lock()
	a.bound[token] = Admission{Gate: gate, Ref: ref, Token: token}
	a.mu.Unlock()
	return token, nil
}

func (a *Authenticator) Consume(gate, ref, token string) error {
	if gate == "" || ref == "" || token == "" {
		return errors.New("gate, ref, and token are required")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	admission, ok := a.bound[token]
	if !ok {
		return errors.New("invalid or replayed admission token")
	}
	if admission.Gate != gate || admission.Ref != ref {
		return errors.New("admission token does not match gate and ref")
	}
	delete(a.bound, token)
	return nil
}

// AuthenticateAdmission binds a hook request to the OS-authenticated IPC
// peer before consuming its single-use gate/ref token. Callers must not treat
// a request without a transport peer as authenticated.
func AuthenticateAdmission(ctx context.Context, a *Authenticator, gate, ref, token string) error {
	if PeerPID(ctx) <= 0 {
		return errors.New("unauthenticated IPC peer")
	}
	if a == nil {
		return errors.New("admission authenticator is required")
	}
	return a.Consume(gate, ref, token)
}
