package daemon

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
)

func TestAdmissionAuthenticatedReplayAndMismatch(t *testing.T) {
	dir := t.TempDir()
	socket := filepath.Join("/tmp", "sd-"+filepath.Base(dir)+".sock")
	defer os.Remove(socket)
	server := ipc.NewServer()
	var got PushNotification
	a := NewAdmission(server, func(_ context.Context, n PushNotification) error { got = n; return nil })
	if err := server.Listen(socket); err != nil {
		t.Fatal(err)
	}
	go func() { _ = server.ServeReady() }()
	defer server.Close()
	client, err := ipc.Dial(socket)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	token, err := a.Issue("/tmp/gate.git", "refs/heads/main")
	if err != nil {
		t.Fatal(err)
	}
	var accepted ipc.AdmitPushResult
	params := ipc.AdmitPushParams{Gate: "/tmp/gate.git", Ref: "refs/heads/main", Old: "0", New: "1", Token: token}
	if err := client.CallWithTimeout(ipc.MethodAdmitPush, params, &accepted, time.Second); err != nil {
		t.Fatalf("authenticated admission: %v", err)
	}
	if err := client.CallWithTimeout(ipc.MethodAdmitPush, params, &accepted, time.Second); err == nil {
		t.Fatal("replayed token accepted")
	}
	wrong, err := a.Issue("/tmp/gate.git", "refs/heads/main")
	if err != nil {
		t.Fatal(err)
	}
	params.Token, params.Gate = wrong, "/tmp/other.git"
	if err := client.CallWithTimeout(ipc.MethodAdmitPush, params, &accepted, time.Second); err == nil {
		t.Fatal("mismatched gate accepted")
	}
	var result map[string]bool
	if err := client.CallWithTimeout(ipc.MethodNotifyPush, ipc.NotifyPushParams{Gate: "/tmp/gate.git", Ref: "refs/heads/main", Old: "0", New: "1", PushOptions: []string{"safety-dance-token=" + token}}, &result, time.Second); err != nil {
		t.Fatalf("notification: %v", err)
	}
	second, err := a.Issue("/tmp/gate.git", "refs/heads/main")
	if err != nil {
		t.Fatal(err)
	}
	secondParams := ipc.AdmitPushParams{Gate: "/tmp/gate.git", Ref: "refs/heads/main", Old: "1", New: "2", Token: second}
	if err := client.CallWithTimeout(ipc.MethodAdmitPush, secondParams, &accepted, time.Second); err != nil {
		t.Fatal(err)
	}
	if err := client.CallWithTimeout(ipc.MethodRevokePushReceipt, ipc.RevokePushReceiptParams{Gate: secondParams.Gate, Ref: secondParams.Ref, Old: secondParams.Old, New: secondParams.New, Token: second}, &result, time.Second); err != nil {
		t.Fatal(err)
	}
	if err := client.CallWithTimeout(ipc.MethodNotifyPush, ipc.NotifyPushParams{Gate: secondParams.Gate, Ref: secondParams.Ref, Old: secondParams.Old, New: secondParams.New, PushOptions: []string{"safety-dance-token=" + second}}, &result, time.Second); err == nil {
		t.Fatal("revoked receipt was replayable")
	}
	if got.New != "1" || len(got.Options) != 1 {
		t.Fatalf("unexpected notification: %#v", got)
	}
}

func TestAdmissionRejectsUnmanagedTokenPeer(t *testing.T) {
	if managedHookPeer(os.Getpid(), t.TempDir()) {
		t.Fatal("ordinary test process was classified as a managed hook")
	}
}

