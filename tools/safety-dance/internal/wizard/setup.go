package wizard

import (
	"context"
	"fmt"
	"io"
	"strings"
)

type Setup struct {
	In    io.Reader
	Out   io.Writer
	Write func(Model) error
}

func (s Setup) Run(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if s.In == nil || s.Out == nil || s.Write == nil {
		return fmt.Errorf("wizard requires input, output, and writer")
	}
	m := Model{}
	prompts := []struct {
		dst   *string
		label string
	}{{&m.Upstream, "upstream"}, {&m.Gate, "gate"}, {&m.Provider, "provider"}}
	for _, p := range prompts {
		fmt.Fprintf(s.Out, "%s: ", p.label)
		var v string
		if _, err := fmt.Fscanln(s.In, &v); err != nil {
			return err
		}
		*p.dst = strings.TrimSpace(v)
		if err := ctx.Err(); err != nil {
			return err
		}
	}
	return s.Write(m)
}
