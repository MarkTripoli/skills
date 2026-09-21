package daemon

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
)

func reconcileAdmission(t *testing.T, notify func(context.Context, PushNotification) error) (*Admission, string) {
	t.Helper()
	gate := filepath.Join(t.TempDir(), "gate.git")
	if out, err := exec.Command("git", "init", "--bare", gate).CombinedOutput(); err != nil {
		t.Fatalf("init bare gate: %v (%s)", err, out)
	}
	return &Admission{notify: notify, receipts: make(map[string]ipc.AdmitPushParams), claimed: make(map[string]bool)}, gate
}

func setGateRef(t *testing.T, gate string) string {
	t.Helper()
	treeCmd := exec.Command("git", "--git-dir", gate, "mktree")
	treeCmd.Stdin = strings.NewReader("")
	tree, err := treeCmd.Output()
	if err != nil {
		t.Fatalf("write gate tree: %v", err)
	}
	commitCmd := exec.Command("git", "--git-dir", gate, "commit-tree", strings.TrimSpace(string(tree)))
	commitCmd.Stdin = strings.NewReader("receipt\n")
	commitCmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@example.com", "GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@example.com")
	out, err := commitCmd.Output()
	if err != nil {
		t.Fatalf("write gate commit: %v", err)
	}
	revision := strings.TrimSpace(string(out))
	if out, err := exec.Command("git", "--git-dir", gate, "update-ref", "refs/heads/main", revision).CombinedOutput(); err != nil {
		t.Fatalf("set gate ref: %v (%s)", err, out)
	}
	return revision
}

func acceptedReceipt(gate, token, revision string) ipc.AdmitPushParams {
	return ipc.AdmitPushParams{Gate: gate, Ref: "refs/heads/main", Old: "old", New: revision, Token: token, Accepted: true}
}

func TestReconcileOncePreservesAcceptedNotificationMetadata(t *testing.T) {
	var got PushNotification
	a, gate := reconcileAdmission(t, func(_ context.Context, n PushNotification) error {
		got = n
		return nil
	})
	revision := setGateRef(t, gate)
	a.receipts["metadata"] = ipc.AdmitPushParams{
		Gate: gate, Ref: "refs/heads/main", Old: "old", New: revision, Token: "metadata", Accepted: true,
		PushOptions: []string{"safety-dance-validation=custom", "safety-dance-intent=ship"}, ValidationGeneration: "generation-7",
	}
	if err := a.ReconcileOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Options, []string{"safety-dance-validation=custom", "safety-dance-intent=ship"}) || got.ValidationGeneration != "generation-7" {
		t.Fatalf("notification metadata = options %v, generation %q", got.Options, got.ValidationGeneration)
	}
}

