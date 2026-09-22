package coordinator

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// gateIs compares the gate's kind and reason; Run is asserted where the
// summary itself is under test.
func gateIs(gate WriteGate, kind, reason string) bool {
	return gate.Kind == kind && gate.Reason == reason && gate.Input == nil
}

func TestCheckBeforeWriteOrdersHealthBeforeDelivery(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")

	if _, err := c.CheckBeforeWrite(ctx, "nope"); !errors.Is(err, db.ErrRunNotFound) {
		t.Fatalf("unknown run = %v, want ErrRunNotFound", err)
	}

	// No Health injected reads as not_started: the gate fails closed.
	if gate, err := c.CheckBeforeWrite(ctx, "RUN1"); err != nil || !gateIs(gate, GateUnavailable, "socket_mode not_started") {
		t.Fatalf("without Health: %+v, %v", gate, err)
	}

	state := slackapi.SocketConnected
	c.Health = func() string { return state }
	if gate, err := c.CheckBeforeWrite(ctx, "RUN1"); err != nil || !gateIs(gate, GateReady, "") {
		t.Fatalf("connected, no failures: %+v, %v", gate, err)
	}

	poster.fail = errors.New("channel_not_found")
	err := c.RecordWorkEvent(ctx, WorkEvent{RunID: "RUN1", Current: "x"})
	var delivery *DeliveryError
	if !errors.As(err, &delivery) {
		t.Fatalf("failed post = %v, want *DeliveryError", err)
	}
	gate, err := c.CheckBeforeWrite(ctx, "RUN1")
	if err != nil || !gateIs(gate, GateUnavailable, "channel_not_found") {
		t.Fatalf("after a failed post: %+v, %v", gate, err)
	}

	// A disconnected socket wins over the delivery error in the reason.
	state = slackapi.SocketDisconnected
	if gate, _ := c.CheckBeforeWrite(ctx, "RUN1"); gate.Reason != "socket_mode disconnected" {
		t.Fatalf("disconnected with a delivery error: %+v", gate)
	}
	state = slackapi.SocketConnected

	// The scheduler retries the failed run before its quiet interval and clears the error.
	poster.fail = nil
	if err := (&StatusScheduler{C: c}).Tick(ctx, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 2 || poster.posts[1].ThreadTS != "1700000000.000100" {
		t.Fatalf("retry posts = %+v, want the status reposted in the thread", poster.posts)
	}
	if gate, err := c.CheckBeforeWrite(ctx, "RUN1"); err != nil || !gateIs(gate, GateReady, "") {
		t.Fatalf("after the retry: %+v, %v", gate, err)
	}
	if err := (&StatusScheduler{C: c}).Tick(ctx, now.Add(2*time.Minute)); err != nil || len(poster.posts) != 2 {
		t.Fatalf("cleared run retried again: %d posts, %v", len(poster.posts), err)
	}
}

func TestFinishRunLeavesTheRunActiveWhenThePostFails(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")

	poster.fail = errors.New("ratelimited")
	var delivery *DeliveryError
	if err := c.FinishRun(ctx, FinishRunInput{RunID: "RUN1", Outcome: "completed"}); !errors.As(err, &delivery) {
		t.Fatalf("FinishRun with Slack failing = %v, want *DeliveryError", err)
	}
	run, err := c.DB.GetRun(ctx, "RUN1")
	if err != nil {
		t.Fatal(err)
	}
	if run.Lifecycle != "active" || run.LastDeliveryError.String != "ratelimited" {
		t.Fatalf("run after a failed completion post: %+v", run)
	}

	poster.fail = nil
	if err := c.FinishRun(ctx, FinishRunInput{RunID: "RUN1", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}
	run, _ = c.DB.GetRun(ctx, "RUN1")
	if run.Lifecycle != "completed" || run.LastDeliveryError.Valid {
		t.Fatalf("run after the retried completion: %+v", run)
	}
}

func TestCheckBeforeWriteReportsOwnerInputUntilResolved(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	c.Health = func() string { return slackapi.SocketConnected }

	for _, ts := range []string{"1700000000.000300", "1700000000.000200"} {
		if _, err := c.DB.InsertOwnerInput(ctx, db.OwnerInput{RunID: "RUN1", MessageTS: ts, Text: "reply " + ts, ReceivedAt: "t"}); err != nil {
			t.Fatal(err)
		}
	}
	want := WriteGate{Kind: GateOwnerInput, Input: &OwnerInput{RunID: "RUN1", ChannelID: "C1", ThreadTS: "1700000000.000100", MessageTS: "1700000000.000200", Text: "reply 1700000000.000200"}}
	gate, err := c.CheckBeforeWrite(ctx, "RUN1")
	if err != nil || gate.Kind != want.Kind || gate.Input == nil || *gate.Input != *want.Input {
		t.Fatalf("with two pending inputs: %+v (input %+v), %v; want the oldest as owner_input", gate, gate.Input, err)
	}

	// A delivery failure outranks the pending input.
	if err := c.DB.SetDeliveryError(ctx, "RUN1", "ratelimited"); err != nil {
		t.Fatal(err)
	}
	if gate, _ := c.CheckBeforeWrite(ctx, "RUN1"); gate.Kind != GateUnavailable {
		t.Fatalf("delivery error with a pending input: %+v", gate)
	}
	if err := c.DB.SetDeliveryError(ctx, "RUN1", ""); err != nil {
		t.Fatal(err)
	}

	bad := OwnerInputResolution{RunID: "RUN1", MessageTS: "1700000000.000200", Outcome: "done", Reply: "ok"}
	if err := c.ResolveOwnerInput(ctx, bad); err == nil {
		t.Fatal("bad outcome accepted")
	}
	missing := OwnerInputResolution{RunID: "RUN1", MessageTS: "9.9", Outcome: "applied", Reply: "ok"}
	if err := c.ResolveOwnerInput(ctx, missing); !errors.Is(err, db.ErrOwnerInputNotPending) {
		t.Fatalf("resolve of an unknown input = %v, want ErrOwnerInputNotPending", err)
	}
	if len(poster.posts) != 1 {
		t.Fatalf("refused resolutions posted; %d posts", len(poster.posts))
	}

	poster.fail = errors.New("channel_not_found")
	res := OwnerInputResolution{RunID: "RUN1", MessageTS: "1700000000.000200", Outcome: "applied", Reply: "Stopping as asked."}
	var delivery *DeliveryError
	if err := c.ResolveOwnerInput(ctx, res); !errors.As(err, &delivery) {
		t.Fatalf("resolve with Slack failing = %v, want *DeliveryError", err)
	}
	if gate, _ := c.CheckBeforeWrite(ctx, "RUN1"); gate.Kind != GateUnavailable {
		t.Fatalf("after a failed acknowledgement: %+v, want unavailable", gate)
	}
	poster.fail = nil

	if err := c.ResolveOwnerInput(ctx, res); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 2 || poster.posts[1] != (post{"C1", "1700000000.000100", "Stopping as asked."}) {
		t.Fatalf("acknowledgement posts = %+v, want one thread reply with the given text", poster.posts)
	}
	if err := c.ResolveOwnerInput(ctx, res); !errors.Is(err, db.ErrOwnerInputNotPending) || len(poster.posts) != 2 {
		t.Fatalf("second resolve = %v with %d posts; want ErrOwnerInputNotPending and no new post", err, len(poster.posts))
	}
	gate, _ = c.CheckBeforeWrite(ctx, "RUN1")
	if gate.Kind != GateOwnerInput || gate.Input.MessageTS != "1700000000.000300" {
		t.Fatalf("after resolving the oldest: %+v (input %+v); want the next input", gate, gate.Input)
	}
	if err := c.ResolveOwnerInput(ctx, OwnerInputResolution{RunID: "RUN1", MessageTS: "1700000000.000300", Outcome: "answered", Reply: "Yes."}); err != nil {
		t.Fatal(err)
	}
	if gate, err := c.CheckBeforeWrite(ctx, "RUN1"); err != nil || !gateIs(gate, GateReady, "") {
		t.Fatalf("after resolving every input: %+v, %v; want ready", gate, err)
	}
}
