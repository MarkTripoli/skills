package watch

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/gorilla/websocket"
)

func TestAppServerReadsActiveTurnSteersAndStartsFresh(t *testing.T) {
	// macOS's Unix socket limit includes the full temporary-directory path.
	dir, err := os.MkdirTemp("", "bc-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	socket := filepath.Join(dir, "codex.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := (&websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}).Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer ws.Close()
		for {
			var req struct {
				ID     int             `json:"id"`
				Method string          `json:"method"`
				Params json.RawMessage `json:"params"`
			}
			if err := ws.ReadJSON(&req); err != nil {
				return
			}
			if req.Method == "initialized" {
				continue
			}
			var result any = map[string]any{}
			switch req.Method {
			case "thread/read":
				result = map[string]any{"thread": map[string]any{"status": map[string]string{"type": "active"}, "turns": []map[string]string{{"id": "turn-1", "status": "inProgress"}}}}
			case "thread/start":
				result = map[string]any{"thread": map[string]string{"id": "thread-fresh"}}
			case "turn/steer":
				var p struct {
					ExpectedTurnID string `json:"expectedTurnId"`
				}
				_ = json.Unmarshal(req.Params, &p)
				if p.ExpectedTurnID != "turn-1" {
					t.Errorf("expected turn = %q", p.ExpectedTurnID)
				}
			case "turn/start":
				var p struct {
					ThreadID string `json:"threadId"`
				}
				_ = json.Unmarshal(req.Params, &p)
				if p.ThreadID != "thread-fresh" {
					t.Errorf("new thread = %q", p.ThreadID)
				}
			}
			if err := ws.WriteJSON(map[string]any{"id": req.ID, "result": result}); err != nil {
				t.Error(err)
				return
			}
		}
	})}
	go func() { _ = server.Serve(listener) }()
	defer server.Close()
	a := AppServer{Socket: socket}
	turn, err := a.ActiveTurn(context.Background(), "thread-old")
	if err != nil || turn != "turn-1" {
		t.Fatalf("active turn = %q, %v", turn, err)
	}
	if err := a.Steer(context.Background(), "thread-old", turn, "New DEMO-2"); err != nil {
		t.Fatal(err)
	}
	thread, err := a.Start(context.Background(), t.TempDir(), "Deliver DEMO-2")
	if err != nil || thread != "thread-fresh" {
		t.Fatalf("new thread = %q, %v", thread, err)
	}
}