func TestImportGateReceiptsPromotesPersistedPreAcceptanceReceipt(t *testing.T) {
	a, gate := reconcileAdmission(t, nil)
	revision := setGateRef(t, gate)
	a.receiptFile = filepath.Join(t.TempDir(), "receipts.json")
	a.receipts["crash"] = ipc.AdmitPushParams{
		Gate: gate, Ref: "refs/heads/main", Old: "old", New: revision, Token: "crash",
		PushOptions: []string{"safety-dance-intent=preserve"}, Accepted: false,
	}
	journal := fmt.Sprintf("old %s refs/heads/main crash\n", revision)
	if err := os.WriteFile(filepath.Join(gate, ".safety-dance-receipts"), []byte(journal), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := a.ImportGateReceipts(context.Background(), []string{gate}); err != nil {
		t.Fatal(err)
	}
	receipt := a.receipts["crash"]
	if !receipt.Accepted || !reflect.DeepEqual(receipt.PushOptions, []string{"safety-dance-intent=preserve"}) {
		t.Fatalf("imported receipt = %#v, want accepted with metadata preserved", receipt)
	}
}

func TestImportGateReceiptsRejectsPersistedReceiptConflict(t *testing.T) {
	a, gate := reconcileAdmission(t, nil)
	revision := setGateRef(t, gate)
	a.receipts["conflict"] = ipc.AdmitPushParams{Gate: gate, Ref: "refs/heads/main", Old: "different", New: revision, Token: "conflict"}
	journal := fmt.Sprintf("old %s refs/heads/main conflict\n", revision)
	if err := os.WriteFile(filepath.Join(gate, ".safety-dance-receipts"), []byte(journal), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := a.ImportGateReceipts(context.Background(), []string{gate}); err == nil || !strings.Contains(err.Error(), "conflicts") {
		t.Fatalf("ImportGateReceipts error = %v, want conflict", err)
	}
}

func TestReconcileOnceStaleReceiptIsAttemptedOnceAndPreserved(t *testing.T) {
	a, gate := reconcileAdmission(t, func(context.Context, PushNotification) error { t.Fatal("stale receipt was notified"); return nil })
	a.receipts["stale"] = acceptedReceipt(gate, "stale", "missing")
	if err := a.ReconcileOnce(context.Background()); err == nil || !strings.Contains(err.Error(), "stale") {
		t.Fatalf("ReconcileOnce error = %v, want stale receipt error", err)
	}
	if _, ok := a.receipts["stale"]; !ok {
		t.Fatal("stale receipt was not preserved")
	}
}

func TestReconcileOnceCallbackFailureDoesNotTightLoop(t *testing.T) {
	a, gate := reconcileAdmission(t, func(context.Context, PushNotification) error { return errors.New("callback failed") })
	revision := setGateRef(t, gate)
	a.receipts["callback"] = acceptedReceipt(gate, "callback", revision)
	if err := a.ReconcileOnce(context.Background()); err == nil || !strings.Contains(err.Error(), "callback failed") {
		t.Fatalf("ReconcileOnce error = %v, want callback failure", err)
	}
	if _, ok := a.receipts["callback"]; !ok {
		t.Fatal("callback failure lost receipt")
	}
}

func TestReconcileOnceSaveFailurePreservesReceipt(t *testing.T) {
	calls := 0
	a, gate := reconcileAdmission(t, func(context.Context, PushNotification) error { calls++; return nil })
	revision := setGateRef(t, gate)
	store := filepath.Join(t.TempDir(), "receipts")
	if err := os.Mkdir(store, 0o700); err != nil {
		t.Fatal(err)
	}
	a.receiptFile = store
	a.receipts["save"] = acceptedReceipt(gate, "save", revision)
	if err := a.ReconcileOnce(context.Background()); err == nil || !strings.Contains(err.Error(), "remove admission receipt") {
		t.Fatalf("ReconcileOnce error = %v, want save failure", err)
	}
	if calls != 1 {
		t.Fatalf("callback calls = %d, want 1", calls)
	}
	if _, ok := a.receipts["save"]; !ok {
		t.Fatal("save failure lost receipt")
	}
}

func TestReconcileOnceProcessesAllReceiptsDespiteFailure(t *testing.T) {
	calls := make(map[string]int)
	a, gate := reconcileAdmission(t, func(_ context.Context, n PushNotification) error {
		calls[n.Token]++
		if n.Token == "bad" {
			return errors.New("bad callback")
		}
		return nil
	})
	revision := setGateRef(t, gate)
	a.receipts["bad"] = acceptedReceipt(gate, "bad", revision)
	a.receipts["good"] = acceptedReceipt(gate, "good", revision)
	if err := a.ReconcileOnce(context.Background()); err == nil || !strings.Contains(err.Error(), "bad callback") {
		t.Fatalf("ReconcileOnce error = %v, want aggregated callback failure", err)
	}
	if calls["bad"] != 1 || calls["good"] != 1 {
		t.Fatalf("callback calls = %#v, want one attempt for both receipts", calls)
	}
	if _, ok := a.receipts["good"]; ok {
		t.Fatal("successful receipt was not removed")
	}
	if _, ok := a.receipts["bad"]; !ok {
		t.Fatal("failed receipt was not preserved")
	}
}

func TestAdmissionAuthenticatedReplayAndMismatch(t *testing.T) {
	dir := t.TempDir()
	socket := filepath.Join("/tmp", "sd-"+filepath.Base(dir)+".sock")
	defer os.Remove(socket)
	server := ipc.NewServer()
	oldProcessInfo := processInfoFunc
	t.Cleanup(func() { processInfoFunc = oldProcessInfo })
	processInfoFunc = func(pid int) (int, string, error) {
		if pid == os.Getpid() {
			return pid + 1, "/bin/sh /tmp/gate.git/hooks/pre-receive", nil
		}
		return 1, "git-receive-pack /tmp/gate.git", nil
	}
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
	oldInfo, oldEnv := processInfoFunc, processEnvironmentFunc
	t.Cleanup(func() { processInfoFunc, processEnvironmentFunc = oldInfo, oldEnv })
	processInfoFunc = func(pid int) (int, string, error) {
		switch pid {
		case 101:
			return 102, "/tmp/safety-dance", nil
		case 102:
			return 103, "git-receive-pack '" + gate + "'", nil
		default:
			return 1, "init", nil
		}
	}
	processEnvironmentFunc = func(pid int) ([]byte, error) {
		if pid == 101 {
			return []byte("SD_MANAGED_HOOK=" + hook + "\x00"), nil
		}
		return nil, nil
	}
	if managedHookPeer(101, gate) {
		t.Fatal("forgeable environment marker authorized a token request")
	}

	processEnvironmentFunc = func(int) ([]byte, error) { return nil, nil }
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
func TestHookCapabilityNeverBypassesManagedAncestry(t *testing.T) {
	gate := filepath.Join(t.TempDir(), "gate.git")
	if err := os.MkdirAll(gate, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(gate, ".safety-dance-hook-capability"), []byte("cap\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	oldInfo, oldEnv := processInfoFunc, processEnvironmentFunc
	t.Cleanup(func() { processInfoFunc, processEnvironmentFunc = oldInfo, oldEnv })
	processInfoFunc = func(int) (int, string, error) { return 1, "sh -c safety-dance", nil }
	processEnvironmentFunc = func(int) ([]byte, error) { return nil, nil }
	a := &Admission{requireHookCapability: true}
	if a.hookAuthorized(101, gate, "cap") {
		t.Fatal("copied hook capability bypassed managed-hook ancestry")
	}
}

func TestAuthorizeMutationPeerRejectsMarkerOnDetachedAncestor(t *testing.T) {
	oldInfo, oldEnv, oldSession := processInfoFunc, processEnvironmentFunc, processSessionIDFunc
	t.Cleanup(func() {
		processInfoFunc, processEnvironmentFunc, processSessionIDFunc = oldInfo, oldEnv, oldSession
		SetTrustedOperatorSession(0)
	})
	processSessionIDFunc = func(int) (int64, bool) { return 1, true }
	SetTrustedOperatorSession(1)
	processInfoFunc = func(pid int) (int, string, error) {
		switch pid {
		case 101:
			return 102, "/tmp/safety-dance", nil
		case 102:
			return 103, "/bin/sh -c safety-dance status", nil
		case 103:
			return 1, "/agent/validation", nil
		default:
			return 1, "init", nil
		}
	}
	processEnvironmentFunc = func(pid int) ([]byte, error) {
		if pid == 103 {
			return []byte("SD_PARENT_RUN_ID=run-1\x00"), nil
		}
		return nil, nil
	}
	if err := AuthorizeMutationPeer(101); err == nil {
		t.Fatal("mutation peer with a marked validation ancestor was authorized")
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
	oldProcessInfo := processInfoFunc
	t.Cleanup(func() { processInfoFunc = oldProcessInfo })
	processInfoFunc = func(pid int) (int, string, error) {
		if pid == os.Getpid() {
			return pid + 1, "/bin/sh /tmp/gate.git/hooks/pre-receive", nil
		}
		return 1, "git-receive-pack /tmp/gate.git", nil
	}
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
