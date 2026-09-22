package assistant

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// verbReply sends text as an owner top-level DM and returns the one message
// posted in answer, failing unless exactly one top-level post was added.
func verbReply(t *testing.T, s *Service, slack *fakeSlack, ts, text string) string {
	t.Helper()
	before := len(slack.posts)
	routeDMEvent(t, s, dm("U1", ts, "", text))
	if len(slack.posts) != before+1 {
		t.Fatalf("%q produced %d posts, want one", text, len(slack.posts)-before)
	}
	post := slack.posts[before]
	if post.channel != "D1" || post.thread != "" {
		t.Fatalf("%q was answered in %s thread %q, want the top level of D1", text, post.channel, post.thread)
	}
	return post.text
}

// wantHelp fails unless reply is the help table naming all eight verbs.
func wantHelp(t *testing.T, reply string) {
	t.Helper()
	for _, verb := range []string{"!help", "!status", "!tasks", "!show <id>", "!runs", "!pause <id>", "!resume <id>", "!cancel <id>"} {
		if !strings.Contains(reply, verb) {
			t.Errorf("help does not list %s:\n%s", verb, reply)
		}
	}
	if !strings.HasSuffix(reply, "Anything else sent here goes to the assistant.") {
		t.Errorf("help does not end with the assistant pointer:\n%s", reply)
	}
}

func TestHelpListsEveryVerb(t *testing.T) {
	s, slack, _ := newTestService(t)
	wantHelp(t, verbReply(t, s, slack, "1700000000.001000", "!help"))
}

func TestUnknownVerbAndBareBangAnswerWithHelp(t *testing.T) {
	s, slack, _ := newTestService(t)
	wantHelp(t, verbReply(t, s, slack, "1700000000.001000", "!bogus now"))
	wantHelp(t, verbReply(t, s, slack, "1700000000.002000", "!"))
}

func TestVerbDispatchIgnoresCase(t *testing.T) {
	s, slack, _ := newTestService(t)
	if reply := verbReply(t, s, slack, "1700000000.001000", "!Help"); reply != helpText {
		t.Fatalf("!Help answered %q, want the help table", reply)
	}
	if reply := verbReply(t, s, slack, "1700000000.002000", "!RUNS"); reply != noActiveRunsReply {
		t.Fatalf("!RUNS answered %q, want %q", reply, noActiveRunsReply)
	}
}

func TestStatusReportsTheDaemon(t *testing.T) {
	s, slack, clock := newTestService(t)
	ctx := context.Background()
	s.Coord.Health = func() string { return slackapi.SocketConnected }
	startTestRun(t, s.Coord, "RUN1")
	startTestRun(t, s.Coord, "RUN2")
	if err := s.Coord.FinishRun(ctx, coordinator.FinishRunInput{RunID: "RUN2", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"A1", "A2"} {
		if err := s.DB.InsertAssistantRun(ctx, db.AssistantRun{RunID: id, Kind: db.RunKindDM, State: db.RunDone, QueuedAt: "2026-09-21T09:00:00Z"}); err != nil {
			t.Fatal(err)
		}
	}
	runDir := s.Paths.RunDir("A1")
	if err := os.MkdirAll(runDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(runDir, "out.log"), make([]byte, 2048), 0o600); err != nil {
		t.Fatal(err)
	}
	clock.at = clock.at.Add(90 * time.Minute)

	reply := verbReply(t, s, slack, "1700000000.001000", "!status")

	lines := strings.Split(reply, "\n")
	want := []string{
		"up 1h30m0s",
		"socket mode: connected",
		"active runs: 1",
		"tasks: active 0 · paused 0 · completed 0 · cancelled 0",
		"agent: omp (approval: edits)",
		"messages: 0 · runs: 2",
	}
	if len(lines) != len(want)+1 {
		t.Fatalf("status has %d lines, want %d:\n%s", len(lines), len(want)+1, reply)
	}
	for i, line := range want {
		if lines[i] != line {
			t.Errorf("status line %d = %q, want %q", i+1, lines[i], line)
		}
	}
	// SQLite's file sizes vary; the database is non-zero and the workspace is
	// exactly the 2048-byte file written above.
	if disk := regexp.MustCompile(`^disk: [1-9][0-9.]* [KMGT]?B db · 2\.0 KB runs$`); !disk.MatchString(lines[6]) {
		t.Errorf("disk line = %q, want non-zero db bytes and 2.0 KB runs", lines[6])
	}
}

func TestStatusWithoutAgentOrWorkspace(t *testing.T) {
	s, slack, _ := newTestService(t)
	s.Agent = nil

	reply := verbReply(t, s, slack, "1700000000.001000", "!status")

	if !strings.Contains(reply, "\nagent: none\n") {
		t.Errorf("status without an agent:\n%s", reply)
	}
	if !strings.HasSuffix(reply, " db · 0 B runs") {
		t.Errorf("status without a workspace should report 0 B runs:\n%s", reply)
	}
}

func TestRunsListsActiveRunsOnly(t *testing.T) {
	s, slack, _ := newTestService(t)
	ctx := context.Background()
	if reply := verbReply(t, s, slack, "1700000000.001000", "!runs"); reply != noActiveRunsReply {
		t.Fatalf("!runs with no runs answered %q, want %q", reply, noActiveRunsReply)
	}

	startTestRun(t, s.Coord, "RUN1")
	startTestRun(t, s.Coord, "RUN2")
	if err := s.Coord.FinishRun(ctx, coordinator.FinishRunInput{RunID: "RUN2", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}
	run, err := s.DB.GetRun(ctx, "RUN1")
	if err != nil {
		t.Fatal(err)
	}

	reply := verbReply(t, s, slack, "1700000000.002000", "!runs")

	want := "RUN1 · C1 · started 2026-09-21T10:00:00Z · " + run.Permalink
	if reply != want {
		t.Fatalf("!runs answered %q, want %q", reply, want)
	}
}

func TestVerbsWriteNoRows(t *testing.T) {
	s, slack, _ := newTestService(t)
	ctx := context.Background()
	for i, text := range []string{"!help", "!status", "!runs", "!tasks", "!show 1", "!pause 1", "!resume 1", "!cancel 1", "!bogus", "!", "  !status"} {
		ts := "1700000000.00" + string(rune('a'+i)) + "000"
		routeDMEvent(t, s, dm("U1", ts, "", text))
		if _, ok, _ := s.DB.GetDMRequest(ctx, ts); ok {
			t.Errorf("%q opened a dm_requests row", text)
		}
	}
	if n, _ := s.DB.CountAssistantRuns(ctx); n != 0 {
		t.Errorf("assistant_runs has %d rows after verbs, want 0", n)
	}
	if len(slack.reactions) != 0 {
		t.Errorf("verbs reacted %+v, want no reactions", slack.reactions)
	}
	wantWake(t, s, false)
	for i := 3; i < 8; i++ {
		if slack.posts[i].text != notAvailableReply {
			t.Errorf("task verb answered %q, want %q", slack.posts[i].text, notAvailableReply)
		}
	}
}
