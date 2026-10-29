package main

import (
	"bufio"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/simview/internal/state"
)

// The test executable exercises the real web command without building another binary.
func TestWebCommandProcess(t *testing.T) {
	if os.Getenv("SIMVIEW_TEST_WEB_PROCESS") != "1" {
		return
	}
	cmd := webCmd()
	cmd.SetArgs([]string{"--bind", "127.0.0.1:0"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
}

type webProcess struct {
	cmd  *exec.Cmd
	done <-chan error
	url  string
}

func startWebProcess(t *testing.T) webProcess {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^TestWebCommandProcess$")
	cmd.Env = append(os.Environ(), "SIMVIEW_TEST_WEB_PROCESS=1")
	cmd.Stderr = os.Stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait(); close(done) }()
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Error("web child did not exit")
		}
	})
	links := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		if scanner.Scan() {
			links <- scanner.Text()
		}
		_, _ = io.Copy(io.Discard, stdout)
	}()
	select {
	case link := <-links:
		if !strings.HasPrefix(link, "http://127.0.0.1:") {
			t.Fatalf("unexpected web link: %q", link)
		}
		client := http.Client{Timeout: 5 * time.Second}
		resp, err := client.Get(link)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("web page status: %d", resp.StatusCode)
		}
		return webProcess{cmd: cmd, done: done, url: link}
	case err := <-done:
		t.Fatalf("web child exited before serving: %v", err)
	case <-time.After(10 * time.Second):
		t.Fatal("web child did not print its link")
	}
	return webProcess{}
}

func stopWebProcess(t *testing.T, p webProcess, signal os.Signal) {
	t.Helper()
	if err := p.cmd.Process.Signal(signal); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-p.done:
		if signal != os.Kill && err != nil {
			t.Fatalf("web child shutdown: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("web child did not stop")
	}
}

func TestExplicitWebServersBlockTokenRotationUntilAllStop(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_STATE_HOME", filepath.Join(dir, "state"))
	t.Setenv("SIMVIEW_CONFIG", filepath.Join(dir, "missing-config.toml"))
	first := startWebProcess(t)
	second := startWebProcess(t)
	firstURL, _ := url.Parse(first.url)
	secondURL, _ := url.Parse(second.url)
	if firstURL.Query().Get("t") != secondURL.Query().Get("t") {
		t.Fatal("explicit web instances received different tokens")
	}
	saved, err := state.LoadWeb()
	if err != nil || saved.Addr != "" || saved.URL != "" {
		t.Fatalf("explicit bind changed stable link: %+v, %v", saved, err)
	}
	rotate := func() error {
		cmd := tokenCmd()
		cmd.SilenceErrors, cmd.SilenceUsage = true, true
		cmd.SetArgs([]string{"--rotate"})
		return cmd.Execute()
	}
	if err := rotate(); err == nil {
		t.Fatal("rotated token while explicit web instances were serving")
	}
	cmd := webCmd()
	cmd.SilenceErrors, cmd.SilenceUsage = true, true
	cmd.SetArgs([]string{"--bind", "127.0.0.1:0", "--new-token"})
	if err := cmd.Execute(); err == nil {
		t.Fatal("web --new-token rotated a live instance's token")
	}
	stopWebProcess(t, first, syscall.SIGTERM)
	if err := rotate(); err == nil {
		t.Fatal("rotated token while the second explicit instance was still serving")
	}
	stopWebProcess(t, second, os.Kill)
	if err := rotate(); err != nil {
		t.Fatalf("stale process lock prevented rotation: %v", err)
	}
	after, err := state.LoadWeb()
	if err != nil || after.Token == saved.Token {
		t.Fatalf("token did not rotate after all instances exited: %+v, %v", after, err)
	}
}
