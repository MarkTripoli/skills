package ipc

import (
	"encoding/json"
	"sync/atomic"
)

// JSON-RPC 2.0 method names.
const (
	MethodRunStart             = "run.start"
	MethodRunEvent             = "run.event"
	MethodRunCadence           = "run.cadence"
	MethodRunCheck             = "run.check"
	MethodRunWait              = "run.wait"
	MethodRunResolve           = "run.resolve"
	MethodRunFinish            = "run.finish"
	MethodRunReact             = "run.react"
	MethodRunContent           = "run.content"
	MethodRunListItems         = "run.list_items"
	MethodRunUpload            = "run.upload"
	MethodRunDisableSlack      = "run.disable_slack"
	MethodDaemonHealth         = "daemon.health"
	MethodDaemonShutdown       = "daemon.shutdown"
	MethodAssistantVerifyOwner = "assistant.verify_owner"
)

// JSON-RPC 2.0 error codes. ErrUnavailable is the implementation-defined code
// for a request the daemon accepted but could not deliver to Slack; the CLI
// maps it to exit 11 while every other code stays a usage error.
const (
	ErrParseError     = -32700
	ErrInvalidRequest = -32600
	ErrMethodNotFound = -32601
	ErrInvalidParams  = -32602
	ErrInternal       = -32603
	ErrUnavailable    = -32000
	ErrSlackDisabled  = -32001
)

// Request is a JSON-RPC 2.0 request.
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
	ID      int64           `json:"id"`
}

// Response is a JSON-RPC 2.0 response.
type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
	ID      int64           `json:"id"`
}

// RPCError represents a JSON-RPC 2.0 error object.
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *RPCError) Error() string { return e.Message }

// HealthParams has no fields but exists for consistency.
type HealthParams struct{}

// ShutdownParams has no fields but exists for consistency.
type ShutdownParams struct{}

// HealthResult reports the daemon's Socket Mode connection state:
// "not_started" before the connection opens, then "connected" or "disconnected".
type HealthResult struct {
	SocketMode string `json:"socket_mode"`
}

// ShutdownResult confirms shutdown was initiated.
type ShutdownResult struct {
	OK bool `json:"ok"`
}

// VerifyOwnerParams has no fields but exists for consistency.
type VerifyOwnerParams struct{}

// VerifyOwnerResult answers assistant.verify_owner: OK with the owner's display
// name once the owner replied to the setup DM, or Timeout when no reply
// arrived within the daemon's verification window.
type VerifyOwnerResult struct {
	OK          bool   `json:"ok"`
	Timeout     bool   `json:"timeout,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
}

// EmptyResult is the reply of a method that succeeds without data.
type EmptyResult struct{}

var reqID atomic.Int64

// NewRequest creates a JSON-RPC 2.0 request with an auto-incremented ID.
func NewRequest(method string, params interface{}) (*Request, error) {
	raw, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	return &Request{
		JSONRPC: "2.0",
		Method:  method,
		Params:  raw,
		ID:      reqID.Add(1),
	}, nil
}

// NewResponse creates a successful JSON-RPC 2.0 response.
func NewResponse(id int64, result interface{}) (*Response, error) {
	raw, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}
	return &Response{
		JSONRPC: "2.0",
		Result:  raw,
		ID:      id,
	}, nil
}

// NewErrorResponse creates an error JSON-RPC 2.0 response.
func NewErrorResponse(id int64, code int, message string) *Response {
	return &Response{
		JSONRPC: "2.0",
		Error:   &RPCError{Code: code, Message: message},
		ID:      id,
	}
}
