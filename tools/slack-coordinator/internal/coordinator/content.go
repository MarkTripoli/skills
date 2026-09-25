package coordinator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/slack-go/slack"
)

// ContentClient owns Slack operations beyond posting run messages.
type ContentClient interface {
	Files(context.Context, string, int) ([]slack.File, *slack.Paging, error)
	Bookmarks(context.Context, string) ([]slack.Bookmark, error)
	FileInfo(context.Context, string) (*slack.File, error)
	ListItems(context.Context, string, string) (json.RawMessage, error)
	ConversationInfo(context.Context, string) (*slack.Channel, error)
	UploadContent(context.Context, string, string, string, string, io.Reader, int64) (slack.FileSummary, error)
}

// ContentParams scopes discovery to the channel of an active run.
type ContentParams struct {
	RunID string `json:"run_id"`
	Page  int    `json:"page,omitempty"`
}

// ContentResult lists channel files and bookmarks plus its canvas, if present.
type ContentResult struct {
	Files     []slack.File     `json:"files"`
	Bookmarks []slack.Bookmark `json:"bookmarks"`
	CanvasID  string           `json:"canvas_id,omitempty"`
	CanvasURL string           `json:"canvas_url,omitempty"`
	Page      int              `json:"page"`
	Pages     int              `json:"pages"`
}

// ListItemsParams reads one page from a Slack List accessible in the run channel.
type ListItemsParams struct {
	RunID  string `json:"run_id"`
	ListID string `json:"list_id"`
	Cursor string `json:"cursor,omitempty"`
}

// ListItems validates the list's channel access before requesting its items.
func (c *Coordinator) ListItems(ctx context.Context, in ListItemsParams) (json.RawMessage, error) {
	if in.ListID == "" {
		return nil, errors.New("list_id is required")
	}
	run, err := c.activeRun(ctx, in.RunID)
	if err != nil {
		return nil, err
	}
	if run.SlackMode == db.SlackDisabled {
		return nil, fmt.Errorf("slack disabled for run %s", in.RunID)
	}
	if c.Content == nil {
		return nil, errors.New("Slack content operations unavailable")
	}
	file, err := c.Content.FileInfo(ctx, in.ListID)
	if err != nil {
		return nil, fmt.Errorf("get list %s: %w", in.ListID, err)
	}
	accessible := file != nil && file.Filetype == "list" && containsChannel(file, run.ChannelID)
	if !accessible {
		conversation, infoErr := c.Content.ConversationInfo(ctx, run.ChannelID)
		if infoErr != nil {
			return nil, fmt.Errorf("get run channel info: %w", infoErr)
		}
		if conversation != nil && conversation.Properties != nil {
			for _, tab := range conversation.Properties.Tabs {
				if tab.ID == in.ListID && tab.Type == "list" {
					accessible = true
					break
				}
			}
		}
	}
	if !accessible {
		return nil, fmt.Errorf("list %s is not available in run channel %s", in.ListID, run.ChannelID)
	}
	result, err := c.Content.ListItems(ctx, in.ListID, in.Cursor)
	if err != nil {
		return nil, fmt.Errorf("list items %s: %w", in.ListID, err)
	}
	if !json.Valid(result) {
		return nil, errors.New("Slack returned invalid list items JSON")
	}
	return result, nil
}

func containsChannel(file *slack.File, channel string) bool {
	if file == nil || channel == "" {
		return false
	}
	for _, id := range file.Channels {
		if id == channel {
			return true
		}
	}
	return false
}

// UploadParams describes a local file to share in the run thread.
type UploadParams struct {
	RunID string `json:"run_id"`
	Path  string `json:"path"`
	Title string `json:"title,omitempty"`
}

// UploadResult is the Slack file summary returned for a successful upload.
type UploadResult = slack.FileSummary

