package coordinator

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/jira"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

type jiraRequest struct {
	Method, Path, User, Pass, Body string
}

// fakeJira records every request and answers with status.
type fakeJira struct {
	mu       sync.Mutex
	requests []jiraRequest
	status   atomic.Int32
}

func (f *fakeJira) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.requests)
}

func (f *fakeJira) request(i int) jiraRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.requests[i]
}

// newJiraCoordinator is newTestCoordinator with a connected Socket Mode and a
// Jira client pointed at a fake server that starts by answering status.
func newJiraCoordinator(t *testing.T, status int) (*Coordinator, *fakeJira, *time.Time) {
	t.Helper()
	f := &fakeJira{}
	f.status.Store(int32(status))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		user, pass, _ := r.BasicAuth()
		f.mu.Lock()
		f.requests = append(f.requests, jiraRequest{r.Method, r.URL.Path, user, pass, string(body)})
		f.mu.Unlock()
		code := int(f.status.Load())
		if code != http.StatusNoContent {
			http.Error(w, `{"errorMessages":["field cannot be set"]}`, code)
			return
		}
		w.WriteHeader(code)
	}))
	t.Cleanup(srv.Close)
	client, err := jira.New(config.Jira{BaseURL: srv.URL, Email: "me@example.com", APIToken: "tok", FieldID: "customfield_10042"})
	if err != nil {
		t.Fatal(err)
	}
	c, _, now := newTestCoordinator(t)
	c.Health = func() string { return slackapi.SocketConnected }
	c.Jira = client
	return c, f, now
}

func backlinkRow(t *testing.T, c *Coordinator, runID string) db.Backlink {
	t.Helper()
	b, err := c.DB.GetBacklink(context.Background(), runID)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestBacklinkWritesPermalinkToTheConfiguredField(t *testing.T) {
	c, f, _ := newJiraCoordinator(t, http.StatusNoContent)
	ref, err := c.StartRun(context.Background(), StartRunInput{RunID: "RUN1", OwnerUserID: "U1", ChannelID: "C1", Work: "w", JiraIssue: "PROJ-7"})
	if err != nil {
		t.Fatal(err)
	}
	if f.count() != 1 {
		t.Fatalf("jira requests = %d, want 1", f.count())
	}
	want := jiraRequest{
		Method: http.MethodPut,
		Path:   "/rest/api/3/issue/PROJ-7",
		User:   "me@example.com",
		Pass:   "tok",
		Body:   `{"fields":{"customfield_10042":"` + ref.Permalink + `"}}`,
	}
	if got := f.request(0); got != want {
		t.Fatalf("request = %+v, want %+v", got, want)
	}
	b := backlinkRow(t, c, "RUN1")
	if b.State != db.BacklinkDelivered || b.Attempts != 1 || b.LastError.Valid || b.IssueKey != "PROJ-7" || b.ThreadURL != ref.Permalink {
		t.Fatalf("row after success = %+v", b)
	}
	if err := (&StatusScheduler{C: c}).Tick(context.Background(), time.Now()); err != nil || f.count() != 1 {
		t.Fatalf("delivered backlink retried: %d requests, %v", f.count(), err)
	}
}

func TestBacklinkFailureStaysPendingAndRetriesWithBackoff(t *testing.T) {
	c, f, now := newJiraCoordinator(t, http.StatusInternalServerError)
	ctx := context.Background()
	start := *now
	if _, err := c.StartRun(ctx, StartRunInput{RunID: "RUN1", OwnerUserID: "U1", ChannelID: "C1", Work: "w", JiraIssue: "PROJ-7"}); err != nil {
		t.Fatalf("a failed backlink failed the start: %v", err)
	}
	b := backlinkRow(t, c, "RUN1")
	if b.State != db.BacklinkPending || b.Attempts != 1 || !b.LastError.Valid || b.NextAttemptAt != stamp(start.Add(30*time.Second)) {
		t.Fatalf("row after one failure = %+v", b)
	}
	if gate, err := c.CheckBeforeWrite(ctx, "RUN1"); err != nil || gate.Kind != GateReady {
		t.Fatalf("run check after a jira failure = %+v, %v; want ready", gate, err)
	}

	sched := &StatusScheduler{C: c}
	if err := sched.Tick(ctx, start.Add(29*time.Second)); err != nil || f.count() != 1 {
		t.Fatalf("tick before next_attempt_at: %d requests, %v", f.count(), err)
	}
	if err := sched.Tick(ctx, start.Add(30*time.Second)); err == nil || f.count() != 2 {
		t.Fatalf("tick at next_attempt_at: %d requests, err %v; want a second attempt that reports its failure", f.count(), err)
	}
	b = backlinkRow(t, c, "RUN1")
	if b.State != db.BacklinkPending || b.Attempts != 2 || b.NextAttemptAt != stamp(start.Add(90*time.Second)) {
		t.Fatalf("row after two failures = %+v; want next attempt 60s after the second", b)
	}

	f.status.Store(http.StatusNoContent)
	if err := sched.Tick(ctx, start.Add(90*time.Second)); err != nil || f.count() != 3 {
		t.Fatalf("tick once jira recovers: %d requests, %v", f.count(), err)
	}
	b = backlinkRow(t, c, "RUN1")
	if b.State != db.BacklinkDelivered || b.Attempts != 3 || b.LastError.Valid {
		t.Fatalf("row after recovery = %+v", b)
	}
	if gate, err := c.CheckBeforeWrite(ctx, "RUN1"); err != nil || gate.Kind != GateReady {
		t.Fatalf("run check after recovery = %+v, %v", gate, err)
	}
}

func TestStartRunWithoutJiraIssueNeverCallsJira(t *testing.T) {
	c, f, now := newJiraCoordinator(t, http.StatusNoContent)
	startTestRun(t, c, "RUN1")
	if err := (&StatusScheduler{C: c}).Tick(context.Background(), now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if f.count() != 0 {
		t.Fatalf("jira requests = %d, want 0", f.count())
	}
	if _, err := c.DB.GetBacklink(context.Background(), "RUN1"); err == nil {
		t.Fatal("a run without --jira-issue got a backlink row")
	}
}

func TestStartRunRefusesJiraIssueWhenJiraIsNotConfigured(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	_, err := c.StartRun(context.Background(), StartRunInput{RunID: "RUN1", OwnerUserID: "U1", ChannelID: "C1", JiraIssue: "PROJ-7"})
	if err == nil || len(poster.posts) != 0 {
		t.Fatalf("err = %v, posts = %d; want a refusal before any post", err, len(poster.posts))
	}
}

func TestBackoffDoublesFrom30sAndCapsAtOneHour(t *testing.T) {
	cases := map[int]time.Duration{0: 30 * time.Second, 1: time.Minute, 6: 32 * time.Minute, 7: time.Hour, 40: time.Hour}
	for n, want := range cases {
		if got := backoff(n); got != want {
			t.Errorf("backoff(%d) = %v, want %v", n, got, want)
		}
	}
}
