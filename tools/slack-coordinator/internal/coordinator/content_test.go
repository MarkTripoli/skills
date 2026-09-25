package coordinator

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
	"github.com/slack-go/slack"
)

type fakeContent struct {
	channel, thread string
	uploads         int
	uploadErr       error
	onUpload        func()
}

func (f *fakeContent) Files(_ context.Context, channel string, _ int) ([]slack.File, *slack.Paging, error) {
	f.channel = channel
	return []slack.File{{ID: "F1"}}, &slack.Paging{Pages: 1}, nil
}
func (f *fakeContent) Bookmarks(_ context.Context, channel string) ([]slack.Bookmark, error) {
	f.channel = channel
	return []slack.Bookmark{{ID: "B1"}}, nil
}
func (f *fakeContent) FileInfo(_ context.Context, id string) (*slack.File, error) {
	if id == "FTab" {
		return &slack.File{ID: id, Filetype: "list"}, nil
	}
	if id == "FOther" {
		return &slack.File{ID: id, Filetype: "list", Channels: []string{"Cother"}}, nil
	}
	if id == "FList" {
		return &slack.File{ID: id, Filetype: "list", Channels: []string{f.channel}}, nil
	}
	return &slack.File{ID: id, Permalink: "https://slack.test/canvas"}, nil
}
func (f *fakeContent) ListItems(_ context.Context, id, cursor string) (json.RawMessage, error) {
	return json.RawMessage(`{"ok":true,"items":[{"id":"Rec1"}],"response_metadata":{"next_cursor":""}}`), nil
}
func (f *fakeContent) ConversationInfo(_ context.Context, channel string) (*slack.Channel, error) {
	return &slack.Channel{Properties: &slack.Properties{Canvas: slack.Canvas{FileId: "FCanvas"}, Tabs: []slack.Tab{{ID: "FTab", Type: "list", Label: "Sprint"}}}}, nil
}
func (f *fakeContent) UploadContent(_ context.Context, channel, thread, name, title string, data io.Reader, _ int64) (slack.FileSummary, error) {
	f.uploads++
	f.channel, f.thread = channel, thread
	if f.onUpload != nil {
		f.onUpload()
	}
	if f.uploadErr != nil {
		return slack.FileSummary{}, f.uploadErr
	}
	return slack.FileSummary{ID: "F2", Title: title}, nil
}

func TestRunContentScopedAndUploadGated(t *testing.T) {
	c, _, _ := newTestCoordinator(t)
	startTestRun(t, c, "RUN1")
	content := &fakeContent{}
	c.Content = content
	ctx := context.Background()
	result, err := c.ListContent(ctx, ContentParams{RunID: "RUN1"})
	if err != nil || len(result.Files) != 1 || len(result.Bookmarks) != 1 || result.CanvasID != "FCanvas" || result.CanvasURL != "https://slack.test/canvas" || content.channel == "" {
		t.Fatalf("list: %+v %v", result, err)
	}
	items, err := c.ListItems(ctx, ListItemsParams{RunID: "RUN1", ListID: "FList"})
	if err != nil || !strings.Contains(string(items), "Rec1") {
		t.Fatalf("list items: %s %v", items, err)
	}
	if _, err := c.ListItems(ctx, ListItemsParams{RunID: "RUN1", ListID: "FTab"}); err != nil {
		t.Fatalf("tab list: %v", err)
	}
	if _, err := c.ListItems(ctx, ListItemsParams{RunID: "RUN1", ListID: "FCanvas"}); err == nil {
		t.Fatal("canvas accepted as list")
	}
	if _, err := c.ListItems(ctx, ListItemsParams{RunID: "RUN1", ListID: "FOther"}); err == nil {
		t.Fatal("other channel list accepted")
	}
	if _, err := c.ListContent(ctx, ContentParams{RunID: "RUN1", Page: -1}); err == nil {
		t.Fatal("negative page accepted")
	}
	path := filepath.Join(t.TempDir(), "hello.txt")
	if err := os.WriteFile(path, []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}
	in := UploadParams{RunID: "RUN1", Path: path}
	if _, err := c.UploadContent(ctx, in); err == nil || !strings.Contains(err.Error(), "unavailable") || content.uploads != 0 {
		t.Fatalf("ungated upload: %v, count %d", err, content.uploads)
	}
	c.Health = func() string { return slackapi.SocketConnected }
	file, err := c.UploadContent(ctx, in)
	if err != nil || file.ID != "F2" || file.Title != "hello.txt" || content.uploads != 1 || content.thread == "" {
		t.Fatalf("upload: %+v %v, fake %+v", file, err, content)
	}
}

