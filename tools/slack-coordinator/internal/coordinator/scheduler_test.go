package coordinator

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

type post struct{ ChannelID, ThreadTS, Text string }

// fakePoster records every post and answers with a fixed ts and permalink.
type fakePoster struct {
	posts []post
	fail  error
}

func (f *fakePoster) PostMessage(_ context.Context, channelID, threadTS, mrkdwn string) (string, error) {
	if f.fail != nil {
		return "", f.fail
	}
	f.posts = append(f.posts, post{channelID, threadTS, mrkdwn})
	return "1700000000.000100", nil
}

func (f *fakePoster) Permalink(_ context.Context, channelID, ts string) (string, error) {
	return "https://t.slack.com/archives/" + channelID + "/p" + ts, nil
}

// newTestCoordinator returns a coordinator over a temp database whose clock
// the test advances through the returned pointer.
func newTestCoordinator(t *testing.T) (*Coordinator, *fakePoster, *time.Time) {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	now := time.Date(2026, 9, 21, 10, 0, 0, 0, time.UTC)
	poster := &fakePoster{}
	c := &Coordinator{DB: database, Slack: poster, Now: func() time.Time { return now }, OwnerUserID: "U1", Quiet: time.Hour}
	return c, poster, &now
}

func startTestRun(t *testing.T, c *Coordinator, runID string) {
	t.Helper()
	if _, err := c.StartRun(context.Background(), StartRunInput{RunID: runID, ChannelID: "C1", Work: "w"}); err != nil {
		t.Fatal(err)
	}
}

func TestSchedulerRepostsAfterOneQuietInterval(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	s := &StatusScheduler{C: c}
	start := *now

	if err := s.Tick(ctx, start.Add(59*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 1 {
		t.Fatalf("Tick before the quiet interval posted; %d posts (root included)", len(poster.posts))
	}

	if err := s.Tick(ctx, start.Add(61*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 2 {
		t.Fatalf("Tick after the quiet interval made %d posts, want 2", len(poster.posts))
	}
	status := poster.posts[1]
	if status.ThreadTS != "1700000000.000100" || status.ChannelID != "C1" {
		t.Fatalf("status posted outside the thread: %+v", status)
	}
	if status.Text != statusEmptyGolden {
		t.Fatalf("status with no prior event =\n%s\nwant\n%s", status.Text, statusEmptyGolden)
	}

	if err := s.Tick(ctx, start.Add(61*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 2 {
		t.Fatalf("second Tick at the same time posted again; %d posts", len(poster.posts))
	}

	// A new event restarts the interval and becomes the reposted content.
	*now = start.Add(90 * time.Minute)
	if err := c.RecordWorkEvent(ctx, WorkEvent{RunID: "RUN1", Current: "Wiring flags", Blockers: []string{"Waiting on review"}}); err != nil {
		t.Fatal(err)
	}
	if err := s.Tick(ctx, start.Add(2*time.Hour+29*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 3 {
		t.Fatalf("event did not restart the quiet interval; %d posts", len(poster.posts))
	}
	if err := s.Tick(ctx, start.Add(2*time.Hour+31*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 4 {
		t.Fatalf("no repost after the restarted interval; %d posts", len(poster.posts))
	}
	if poster.posts[3].Text != poster.posts[2].Text || !strings.Contains(poster.posts[3].Text, "• Waiting on review") {
		t.Fatalf("repost differs from the last status:\n%s\nvs\n%s", poster.posts[3].Text, poster.posts[2].Text)
	}
}

func TestSchedulerSkipsFinishedRuns(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	if err := c.FinishRun(ctx, FinishRunInput{RunID: "RUN1", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}
	if err := (&StatusScheduler{C: c}).Tick(ctx, now.Add(3*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 2 {
		t.Fatalf("finished run reposted status; %d posts, want root and completion only", len(poster.posts))
	}
}

func TestSchedulerReportsPostFailureAndRetries(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	s := &StatusScheduler{C: c}

	poster.fail = context.DeadlineExceeded
	if err := s.Tick(ctx, now.Add(2*time.Hour)); err == nil || !strings.Contains(err.Error(), "RUN1") {
		t.Fatalf("Tick error = %v, want the failing run named", err)
	}
	poster.fail = nil
	if err := s.Tick(ctx, now.Add(2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != 2 {
		t.Fatalf("run stayed due after a failed post but was not retried; %d posts", len(poster.posts))
	}
}
