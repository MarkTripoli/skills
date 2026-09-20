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
	params := ipc.AdmitPushParams{Gate: "/tmp/gate.git", Ref: "refs/heads/main", Token: token}
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
	if err := client.CallWithTimeout(ipc.MethodNotifyPush, ipc.NotifyPushParams{Gate: "/tmp/gate.git", Ref: "refs/heads/main", Old: "0", New: "1", PushOptions: []string{"x=y"}}, &result, time.Second); err != nil {
		t.Fatalf("notification: %v", err)
	}
	if got.New != "1" || len(got.Options) != 1 {
		t.Fatalf("unexpected notification: %#v", got)
	}
}
