package channel

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
)

// ErrNoDirective is returned when AGENTS.md holds no `Slack default channel:` line.
var ErrNoDirective = errors.New("no `Slack default channel:` line")

// ErrDuplicateDirective is returned when AGENTS.md holds more than one such line.
var ErrDuplicateDirective = errors.New("more than one `Slack default channel:` line")

// directiveLine matches one whole line. The anchors are applied per line, so
// an indented or prefixed line does not match, and the label is case-sensitive.
var directiveLine = regexp.MustCompile(`^Slack default channel: (\S+)$`)

// ParseDefault returns the single directive in agentsMD. Zero lines is
// ErrNoDirective; two or more is ErrDuplicateDirective.
func ParseDefault(agentsMD []byte) (Ref, error) {
	var value string
	matches := 0
	for _, line := range bytes.Split(agentsMD, []byte("\n")) {
		line = bytes.TrimSuffix(line, []byte("\r"))
		m := directiveLine.FindSubmatch(line)
		if m == nil {
			continue
		}
		matches++
		value = string(m[1])
	}
	switch matches {
	case 0:
		return Ref{}, ErrNoDirective
	case 1:
		ref, err := ParseRef(value)
		if err != nil {
			return Ref{}, fmt.Errorf("`Slack default channel:` directive: %w", err)
		}
		return ref, nil
	default:
		return Ref{}, ErrDuplicateDirective
	}
}
