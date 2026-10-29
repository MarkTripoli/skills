package watch

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os/exec"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

type Codex interface {
	ActiveTurn(context.Context, string) (string, error)
	Steer(context.Context, string, string, string) error
	Start(context.Context, string, string) (string, error)
}

type AppServer struct{ Socket string }

func CodexSocket(ctx context.Context) (string, error) {
	out, err := exec.CommandContext(ctx, "codex", "app-server", "daemon", "version").Output()
	if err != nil {
		return "", fmt.Errorf("locate Codex app server: %w", err)
	}
	var result struct{ Status, SocketPath string }
	if err := json.Unmarshal(out, &result); err != nil {
		return "", err
	}
	if result.Status != "running" || result.SocketPath == "" {
		return "", errors.New("Codex app server is not running")
	}
	return result.SocketPath, nil
}

type rpcConn struct {
	ws     *websocket.Conn
	nextID int
}

func (a AppServer) connect(ctx context.Context) (*rpcConn, error) {
	if a.Socket == "" {
		return nil, errors.New("Codex socket is required")
	}
	d := websocket.Dialer{
		HandshakeTimeout: 5 * time.Second,
		NetDialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "unix", a.Socket)
		},
	}
	ws, _, err := d.DialContext(ctx, "ws://localhost/", nil)
	if err != nil {
		return nil, fmt.Errorf("connect Codex app server: %w", err)
	}
	c := &rpcConn{ws: ws}
	if err := c.call(ctx, "initialize", map[string]any{"clientInfo": map[string]string{
		"name": "bug-coordinator", "title": "Bug Coordinator", "version": "0.1.0",
	}}, nil); err != nil {
		ws.Close()
		return nil, err
	}
	if err := ws.WriteJSON(map[string]any{"method": "initialized", "params": map[string]any{}}); err != nil {
		ws.Close()
		return nil, err
	}
	return c, nil
}

func (c *rpcConn) close() { c.ws.Close() }

func (c *rpcConn) call(ctx context.Context, method string, params any, out any) error {
	c.nextID++
	id := c.nextID
	deadline := time.Now().Add(15 * time.Second)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	_ = c.ws.SetWriteDeadline(deadline)
	if err := c.ws.WriteJSON(map[string]any{"id": id, "method": method, "params": params}); err != nil {
		return err
	}
	for {
		_ = c.ws.SetReadDeadline(deadline)
		var reply struct {
			ID     int             `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  *struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := c.ws.ReadJSON(&reply); err != nil {
			return err
		}
		if reply.ID != id {
			continue
		}
		if reply.Error != nil {
			return fmt.Errorf("Codex %s: %s (%d)", method, reply.Error.Message, reply.Error.Code)
		}
		if out != nil {
			return json.Unmarshal(reply.Result, out)
		}
		return nil
	}
}

func (a AppServer) ActiveTurn(ctx context.Context, threadID string) (string, error) {
	if threadID == "" {
		return "", nil
	}
	c, err := a.connect(ctx)
	if err != nil {
		return "", err
	}
	defer c.close()
	var result struct {
		Thread struct {
			Status struct {
				Type string `json:"type"`
			} `json:"status"`
			Turns []struct{ ID, Status string } `json:"turns"`
		} `json:"thread"`
	}
	if err := c.call(ctx, "thread/read", map[string]any{"threadId": threadID, "includeTurns": true}, &result); err != nil {
		// A removed thread is no longer running; other app-server errors must
		// not be mistaken for an idle agent.
		if strings.Contains(err.Error(), "not found") {
			return "", nil
		}
		return "", err
	}
	if result.Thread.Status.Type != "active" {
		return "", nil
	}
	for i := len(result.Thread.Turns) - 1; i >= 0; i-- {
		if result.Thread.Turns[i].Status == "inProgress" {
			return result.Thread.Turns[i].ID, nil
		}
	}
	return "", errors.New("Codex reports an active thread without an in-progress turn")
}

func (a AppServer) Steer(ctx context.Context, threadID, turnID, message string) error {
	c, err := a.connect(ctx)
	if err != nil {
		return err
	}
	defer c.close()
	return c.call(ctx, "turn/steer", map[string]any{
		"threadId": threadID, "expectedTurnId": turnID,
		"input": []map[string]string{{"type": "text", "text": message}},
	}, nil)
}

func (a AppServer) Start(ctx context.Context, cwd, message string) (string, error) {
	c, err := a.connect(ctx)
	if err != nil {
		return "", err
	}
	defer c.close()
	var started struct {
		Thread struct {
			ID string `json:"id"`
		} `json:"thread"`
	}
	if err := c.call(ctx, "thread/start", map[string]any{"cwd": cwd, "ephemeral": false}, &started); err != nil {
		return "", err
	}
	if started.Thread.ID == "" {
		return "", errors.New("Codex returned no thread ID")
	}
	// clientUserMessageId lets the app server identify the launch message if
	// this process loses its reply and a caller later inspects the thread.
	var nonce [16]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return "", err
	}
	if err := c.call(ctx, "turn/start", map[string]any{
		"threadId":            started.Thread.ID,
		"clientUserMessageId": fmt.Sprintf("bug-coordinator-%x", nonce),
		"input":               []map[string]string{{"type": "text", "text": message}},
	}, nil); err != nil {
		return "", err
	}
	return started.Thread.ID, nil
}
