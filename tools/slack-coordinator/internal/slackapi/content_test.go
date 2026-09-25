package slackapi

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
)

func TestContentReadAndUpload(t *testing.T) {
	var server *httptest.Server
	var uploaded, completed bool
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/files.list":
			if r.FormValue("channel") != "C1" || r.FormValue("page") != "2" {
				t.Errorf("files.list form: %v", r.Form)
			}
			io.WriteString(w, `{"ok":true,"files":[{"id":"F1","title":"Notes","permalink":"https://slack.test/F1"}],"paging":{"pages":2}}`)
		case "/files.info":
			io.WriteString(w, `{"ok":true,"file":{"id":"FCanvas","permalink":"https://slack.test/canvas"}}`)
		case "/bookmarks.list":
			if r.FormValue("channel_id") != "C1" {
				t.Errorf("bookmarks channel: %s", r.FormValue("channel_id"))
			}
			io.WriteString(w, `{"ok":true,"bookmarks":[{"id":"B1","title":"Links","link":"https://example.org"}]}`)
		case "/slackLists.items.list":
			if r.Header.Get("Authorization") != "Bearer xoxb-test" || r.FormValue("list_id") != "FList" || r.FormValue("cursor") != "next" || r.FormValue("include_list") != "true" {
				t.Errorf("list request: %v %v", r.Header, r.Form)
			}
			io.WriteString(w, `{"ok":true,"items":[{"id":"Rec1","fields":[{"link":[{"originalUrl":"https://example.org"}]}]}],"response_metadata":{"next_cursor":""}}`)
		case "/files.getUploadURLExternal":
			if r.FormValue("filename") != "hello.txt" || r.FormValue("length") != "5" {
				t.Errorf("upload URL form: %v", r.Form)
			}
			fmt.Fprintf(w, `{"ok":true,"upload_url":%q,"file_id":"F2"}`, server.URL+"/upload")
		case "/upload":
			b, _ := io.ReadAll(r.Body)
			uploaded = strings.Contains(string(b), "hello")
			io.WriteString(w, "OK")
		case "/files.completeUploadExternal":
			completed = uploaded && r.FormValue("channel_id") == "C1" && r.FormValue("thread_ts") == "123.456" && strings.Contains(r.FormValue("files"), `"title":"Hello"`)
			io.WriteString(w, `{"ok":true,"files":[{"id":"F2","title":"Hello"}]}`)
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
			io.WriteString(w, `{"ok":false}`)
		}
	}))
	defer server.Close()
	c := New(config.Slack{BotToken: "xoxb-test", APIURL: server.URL})
	files, paging, err := c.Files(context.Background(), "C1", 2)
	if err != nil || len(files) != 1 || files[0].Permalink == "" || paging.Pages != 2 {
		t.Fatalf("files: %v %v %v", files, paging, err)
	}
	canvas, err := c.FileInfo(context.Background(), "FCanvas")
	if err != nil || canvas.Permalink != "https://slack.test/canvas" {
		t.Fatalf("canvas: %+v %v", canvas, err)
	}
	links, err := c.Bookmarks(context.Background(), "C1")
	if err != nil || len(links) != 1 || links[0].Link != "https://example.org" {
		t.Fatalf("bookmarks: %v %v", links, err)
	}
	items, err := c.ListItems(context.Background(), "FList", "next")
	if err != nil || !strings.Contains(string(items), "Rec1") || !strings.Contains(string(items), "originalUrl") {
		t.Fatalf("items: %s %v", items, err)
	}
	file, err := c.UploadContent(context.Background(), "C1", "123.456", "hello.txt", "Hello", strings.NewReader("hello"), 5)
	if err != nil || file.ID != "F2" || !completed {
		t.Fatalf("upload: %v %v completed=%v", file, err, completed)
	}
}
