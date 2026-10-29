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

type appServerRequest struct {
	ID     int             `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

type appServerReply struct {
	result any
	err    any
	drop   bool
}

func fakeAppServer(t *testing.T, handle func(appServerRequest) appServerReply) AppServer {
	t.Helper()
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
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := (&websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}).Upgrade(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer ws.Close()
		for {
			var req appServerRequest
			if err := ws.ReadJSON(&req); err != nil {
				return
			}
			if req.Method == "initialized" {
				continue
			}
			reply := appServerReply{result: map[string]any{}}
			if req.Method != "initialize" {
				reply = handle(req)
			}
			if reply.drop {
				return
			}
			response := map[string]any{"id": req.ID, "result": reply.result}
			if reply.err != nil {
				delete(response, "result")
				response["error"] = reply.err
			}
			if err := ws.WriteJSON(response); err != nil {
				return
			}
		}
	})}
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() { _ = server.Close() })
	return AppServer{Socket: socket}
}

func TestAppServerReadsActiveTurnSteersAndStartsFresh(t *testing.T) {
	a := fakeAppServer(t, func(req appServerRequest) appServerReply {
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
				ThreadID            string `json:"threadId"`
				ClientUserMessageID string `json:"clientUserMessageId"`
			}
			_ = json.Unmarshal(req.Params, &p)
			if p.ThreadID != "thread-fresh" || p.ClientUserMessageID != "intent-stable" {
				t.Errorf("turn start identity = %+v", p)
			}
		}
		return appServerReply{result: result}
	})
	turn, err := a.ActiveTurn(context.Background(), "thread-old")
	if err != nil || turn != "turn-1" {
		t.Fatalf("active turn = %q, %v", turn, err)
	}
	if err := a.Steer(context.Background(), "thread-old", turn, "New DEMO-2"); err != nil {
		t.Fatal(err)
	}
	thread, err := a.StartThread(context.Background(), t.TempDir())
	if err != nil || thread != "thread-fresh" {
		t.Fatalf("new thread = %q, %v", thread, err)
	}
	if err := a.StartTurn(context.Background(), thread, "intent-stable", "Deliver DEMO-2"); err != nil {
		t.Fatal(err)
	}
}
