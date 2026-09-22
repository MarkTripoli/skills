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
	// calls records every request other than chat.postMessage and
	// conversations.list by API method name, with its bearer token.
	calls []fakeCall
	// postReply, when set, replaces the default chat.postMessage body.
	postReply string
	// manifestReply, when set, replaces the default apps.manifest.* body.
	manifestReply string
}

type fakeCall struct {
	method string
	bearer string
	form   url.Values
}

// record parses the form and appends one fakeCall for r.
func (f *fakeSlack) record(r *http.Request) fakeCall {
	_ = r.ParseForm()
	call := fakeCall{
		method: strings.TrimPrefix(r.URL.Path, "/"),
		bearer: strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "),
		form:   r.PostForm,
	}
	f.mu.Lock()
	f.calls = append(f.calls, call)
	f.mu.Unlock()
	return call
}

// call returns the single recorded request for method and fails otherwise.
func (f *fakeSlack) call(t *testing.T, method string) fakeCall {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	var found []fakeCall
	for _, c := range f.calls {
		if c.method == method {
			found = append(found, c)
		}
	}
	if len(found) != 1 {
		t.Fatalf("%s called %d times, want 1", method, len(found))
	}
	return found[0]
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
	mux.HandleFunc("/chat.update", func(w http.ResponseWriter, r *http.Request) {
		call := f.record(r)
		_, _ = w.Write([]byte(`{"ok":true,"channel":"` + call.form.Get("channel") + `","ts":"` + call.form.Get("ts") + `","text":"` + call.form.Get("text") + `"}`))
	})
	mux.HandleFunc("/reactions.add", func(w http.ResponseWriter, r *http.Request) {
		f.record(r)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/conversations.open", func(w http.ResponseWriter, r *http.Request) {
		f.record(r)
		_, _ = w.Write([]byte(`{"ok":true,"channel":{"id":"D0000000001"}}`))
	})
	const userJSON = `{"id":"U0000000001","real_name":"Ada Lovelace","tz":"Europe/London","profile":{"real_name":"Ada Lovelace","display_name":"ada"}}`
	mux.HandleFunc("/users.lookupByEmail", func(w http.ResponseWriter, r *http.Request) {
		f.record(r)
		_, _ = w.Write([]byte(`{"ok":true,"user":` + userJSON + `}`))
	})
	mux.HandleFunc("/users.info", func(w http.ResponseWriter, r *http.Request) {
		call := f.record(r)
		if call.form.Get("user") == "U0000000002" {
			_, _ = w.Write([]byte(`{"ok":true,"user":{"id":"U0000000002","real_name":"No Display","tz":"UTC","profile":{"real_name":"No Display","display_name":""}}}`))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true,"user":` + userJSON + `}`))
	})
	manifest := func(w http.ResponseWriter, r *http.Request) {
		call := f.record(r)
		f.mu.Lock()
		reply := f.manifestReply
		f.mu.Unlock()
		if reply == "" {
			appID := call.form.Get("app_id")
			if appID == "" {
				appID = "A0000000001"
			}
			reply = `{"ok":true,"app_id":"` + appID + `","oauth_authorize_url":"https://t.slack.com/oauth/v2/authorize?client_id=1&scope=chat:write"}`
		}
		_, _ = w.Write([]byte(reply))
	}
	mux.HandleFunc("/apps.manifest.create", manifest)
	mux.HandleFunc("/apps.manifest.update", manifest)
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

// wantForm checks each key of the call's form and, when bearer is set, the
// Authorization header. SDK-backed calls carry the bot token as the `token`
// form field instead; wantBotForm asserts that.
func wantForm(t *testing.T, call fakeCall, bearer string, fields map[string]string) {
	t.Helper()
	if bearer != "" && call.bearer != bearer {
		t.Errorf("%s Authorization bearer = %q, want %q", call.method, call.bearer, bearer)
	}
	for key, want := range fields {
		if got := call.form.Get(key); got != want {
			t.Errorf("%s form %s = %q, want %q", call.method, key, got, want)
		}
	}
}

func wantBotForm(t *testing.T, call fakeCall, fields map[string]string) {
	t.Helper()
	fields["token"] = "xoxb-1"
	wantForm(t, call, "", fields)
}

func TestUpdateMessage(t *testing.T) {
	f := &fakeSlack{}
	c := newClient(t, f)
	ts, err := c.UpdateMessage(context.Background(), "D1", "1700000000.000100", "*Done*")
	if err != nil {
		t.Fatal(err)
	}
	if ts != "1700000000.000100" {
		t.Fatalf("UpdateMessage ts = %q", ts)
	}
	wantBotForm(t, f.call(t, "chat.update"), map[string]string{"channel": "D1", "ts": "1700000000.000100", "text": "*Done*", "unfurl_links": "false"})
}

func TestAddReaction(t *testing.T) {
	f := &fakeSlack{}
	c := newClient(t, f)
	if err := c.AddReaction(context.Background(), "D1", "1700000000.000100", "eyes"); err != nil {
		t.Fatal(err)
	}
	wantBotForm(t, f.call(t, "reactions.add"), map[string]string{"channel": "D1", "timestamp": "1700000000.000100", "name": "eyes"})
}

func TestOpenConversation(t *testing.T) {
	f := &fakeSlack{}
	c := newClient(t, f)
	id, err := c.OpenConversation(context.Background(), "U0000000001")
	if err != nil {
		t.Fatal(err)
	}
	if id != "D0000000001" {
		t.Fatalf("OpenConversation = %q", id)
	}
	wantBotForm(t, f.call(t, "conversations.open"), map[string]string{"users": "U0000000001"})
}

func TestLookupUserByEmail(t *testing.T) {
	f := &fakeSlack{}
	c := newClient(t, f)
	u, err := c.LookupUserByEmail(context.Background(), "ada@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if u != (User{ID: "U0000000001", DisplayName: "ada", TZ: "Europe/London"}) {
		t.Fatalf("LookupUserByEmail = %+v", u)
	}
	wantBotForm(t, f.call(t, "users.lookupByEmail"), map[string]string{"email": "ada@example.com"})
}

func TestUserInfoFallsBackToRealName(t *testing.T) {
	f := &fakeSlack{}
	c := newClient(t, f)
	ctx := context.Background()
	u, err := c.UserInfo(ctx, "U0000000001")
	if err != nil {
		t.Fatal(err)
	}
	if u != (User{ID: "U0000000001", DisplayName: "ada", TZ: "Europe/London"}) {
		t.Fatalf("UserInfo = %+v", u)
	}
	wantBotForm(t, f.call(t, "users.info"), map[string]string{"user": "U0000000001"})

	f2 := &fakeSlack{}
	c2 := newClient(t, f2)
	u, err = c2.UserInfo(ctx, "U0000000002")
	if err != nil {
		t.Fatal(err)
	}
	if u != (User{ID: "U0000000002", DisplayName: "No Display", TZ: "UTC"}) {
		t.Fatalf("UserInfo without display_name = %+v", u)
	}
}

func TestManifestCreate(t *testing.T) {
	f := &fakeSlack{}
	c := newClient(t, f)
	const yaml = "display_information:\n  name: slack-coordinator\n"
	res, err := c.ManifestCreate(context.Background(), "xoxe.xoxp-config", yaml)
	if err != nil {
		t.Fatal(err)
	}
	if res != (ManifestResult{AppID: "A0000000001", InstallURL: "https://t.slack.com/oauth/v2/authorize?client_id=1&scope=chat:write"}) {
		t.Fatalf("ManifestCreate = %+v", res)
	}
	call := f.call(t, "apps.manifest.create")
	wantForm(t, call, "xoxe.xoxp-config", map[string]string{"manifest": yaml})
	if _, set := call.form["app_id"]; set {
		t.Error("apps.manifest.create sent app_id")
	}
	if _, set := call.form["token"]; set {
		t.Error("apps.manifest.create sent token in the form; the bearer header carries it")
	}
}

func TestManifestUpdate(t *testing.T) {
	f := &fakeSlack{}
	c := newClient(t, f)
	const yaml = "display_information:\n  name: slack-coordinator\n"
	res, err := c.ManifestUpdate(context.Background(), "xoxe.xoxp-config", "A0000000042", yaml)
	if err != nil {
		t.Fatal(err)
	}
	if res.AppID != "A0000000042" || res.InstallURL == "" {
		t.Fatalf("ManifestUpdate = %+v", res)
	}
	wantForm(t, f.call(t, "apps.manifest.update"), "xoxe.xoxp-config", map[string]string{"app_id": "A0000000042", "manifest": yaml})
}

func TestManifestCreateSurfacesSlackError(t *testing.T) {
	f := &fakeSlack{manifestReply: `{"ok":false,"error":"invalid_auth"}`}
	c := newClient(t, f)
	_, err := c.ManifestCreate(context.Background(), "xoxe.bad", "display_information: {}\n")
	if err == nil || !strings.Contains(err.Error(), "invalid_auth") {
		t.Fatalf("ManifestCreate error = %v, want invalid_auth", err)
	}
}