func TestUploadFailureStaysUnavailableAcrossStatusRecovery(t *testing.T) {
	c, poster, now := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	c.Health = func() string { return slackapi.SocketConnected }
	*now = now.Add(3 * time.Hour)
	if err := c.RecordWorkEvent(ctx, WorkEvent{RunID: "RUN1", Current: "Working"}); err != nil {
		t.Fatal(err)
	}

	content := &fakeContent{uploadErr: context.DeadlineExceeded}
	c.Content = content
	path := filepath.Join(t.TempDir(), "report.txt")
	if err := os.WriteFile(path, []byte("report"), 0600); err != nil {
		t.Fatal(err)
	}
	_, uploadErr := c.UploadContent(ctx, UploadParams{RunID: "RUN1", Path: path})
	var delivery *DeliveryError
	if !errors.As(uploadErr, &delivery) || !strings.Contains(uploadErr.Error(), "upload content") {
		t.Fatalf("failed upload = %v, want *DeliveryError", uploadErr)
	}

	run, err := c.DB.GetRun(ctx, "RUN1")
	if err != nil || !run.LastDeliveryError.Valid || !strings.HasPrefix(run.LastDeliveryError.String, db.UploadOutcomeUncertainPrefix) {
		t.Fatalf("upload uncertainty was not persisted: run=%+v err=%v", run, err)
	}
	gate, err := c.CheckBeforeWrite(ctx, "RUN1")
	if err != nil || gate.Kind != GateUnavailable || gate.Reason != run.LastDeliveryError.String {
		t.Fatalf("gate after ambiguous upload = %+v, %v", gate, err)
	}

	poster.fail = errors.New("channel_not_found")
	if err := c.RecordWorkEvent(ctx, WorkEvent{RunID: "RUN1", Current: "Still working"}); err == nil {
		t.Fatal("later status delivery failure was hidden")
	}
	updatesAfterFailure := len(poster.updates)
	scheduler := &StatusScheduler{C: c}
	if err := scheduler.Tick(ctx, now.Add(3*time.Hour)); err != nil {
		t.Fatal(err)
	}
	poster.fail = nil
	if err := scheduler.Tick(ctx, now.Add(4*time.Hour)); err != nil {
		t.Fatal(err)
	}
	run, err = c.DB.GetRun(ctx, "RUN1")
	if err != nil || !run.LastDeliveryError.Valid || !strings.HasPrefix(run.LastDeliveryError.String, db.UploadOutcomeUncertainPrefix) {
		t.Fatalf("later failure or scheduler retry replaced upload uncertainty: run=%+v err=%v", run, err)
	}
	if len(poster.updates) != updatesAfterFailure {
		t.Fatalf("scheduler edited uncertain upload status: before=%d after=%d", updatesAfterFailure, len(poster.updates))
	}
	gate, err = c.CheckBeforeWrite(ctx, "RUN1")
	if err != nil || gate.Kind != GateUnavailable {
		t.Fatalf("gate after status failure and scheduler tick = %+v, %v", gate, err)
	}
	if _, err := c.UploadContent(ctx, UploadParams{RunID: "RUN1", Path: path}); err == nil || !strings.Contains(err.Error(), "unavailable") || content.uploads != 1 {
		t.Fatalf("uncertain upload was retried: err=%v uploads=%d", err, content.uploads)
	}
}

func TestUploadSerializesWithDisableSlack(t *testing.T) {
	c, _, _ := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	c.Health = func() string { return slackapi.SocketConnected }
	path := filepath.Join(t.TempDir(), "report.txt")
	if err := os.WriteFile(path, []byte("report"), 0600); err != nil {
		t.Fatal(err)
	}
	entered, release := make(chan struct{}), make(chan struct{})
	content := &fakeContent{onUpload: func() {
		close(entered)
		<-release
	}}
	defer func() {
		select {
		case <-release:
		default:
			close(release)
		}
	}()
	c.Content = content
	uploadDone := make(chan error, 1)
	go func() {
		_, err := c.UploadContent(ctx, UploadParams{RunID: "RUN1", Path: path})
		uploadDone <- err
	}()
	select {
	case <-entered:
	case <-time.After(2 * time.Second):
		t.Fatal("upload did not enter Slack client")
	}

	disableStarted := make(chan struct{})
	disableDone := make(chan error, 1)
	go func() {
		close(disableStarted)
		disableDone <- c.DisableSlackForRun(ctx, "RUN1")
	}()
	<-disableStarted
	select {
	case err := <-disableDone:
		t.Fatalf("disable completed while upload was still in flight: %v", err)
	case <-time.After(25 * time.Millisecond):
	}
	close(release)
	if err := <-uploadDone; err != nil {
		t.Fatalf("upload: %v", err)
	}
	if err := <-disableDone; err != nil {
		t.Fatalf("disable: %v", err)
	}
	if _, err := c.UploadContent(ctx, UploadParams{RunID: "RUN1", Path: path}); err == nil || content.uploads != 1 {
		t.Fatalf("upload after disable was not refused: err=%v uploads=%d", err, content.uploads)
	}
}
