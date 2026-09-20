package wizard

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
)

type Setup struct {
	In    io.Reader
	Out   io.Writer
	Write func(Model) error
	// Compensate removes only state created by Write. It is called when a
	// later setup action fails, or when Write reports a partial failure.
	Compensate     func(Model) error
	InstallService func() error
	StopService    func() error
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
	if err := s.Write(m); err != nil {
		if s.Compensate != nil {
			return errors.Join(err, s.Compensate(m))
		}
		return err
	}
	if s.InstallService == nil {
		return nil
	}
	if err := s.InstallService(); err != nil {
		if s.StopService != nil {
			_ = s.StopService()
		}
		if s.Compensate != nil {
			return errors.Join(err, s.Compensate(m))
		}
		return err
	}
	return nil
}
