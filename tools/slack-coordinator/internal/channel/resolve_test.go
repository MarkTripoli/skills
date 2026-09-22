package channel

import (
	"context"
	"strings"
	"testing"

	"github.com/slack-go/slack"
)

// fakeLookup serves conversations.info from byID and conversations.list one
// channel per page, so a name match on a later page exercises the cursor.
type fakeLookup struct {
	channels  []slack.Channel
	listCalls int
}

func mkChannel(id, name string, archived, member bool) slack.Channel {
	var ch slack.Channel
	ch.ID = id
	ch.Name = name
	ch.IsArchived = archived
	ch.IsMember = member
	return ch
}

func (f *fakeLookup) ConversationInfo(_ context.Context, id string) (*slack.Channel, error) {
	for i := range f.channels {
		if f.channels[i].ID == id {
			return &f.channels[i], nil
		}
	}
	return nil, slack.SlackErrorResponse{Err: "channel_not_found"}
}

func (f *fakeLookup) ListConversations(_ context.Context, cursor string) ([]slack.Channel, string, error) {
	f.listCalls++
	i := 0
	if cursor != "" {
		i = int(cursor[0] - '0')
	}
	if i >= len(f.channels) {
		return nil, "", nil
	}
	next := ""
	if i+1 < len(f.channels) {
		next = string(rune('0' + i + 1))
	}
	return f.channels[i : i+1], next, nil
}

func TestResolve(t *testing.T) {
	l := &fakeLookup{channels: []slack.Channel{
		mkChannel("C0000000001", "open", false, true),
		mkChannel("C0000000002", "archived", true, true),
		mkChannel("C0000000003", "outside", false, false),
		mkChannel("C0000000004", "deep", false, true),
	}}
	cases := []struct {
		name    string
		ref     Ref
		wantID  string
		wantErr string
	}{
		{name: "id member", ref: Ref{ID: "C0000000001"}, wantID: "C0000000001"},
		{name: "id archived", ref: Ref{ID: "C0000000002"}, wantErr: "channel #archived is archived"},
		{name: "id not member", ref: Ref{ID: "C0000000003"}, wantErr: "bot is not a member of #outside"},
		{name: "id unknown", ref: Ref{ID: "C0000000009"}, wantErr: "channel C0000000009 not found"},
		{name: "name on later page", ref: Ref{Name: "deep"}, wantID: "C0000000004"},
		{name: "name archived", ref: Ref{Name: "archived"}, wantErr: "channel #archived is archived"},
		{name: "name not member", ref: Ref{Name: "outside"}, wantErr: "bot is not a member of #outside"},
		{name: "name unknown", ref: Ref{Name: "nowhere"}, wantErr: "channel #nowhere not found"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			id, err := Resolve(context.Background(), l, tc.ref)
			if tc.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("err = %v, want %q", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if id != tc.wantID {
				t.Fatalf("id = %q, want %q", id, tc.wantID)
			}
		})
	}
}

func TestResolveByNamePagesUntilMatch(t *testing.T) {
	l := &fakeLookup{channels: []slack.Channel{
		mkChannel("C0000000001", "a", false, true),
		mkChannel("C0000000002", "b", false, true),
		mkChannel("C0000000003", "c", false, true),
	}}
	if _, err := Resolve(context.Background(), l, Ref{Name: "b"}); err != nil {
		t.Fatal(err)
	}
	if l.listCalls != 2 {
		t.Fatalf("conversations.list called %d times, want 2 (stop at match)", l.listCalls)
	}
	l.listCalls = 0
	if _, err := Resolve(context.Background(), l, Ref{Name: "zzz"}); err == nil {
		t.Fatal("unknown name resolved")
	}
	if l.listCalls != 3 {
		t.Fatalf("conversations.list called %d times, want 3 (every page)", l.listCalls)
	}
}