// ListContent exposes files, bookmarks and a channel canvas without inferring
// contents of folders or lists from the ordinary file listing.
func (c *Coordinator) ListContent(ctx context.Context, in ContentParams) (ContentResult, error) {
	if in.Page < 0 {
		return ContentResult{}, errors.New("page must not be negative")
	}
	run, err := c.activeRun(ctx, in.RunID)
	if err != nil {
		return ContentResult{}, err
	}
	if run.SlackMode == db.SlackDisabled {
		return ContentResult{}, fmt.Errorf("slack disabled for run %s", in.RunID)
	}
	if c.Content == nil {
		return ContentResult{}, errors.New("Slack content operations unavailable")
	}
	files, paging, err := c.Content.Files(ctx, run.ChannelID, in.Page)
	if err != nil {
		return ContentResult{}, fmt.Errorf("list channel files: %w", err)
	}
	bookmarks, err := c.Content.Bookmarks(ctx, run.ChannelID)
	if err != nil {
		return ContentResult{}, fmt.Errorf("list channel bookmarks: %w", err)
	}
	conversation, err := c.Content.ConversationInfo(ctx, run.ChannelID)
	if err != nil {
		return ContentResult{}, fmt.Errorf("get run channel info: %w", err)
	}
	result := ContentResult{Files: files, Bookmarks: bookmarks, Page: in.Page}
	if paging != nil {
		result.Pages = paging.Pages
	}
	if conversation != nil && conversation.Properties != nil {
		result.CanvasID = conversation.Properties.Canvas.FileId
		if result.CanvasID != "" {
			canvas, err := c.Content.FileInfo(ctx, result.CanvasID)
			if err != nil {
				return ContentResult{}, fmt.Errorf("get channel canvas: %w", err)
			}
			if canvas != nil {
				result.CanvasURL = canvas.Permalink
			}
		}
	}
	return result, nil
}

// ContentGateError describes a content operation refused by run.check.
type ContentGateError struct{ Kind, Reason string }

func (e *ContentGateError) Error() string { return fmt.Sprintf("run check: %s: %s", e.Kind, e.Reason) }

// UploadContent shares a local file in the run thread after a fresh write gate.
// A failed gate never reads the file or starts an external upload.
// Upload errors remain unavailable because Slack may have accepted the file
// despite returning an error. If the outcome cannot be reconciled, run.disable_slack
// is the break-glass route to stop further Slack work for this run.
func (c *Coordinator) UploadContent(ctx context.Context, in UploadParams) (UploadResult, error) {
	c.statusMu.Lock()
	defer c.statusMu.Unlock()

	gate, err := c.CheckBeforeWrite(ctx, in.RunID)
	if err != nil {
		return UploadResult{}, err
	}
	if gate.Kind != GateReady {
		return UploadResult{}, &ContentGateError{Kind: gate.Kind, Reason: gate.Reason}
	}
	if in.Path == "" {
		return UploadResult{}, errors.New("path is required")
	}
	if c.Content == nil {
		return UploadResult{}, errors.New("Slack content operations unavailable")
	}
	file, err := os.Open(in.Path)
	if err != nil {
		return UploadResult{}, fmt.Errorf("open upload file: %w", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return UploadResult{}, fmt.Errorf("stat upload file: %w", err)
	}
	if !info.Mode().IsRegular() {
		return UploadResult{}, errors.New("upload path must be a regular file")
	}
	name := filepath.Base(in.Path)
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = name
	}
	run, err := c.activeRun(ctx, in.RunID)
	if err != nil {
		return UploadResult{}, err
	}
	if run.SlackMode == db.SlackDisabled {
		return UploadResult{}, &ContentGateError{Kind: GateSlackDisabled, Reason: "Slack is disabled for this run"}
	}
	result, err := c.Content.UploadContent(ctx, run.ChannelID, run.ThreadTS, name, title, file, info.Size())
	if err != nil {
		deliveryErr := fmt.Errorf("upload content: %w", err)
		delivery := &DeliveryError{Err: deliveryErr}
		if dbErr := c.DB.SetDeliveryError(ctx, run.RunID, db.UploadOutcomeUncertainPrefix+deliveryErr.Error()); dbErr != nil {
			return UploadResult{}, errors.Join(delivery, fmt.Errorf("record delivery error: %w", dbErr))
		}
		return UploadResult{}, delivery
	}
	return result, nil
}
