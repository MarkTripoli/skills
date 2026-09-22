package assistant

import (
	"context"
	"testing"
	"time"

	"github.com/slack-go/slack/slackevents"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

// startVerify runs VerifyOwner in the background and returns its result
// channel once the setup DM has been posted, so the test can route the reply.
func startVerify(t *testing.T, s *Service, slack *fakeSlack) <-chan ipc.VerifyOwnerResult {
	t.Helper()
	results := make(chan ipc.VerifyOwnerResult, 1)
	go func() {
		res, err := s.VerifyOwner(context.Background())
		if err != nil {
			t.Errorf("VerifyOwner: %v", err)
		}
		results <- res
	}()
	deadline := time.Now().Add(5 * time.Second)
	for {
		s.verifyMu.Lock()
		posted := s.verify != nil && s.verify.ts != ""
		s.verifyMu.Unlock()
		if posted {
			return results
		}
		if time.Now().After(deadline) {
			t.Fatalf("setup DM not posted; posts %+v", slack.posts)
		}
		time.Sleep(time.Millisecond)
	}
}

// awaitVerify returns the verification result or fails after five seconds.
func awaitVerify(t *testing.T, results <-chan ipc.VerifyOwnerResult) ipc.VerifyOwnerResult {
	t.Helper()
	select {
	case res := <-results:
		return res
	case <-time.After(5 * time.Second):
		t.Fatal("VerifyOwner did not return")
		return ipc.VerifyOwnerResult{}
	}
}

func TestVerifyOwnerResolvesOnTheOwnersAnswerWithoutARequest(t *testing.T) {
	cases := []struct {
		name  string
		reply func(setupTS string) *slackevents.MessageEvent
	}{
		{"top-level DM after the post", func(setupTS string) *slackevents.MessageEvent {
			return dm("U1", "1700000000.999999", "", "here")
		}},
		{"reply in the post's thread", func(setupTS string) *slackevents.MessageEvent {
			return dm("U1", "1700000000.999999", setupTS, "here")
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, slack, _ := newTestService(t)
			results := startVerify(t, s, slack)
			if len(slack.opened) != 1 || slack.opened[0] != "U1" || len(slack.posts) != 1 || slack.posts[0] != (slackPost{"D1", "", verifyText}) {
				t.Fatalf("opened %v posts %+v; want the owner's DM opened and the setup text posted", slack.opened, slack.posts)
			}
			s.verifyMu.Lock()
			reply := tc.reply(s.verify.ts)
			s.verifyMu.Unlock()
			routeDMEvent(t, s, reply)

			res := awaitVerify(t, results)
			if res != (ipc.VerifyOwnerResult{OK: true, DisplayName: "ada"}) {
				t.Fatalf("result = %+v, want ok with the owner's display name", res)
			}
			if _, ok, _ := s.DB.GetDMRequest(context.Background(), reply.TimeStamp); ok {
				t.Fatal("the verification reply was stored as a dm_requests row")
			}
			if len(slack.reactions) != 0 || len(slack.posts) != 1 {
				t.Fatalf("reactions %+v posts %+v; the reply must get no reaction or ack", slack.reactions, slack.posts)
			}
			wantWake(t, s, false)
			if s.verify != nil {
				t.Fatal("verification slot still held after the reply")
			}
		})
	}
}

func TestVerifyOwnerIgnoresADMOlderThanTheSetupPost(t *testing.T) {
	s, slack, _ := newTestService(t)
	results := startVerify(t, s, slack)

	routeDMEvent(t, s, dm("U1", "1600000000.000001", "", "sent before setup"))
	select {
	case res := <-results:
		t.Fatalf("an older DM resolved the verification: %+v", res)
	case <-time.After(50 * time.Millisecond):
	}
	if _, ok, _ := s.DB.GetDMRequest(context.Background(), "1600000000.000001"); !ok {
		t.Fatal("the older DM was not routed as an ordinary request")
	}

	routeDMEvent(t, s, dm("U1", "1700000000.999999", "", "now"))
	if res := awaitVerify(t, results); !res.OK {
		t.Fatalf("result = %+v after the later DM", res)
	}
}

func TestVerifyOwnerTimesOutAndReleasesTheSlot(t *testing.T) {
	s, slack, _ := newTestService(t)
	s.verifyTimeout = 20 * time.Millisecond
	res := awaitVerify(t, startVerify(t, s, slack))
	if res != (ipc.VerifyOwnerResult{Timeout: true}) {
		t.Fatalf("result = %+v, want timeout", res)
	}
	if s.verify != nil {
		t.Fatal("verification slot still held after the timeout")
	}
	// A late reply is an ordinary request again.
	routeDMEvent(t, s, dm("U1", "1700000000.999999", "", "late"))
	if _, ok, _ := s.DB.GetDMRequest(context.Background(), "1700000000.999999"); !ok {
		t.Fatal("a DM after the timeout was not routed as a request")
	}
}

func TestVerifyOwnerRefusesASecondWaiter(t *testing.T) {
	s, slack, _ := newTestService(t)
	results := startVerify(t, s, slack)
	if _, err := s.VerifyOwner(context.Background()); err != errVerifyPending {
		t.Fatalf("second VerifyOwner error = %v, want errVerifyPending", err)
	}
	routeDMEvent(t, s, dm("U1", "1700000000.999999", "", "here"))
	awaitVerify(t, results)
}
