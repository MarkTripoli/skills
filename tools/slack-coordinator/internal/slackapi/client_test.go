package slackapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
)

type fakeSlack struct {
	mu    sync.Mutex
	posts []url.Values
	lists []url.Values
	// postReply, when set, replaces the default chat.postMessage body.
	postReply string
}

func (f *fakeSlack) handler(t *testing.T) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/auth.test", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"ok":true,"url":"https://t.slack.com/","team":"T","user":"bot","team_id":"T1","user_id":"UBOT","bot_id":"B1"}`))
	})
	mux.HandleFunc("/apps.connections.open", func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer xapp-1" {
			t.Errorf("apps.connections.open Authorization = %q", got)
		}
		_, _ = w.Write([]byte(`{"ok":true,"url":"wss://example.invalid/link"}`))
	})
	mux.HandleFunc("/chat.postMessage", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Error(err)
		}
		f.mu.Lock()
		f.posts = append(f.posts, r.PostForm)
		reply := f.postReply
		f.mu.Unlock()
		if reply == "" {
			reply = `{"ok":true,"channel":"` + r.PostForm.Get("channel") + `","ts":"1700000000.000100"}`
		}
		_, _ = w.Write([]byte(reply))
	})
	mux.HandleFunc("/chat.getPermalink", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		_, _ = w.Write([]byte(`{"ok":true,"channel":"` + q.Get("channel") + `","permalink":"https://t.slack.com/archives/` + q.Get("channel") + `/p` + strings.ReplaceAll(q.Get("message_ts"), ".", "") + `"}`))
	})
	mux.HandleFunc("/conversations.info", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.PostForm.Get("channel") != "C0000000001" {
			_, _ = w.Write([]byte(`{"ok":false,"error":"channel_not_found"}`))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true,"channel":{"id":"C0000000001","name":"agent-runs","is_archived":false,"is_member":true}}`))
	})
	mux.HandleFunc("/conversations.list", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.mu.Lock()
		f.lists = append(f.lists, r.PostForm)
		f.mu.Unlock()
		if r.PostForm.Get("cursor") == "" {
			_, _ = w.Write([]byte(`{"ok":true,"channels":[{"id":"C0000000001","name":"agent-runs","is_member":true}],"response_metadata":{"next_cursor":"page2"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true,"channels":[{"id":"C0000000002","name":"archive","is_archived":true,"is_member":false}],"response_metadata":{"next_cursor":""}}`))
	})
	return mux
}

func newClient(t *testing.T, f *fakeSlack) *Client {
	srv := httptest.NewServer(f.handler(t))
	t.Cleanup(srv.Close)
	return New(config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: srv.URL})
}

func TestSetupProbesAndPostsThroughFakeServer(t *testing.T) {
	f := &fakeSlack{}
	c := newClient(t, f)
	ctx := context.Background()

	auth, err := c.AuthTest(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if auth.User != "bot" || auth.Team != "T" {
		t.Fatalf("AuthTest = %+v", auth)
	}
	if err := c.ProbeSocketMode(ctx); err != nil {
		t.Fatal(err)
	}

	ts, err := c.PostMessage(ctx, "C1", "1699999999.000001", "*Work:* x")
	if err != nil {
		t.Fatal(err)
	}
	if ts != "1700000000.000100" {
		t.Fatalf("PostMessage ts = %q", ts)
	}
	if len(f.posts) != 1 {
		t.Fatalf("chat.postMessage called %d times", len(f.posts))
	}
	form := f.posts[0]
	for key, want := range map[string]string{"channel": "C1", "thread_ts": "1699999999.000001", "text": "*Work:* x", "unfurl_links": "false"} {
		if got := form.Get(key); got != want {
			t.Errorf("form %s = %q, want %q", key, got, want)
		}
	}

	link, err := c.Permalink(ctx, "C1", ts)
	if err != nil {
		t.Fatal(err)
	}
	if link != "https://t.slack.com/archives/C1/p1700000000000100" {
		t.Fatalf("Permalink = %q", link)
	}
}

func TestRootPostOmitsThreadTS(t *testing.T) {
	f := &fakeSlack{}
	c := newClient(t, f)
	if _, err := c.PostMessage(context.Background(), "C1", "", "root"); err != nil {
		t.Fatal(err)
	}
	if _, set := f.posts[0]["thread_ts"]; set {
		t.Fatal("root post sent thread_ts")
	}
}

func TestSlackErrorSurfaces(t *testing.T) {
	f := &fakeSlack{postReply: `{"ok":false,"error":"channel_not_found"}`}
	c := newClient(t, f)
	_, err := c.PostMessage(context.Background(), "C404", "", "x")
	if err == nil || !strings.Contains(err.Error(), "channel_not_found") {
		t.Fatalf("PostMessage error = %v, want channel_not_found", err)
	}
}

func TestConversationLookups(t *testing.T) {
	f := &fakeSlack{}
	c := newClient(t, f)
	ctx := context.Background()

	ch, err := c.ConversationInfo(ctx, "C0000000001")
	if err != nil {
		t.Fatal(err)
	}
	if ch.ID != "C0000000001" || ch.Name != "agent-runs" || !ch.IsMember || ch.IsArchived {
		t.Fatalf("ConversationInfo = %+v", ch)
	}
	if _, err := c.ConversationInfo(ctx, "C0000000009"); err == nil || !strings.Contains(err.Error(), "channel_not_found") {
		t.Fatalf("ConversationInfo unknown error = %v", err)
	}

	page, next, err := c.ListConversations(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(page) != 1 || page[0].Name != "agent-runs" || next != "page2" {
		t.Fatalf("first page = %+v next %q", page, next)
	}
	page, next, err = c.ListConversations(ctx, next)
	if err != nil {
		t.Fatal(err)
	}
	if len(page) != 1 || !page[0].IsArchived || next != "" {
		t.Fatalf("second page = %+v next %q", page, next)
	}
	if len(f.lists) != 2 {
		t.Fatalf("conversations.list called %d times", len(f.lists))
	}
	for key, want := range map[string]string{"types": "public_channel,private_channel", "limit": "200", "cursor": "page2"} {
		if got := f.lists[1].Get(key); got != want {
			t.Errorf("conversations.list %s = %q, want %q", key, got, want)
		}
	}
	if _, set := f.lists[0]["exclude_archived"]; set {
		t.Error("conversations.list sent exclude_archived; archived channels must be listed so the resolver can name the cause")
	}
}