func TestManagedHookPeerRequiresExecutableAncestry(t *testing.T) {
	gate := filepath.Join(t.TempDir(), "gate.git")
	hook := filepath.Join(gate, "hooks", "pre-receive")
	old := processInfoFunc
	t.Cleanup(func() { processInfoFunc = old })
	processInfoFunc = func(pid int) (int, string, error) {
		switch pid {
		case 101:
			return 102, "/tmp/safety-dance SD_MANAGED_HOOK=" + hook, nil
		case 102:
			return 103, "git-receive-pack '" + gate + "'", nil
		default:
			return 1, "init", nil
		}
	}
	if managedHookPeer(101, gate) {
		t.Fatal("forgeable environment marker authorized a token request")
	}

	processInfoFunc = func(pid int) (int, string, error) {
		switch pid {
		case 101:
			return 102, "/tmp/safety-dance", nil
		case 102:
			return 103, "/bin/sh " + hook, nil
		case 103:
			return 1, "git-receive-pack '" + gate + "'", nil
		default:
			return 1, "init", nil
		}
	}
	if !managedHookPeer(101, gate) {
		t.Fatal("actual managed hook and git receive ancestry was rejected")
	}
}

func TestAdmissionReceiptLoadFailureIsVisible(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "receipts.json")
	if err := os.Mkdir(file, 0o700); err != nil {
		t.Fatal(err)
	}
	server := ipc.NewServer()
	a := NewAdmissionWithStore(server, nil, file)
	if a.InitError() == nil {
		t.Fatal("expected receipt load failure")
	}
}
func TestCommandHasExecutablePreservesQuotedPaths(t *testing.T) {
	hook := filepath.Join(t.TempDir(), "A User", "gate", "hooks", "pre-receive")
	if !commandHasExecutable(`/bin/sh "`+hook+`"`, map[string]bool{cleanPath(hook): true}) {
		t.Fatalf("quoted hook path was not recognized: %q", hook)
	}
}
func TestAdmissionNotificationClaimsReceiptBeforeCallback(t *testing.T) {
	dir := t.TempDir()
	socket := filepath.Join("/tmp", "sd-claim-"+filepath.Base(dir)+".sock")
	defer os.Remove(socket)
	server := ipc.NewServer()
	started := make(chan struct{})
	release := make(chan struct{})
	var calls int
	a := NewAdmission(server, func(_ context.Context, _ PushNotification) error {
		calls++
		close(started)
		<-release
		return nil
	})
	if err := server.Listen(socket); err != nil {
		t.Fatal(err)
	}
	go func() { _ = server.ServeReady() }()
	defer server.Close()
	client1, err := ipc.Dial(socket)
	if err != nil {
		t.Fatal(err)
	}
	defer client1.Close()
	client2, err := ipc.Dial(socket)
	if err != nil {
		t.Fatal(err)
	}
	defer client2.Close()
	token, err := a.Issue("/tmp/gate.git", "refs/heads/main")
	if err != nil {
		t.Fatal(err)
	}
	params := ipc.AdmitPushParams{Gate: "/tmp/gate.git", Ref: "refs/heads/main", Old: "0", New: "1", Token: token}
	var accepted ipc.AdmitPushResult
	if err := client1.CallWithTimeout(ipc.MethodAdmitPush, params, &accepted, time.Second); err != nil {
		t.Fatal(err)
	}
	notification := ipc.NotifyPushParams{Gate: params.Gate, Ref: params.Ref, Old: params.Old, New: params.New, PushOptions: []string{"safety-dance-token=" + token}}
	firstErr := make(chan error, 1)
	go func() {
		var result map[string]bool
		firstErr <- client1.CallWithTimeout(ipc.MethodNotifyPush, notification, &result, time.Second)
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("first callback did not start")
	}
	var result map[string]bool
	if err := client2.CallWithTimeout(ipc.MethodNotifyPush, notification, &result, time.Second); err == nil {
		t.Fatal("duplicate notification was accepted")
	}
	close(release)
	if err := <-firstErr; err != nil {
		t.Fatalf("first notification: %v", err)
	}
	if calls != 1 {
		t.Fatalf("callback calls = %d, want 1", calls)
	}
}
