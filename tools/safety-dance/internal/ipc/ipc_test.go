package ipc

import "testing"

func TestAdmissionTokenIsBoundAndSingleUse(t *testing.T) {
	auth := NewAuthenticator()
	token, err := auth.Issue("/gate", "refs/heads/main")
	if err != nil {
		t.Fatal(err)
	}
	if err := auth.Consume("/gate", "refs/heads/other", token); err == nil {
		t.Fatal("expected ref mismatch")
	}
	if err := auth.Consume("/gate", "refs/heads/main", token); err != nil {
		t.Fatal(err)
	}
	if err := auth.Consume("/gate", "refs/heads/main", token); err == nil {
		t.Fatal("expected replay rejection")
	}
}
