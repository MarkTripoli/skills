package channel

import (
	"errors"
	"testing"
)

func TestParseDefault(t *testing.T) {
	cases := []struct {
		name    string
		md      string
		want    Ref
		wantErr error
	}{
		{name: "one line by name", md: "# Repo\n\nSlack default channel: #agent-runs\n", want: Ref{Name: "agent-runs"}},
		{name: "one line by id", md: "Slack default channel: C0123456789\n", want: Ref{ID: "C0123456789"}},
		{name: "crlf line endings", md: "Slack default channel: #ops\r\nOther: x\r\n", want: Ref{Name: "ops"}},
		{name: "none", md: "# Repo\nNo directive here.\n", wantErr: ErrNoDirective},
		{name: "two", md: "Slack default channel: #a\nSlack default channel: #b\n", wantErr: ErrDuplicateDirective},
		{name: "indented does not match", md: "  Slack default channel: #a\n", wantErr: ErrNoDirective},
		{name: "lowercase label does not match", md: "slack default channel: #a\n", wantErr: ErrNoDirective},
		{name: "trailing text does not match", md: "Slack default channel: #a please\n", wantErr: ErrNoDirective},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ParseDefault([]byte(tc.md))
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("err = %v, want %v", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got != tc.want {
				t.Fatalf("ref = %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestParseRef(t *testing.T) {
	cases := []struct {
		in      string
		want    Ref
		wantErr bool
	}{
		{in: "C0123456789", want: Ref{ID: "C0123456789"}},
		{in: "G0ABCDEFGH", want: Ref{ID: "G0ABCDEFGH"}},
		{in: "#Agent-Runs", want: Ref{Name: "agent-runs"}},
		{in: "agent-runs", want: Ref{Name: "agent-runs"}},
		{in: "C123", want: Ref{Name: "c123"}}, // too short for an ID; treated as a name
		{in: "", wantErr: true},
		{in: "#", wantErr: true},
		{in: "C0123456789,C9876543210", wantErr: true},
		{in: "agent runs", wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, err := ParseRef(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("ParseRef(%q) = %+v, want error", tc.in, got)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got != tc.want {
				t.Fatalf("ParseRef(%q) = %+v, want %+v", tc.in, got, tc.want)
			}
		})
	}
}
