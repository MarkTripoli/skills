// Package channel turns a channel override or the root AGENTS.md directive
// into one Slack channel ID the bot can post in.
package channel

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// Ref names a channel by ID or by name; exactly one field is set.
type Ref struct {
	ID   string
	Name string
}

// String renders the reference the way a person wrote it: the ID, or "#name".
func (r Ref) String() string {
	if r.ID != "" {
		return r.ID
	}
	return "#" + r.Name
}

var idPattern = regexp.MustCompile(`^[CG][A-Z0-9]{8,}$`)

// ParseRef reads "C…" or "G…" as an ID and "#name" or "name" as a lowercased
// name. Empty values and values with whitespace or commas are rejected: a
// flag holds one channel, and "a,b" or "a b" is two.
func ParseRef(s string) (Ref, error) {
	if s == "" {
		return Ref{}, errors.New("channel is empty")
	}
	if strings.ContainsAny(s, " \t,") {
		return Ref{}, fmt.Errorf("channel %q must name one channel without spaces or commas", s)
	}
	if idPattern.MatchString(s) {
		return Ref{ID: s}, nil
	}
	name := strings.ToLower(strings.TrimPrefix(s, "#"))
	if name == "" {
		return Ref{}, fmt.Errorf("channel %q has no name after #", s)
	}
	return Ref{Name: name}, nil
}
