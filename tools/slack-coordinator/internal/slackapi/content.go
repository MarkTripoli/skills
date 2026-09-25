package slackapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/slack-go/slack"
)

func (c *Client) Files(ctx context.Context, channel string, page int) ([]slack.File, *slack.Paging, error) {
	return c.api.GetFilesContext(ctx, slack.GetFilesParameters{Channel: channel, Page: page, Count: 100})
}

func (c *Client) FileInfo(ctx context.Context, id string) (*slack.File, error) {
	file, _, _, err := c.api.GetFileInfoContext(ctx, id, 0, 0)
	return file, err
}

// ListItems returns one Slack List page, retaining the API's typed cell fields.
// The coordinator validates the list against the run channel before calling it.
func (c *Client) ListItems(ctx context.Context, id, cursor string) (json.RawMessage, error) {
	form := url.Values{"list_id": {id}, "limit": {"100"}, "include_list": {"true"}}
	if cursor != "" {
		form.Set("cursor", cursor)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiURL+"slackLists.items.list", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.botToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("slackLists.items.list: HTTP %d", response.StatusCode)
	}
	var body struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (4<<20)+1))
	if err != nil {
		return nil, err
	}
	if len(data) > 4<<20 {
		return nil, fmt.Errorf("slackLists.items.list response exceeds 4 MiB")
	}
	if err := json.Unmarshal(data, &body); err != nil {
		return nil, err
	}
	if !body.OK {
		return nil, fmt.Errorf("slackLists.items.list: %s", body.Error)
	}
	return data, nil
}

func (c *Client) Bookmarks(ctx context.Context, channel string) ([]slack.Bookmark, error) {
	return c.api.ListBookmarksContext(ctx, channel)
}

// UploadContent uses Slack's external upload handshake, not the retired files.upload method.
// Sharing happens only after the bytes have been accepted.
func (c *Client) UploadContent(ctx context.Context, channel, threadTS, name, title string, reader io.Reader, size int64) (slack.FileSummary, error) {
	file, err := c.api.UploadFileContext(ctx, slack.UploadFileParameters{Filename: name, Title: title, Reader: reader, FileSize: int(size), Channel: channel, ThreadTimestamp: threadTS})
	if err != nil {
		return slack.FileSummary{}, err
	}
	return *file, nil
}
